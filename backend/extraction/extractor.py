from sqlalchemy import BigInteger, select
from sqlalchemy.orm import joinedload
from models import WorkflowRun, Workflow, Repository, db
from core.utils.sync import async_tail

import pandas as pd

import subprocess
import os
import datetime
from typing import AsyncIterator
import asyncio

# ---------------------------------------------------------------------------
#  Configuration de base
# ---------------------------------------------------------------------------
GHAMINER_PATH = os.path.join("ghaminer", "src", "GHAMetrics.py")
BUILD_FEATURES_PATH = os.path.join("builds_features.csv")
MERGED_PATH = os.path.join("extraction", "all_builds.csv")
LAST_REPO_FILE = os.path.join("last_repo.txt")

# ---------------------------------------------------------------------------
#  Fonction pour vérifier si un fichier est "trop vieux"
# ---------------------------------------------------------------------------
def needs_refresh(csv_path, max_age_days=1):
    """Retourne True si le CSV est trop vieux ou absent."""
    if not os.path.exists(csv_path):
        return True
    mtime = datetime.datetime.fromtimestamp(os.path.getmtime(csv_path))
    return (datetime.datetime.now() - mtime).days > max_age_days

# --- Lance GHAminer si besoin ---
def run_ghaminer(repo_url, token):
    try:
        print(f" Lancement GHAminer pour {repo_url}...")
        result = subprocess.run([
            "python", "ghaminer/src/GHAMetrics.py",
            "-t", token,
            "-s", f"https://github.com/{repo_url}",
            "-fd", "2024-04-01",
            "-td", "2025-10-31"
        ], capture_output=True, text=True, check=True)

        print(" GHAminer terminé :", result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(" Erreur GHAminer :", e.stderr)
        return False


def extract_data(repo_url, token, from_date, to_date):
    if not os.path.exists(BUILD_FEATURES_PATH):
        return None, "CSV introuvable"

    df = pd.read_csv(BUILD_FEATURES_PATH)

    if "repo" not in df.columns:
        return None, "Colonne 'repo' manquante dans le CSV"

    repo_df = df[df["repo"] == repo_url]

    if repo_df.empty:
        return None, f"Aucune donnée trouvée pour le dépôt {repo_url}"

    # ✅ Nettoyer les mauvaises valeurs avant conversion
    repo_df = repo_df[repo_df["created_at"].astype(str).str.match(r"^\d{4}-\d{2}-\d{2}", na=False)]

    # Conversion + suppression du fuseau horaire si présent
    repo_df["created_at"] = pd.to_datetime(repo_df["created_at"], errors="coerce", utc=True)
    repo_df["created_at"] = repo_df["created_at"].dt.tz_localize(None)

    # Conversion des bornes sans fuseau
    start_date = pd.to_datetime(from_date)
    end_date = pd.to_datetime(to_date)

    # ✅ Comparaison sûre
    repo_df = repo_df[
        (repo_df["created_at"] >= start_date) &
        (repo_df["created_at"] <= end_date)
    ]

    if repo_df.empty:
        return None, "Aucune donnée dans la plage de dates sélectionnée"

    return repo_df, None

def async_extract_data(repo_url: str, token:str, from_date: datetime.datetime, to_date: datetime.datetime, cancellation: asyncio.Event) -> tuple[list[WorkflowRun], AsyncIterator[WorkflowRun]]:
    """
    Returns a list of raw workflow runs that were already in the database,
    and returns an asynchronous iterator that yields the data that was not in
    the database, coming from GHAMiner.

    This function will also add the new data to the database.

    Args:
        repo_url (str): The name of the GitHub repository.
        token (str): The GitHub API token to use for GHAMiner.
        from_date (datetime): The start time of the search.
        to_date (datetime): The end time of the search (non-inclusive).
        cancellation (asyncio.Event): An event to stop the search at any time.

    Returns:
        A tuple whose first element is a list of raw workflow runs that were
        already in the database, and whose second element is an asynchronous
        iterator that yields the data that was not in the database, coming from
        GHAMiner.
    """

    db_data = _get_data_from_db(repo_url, from_date, to_date)
    if len(db_data) > 0:
        miner_start_date: datetime.datetime = db_data[-1].created_at
    else:
        miner_start_date = from_date

    miner_end_date = to_date

    if miner_start_date >= miner_end_date:
        class EmptyAsyncIter:
            def __aiter__(self) -> 'EmptyAsyncIter':
                return self

            async def __anext__(self) -> WorkflowRun:
                raise StopAsyncIteration

        return (db_data, EmptyAsyncIter())

    # FIXME: It could happen that we're missing data BEFORE, we're only
    # checking for missing data after
    iter = _execute_ghaminer_async(repo_url, token, miner_start_date, miner_end_date, cancellation)
    return (db_data, iter)


def _get_data_from_db(repo_url: str, from_date: datetime.datetime, to_date: datetime.datetime) -> list[WorkflowRun]:
    """
    Returns a list of raw workflow runs from the database, in chronological
    order (the oldest run should be at the end of the list).

    Args:
        repo_url (str): The name of the GitHub repository.
        from_date (datetime): The start time of the search.
        to_date (datetime): The end time of the search (non-inclusive).

    Returns:
        A list of raw workflow runs from the database.
    """

    repo = db.session.execute(
        select(Repository).where(Repository.repo_name == repo_url)
    ).scalar_one_or_none()

    if repo == None:
        return []

    return list(repo.runs)

async def _execute_ghaminer_async(repo_url: str, token:str, from_date: datetime.datetime, to_date: datetime.datetime, cancellation: asyncio.Event) -> AsyncIterator[WorkflowRun]:
    """
    Returns an asynchronous iterator that yields the data coming from GHAMiner.

    Args:
        repo_url (str): The name of the GitHub repository.
        token (str): The GitHub API token to use for GHAMiner.
        from_date (datetime): The start time of the search.
        to_date (datetime): The end time of the search (non-inclusive).
        cancellation (asyncio.Event): An event to stop the search at any time.

    Returns:
        An asynchronous iterator that yields the data coming from GHAMiner.
    """

    with open(BUILD_FEATURES_PATH, 'r') as f:
        tail = async_tail(f, cancellation)

        cmd = [
            "python", "ghaminer/src/GHAMetrics.py",
            "-t", token,
            "-s", f"https://github.com/{repo_url}",
            "-fd", from_date.date().isoformat(),
            "-td", to_date.date().isoformat()
        ]
        gha_miner = await asyncio.create_subprocess_exec(*cmd)

        async for item in tail:
            if item.startswith("repo,"):
                # GHAMiner added the labels, we cant parse this line
                continue

            try:
                run = _generate_models_from_series(item)
            except Exception as e:
                gha_miner.kill()
                raise e

            # Failsafe, if GHAminer returns runs outside the range for some reason
            # NOTE: GHAminer returns runs in reverse chronological order
            if run.created_at >= to_date:
                continue

            if run.created_at < from_date:
                logging.getLogger('flask.app').warning(f"created_at ({run.created_at.isoformat()}) < from_date({from_date.isoformat()})");
                gha_miner.kill()
                break

            yield run

        gha_miner.kill()

def _generate_models_from_series(line: str) -> WorkflowRun:
    """
    Takes a line from a CSV file generated by GHAMiner and adds all the
    necessary entries in the database. Returns the final, parsed workflow run.

    Args:
        line (str): The line to parse from the CSV file.

    Returns:
        The final, parsed workflow run.
    """

    line_values = line.split(",")

    REPO = 0
    ID_BUILD = 1
    WORKFLOW_ID = 2
    ISSUER_NAME = 3
    BRANCH = 4
    COMMIT_SHA = 5
    LANGUAGES = 6
    STATUS = 7
    WORKFLOW_EVENT_TRIGGER = 8
    CONCLUSION = 9
    CREATED_AT = 10
    UPDATED_AT = 11
    BUILD_DURATION = 12
    TOTAL_BUILDS = 13
    GH_FIRST_COMMIT_CREATED_AT = 14
    BUILD_LANGUAGE = 15
    DEPENDENCIES_COUNT = 16
    WORKFLOW_SIZE = 17
    TEST_FRAMEWORK = 18
    WORKFLOW_NAME = 19
    FETCH_DURATION = 20

    repo_name = line_values[REPO]
    repo: Repository | None = Repository.query.filter_by(repo_name=repo_name).one_or_none()
    if repo == None:
        repo = Repository()
        repo.repo_name = repo_name
        repo.owner = repo_name.split('/')[0]
        repo.created_at = datetime.datetime.now()
        repo.updated_at = datetime.datetime.now()

        db.session.add(repo)
        db.session.commit()

    workflow_name = line_values[WORKFLOW_NAME]
    workflow: Workflow | None = Workflow.query.filter_by(workflow_name=workflow_name).one_or_none()
    if workflow == None:
        workflow = Workflow()
        workflow.workflow_name = workflow_name
        workflow.workflow_id = line_values[WORKFLOW_ID]
        workflow.repository_id = repo.id
        workflow.created_at = datetime.datetime.now();
        workflow.updated_at = datetime.datetime.now();

        db.session.add(workflow)
        db.session.commit()

    workflow_run = WorkflowRun()
    workflow_run.id_build = line_values[ID_BUILD]
    workflow_run.workflow_id = workflow.id
    workflow_run.repository_id = repo.id
    workflow_run.branch = line_values[BRANCH]
    workflow_run.commit_sha = line_values[COMMIT_SHA]
    workflow_run.status = line_values[STATUS]
    workflow_run.conclusion = line_values[CONCLUSION]
    workflow_run.workflow_event_trigger = line_values[WORKFLOW_EVENT_TRIGGER]
    workflow_run.issuer_name = line_values[ISSUER_NAME]
    workflow_run.created_at = datetime.datetime.fromisoformat(line_values[CREATED_AT])
    workflow_run.updated_at = datetime.datetime.fromisoformat(line_values[UPDATED_AT])
    workflow_run.build_duration = float(line_values[BUILD_DURATION])

    # No data for these
    workflow_run.gh_pull_req_number = 0
    workflow_run.gh_sloc = 0
    workflow_run.git_num_committers = 0
    workflow_run.git_commits = 0

    db.session.add(workflow_run)
    db.session.commit()

    return workflow_run
