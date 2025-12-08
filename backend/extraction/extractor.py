import logging
import sys
from sqlalchemy import BigInteger, select
from sqlalchemy.orm import joinedload
from models import WorkflowRun, Workflow, Repository, db
from core.utils.sync import async_tail
import requests
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
            "-fd", "2022-04-03",
            "-td", "2025-10-31"
        ], capture_output=True, text=True, check=True)

        print(" GHAminer terminé :", result.stdout)
        return True

    except subprocess.CalledProcessError as e:
        print(" GHAminer FAILED")
        print("STDOUT:", e.stdout)
        print("STDERR:", e.stderr)
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

    # Nettoyer les mauvaises valeurs avant conversion
    repo_df = repo_df[repo_df["created_at"].astype(str).str.match(r"^\d{4}-\d{2}-\d{2}", na=False)]

    # Conversion + suppression du fuseau horaire si présent
    repo_df["created_at"] = pd.to_datetime(repo_df["created_at"], errors="coerce", utc=True)
    repo_df["created_at"] = repo_df["created_at"].dt.tz_localize(None)

    # Conversion des bornes sans fuseau
    start_date = pd.to_datetime(from_date)
    end_date = pd.to_datetime(to_date)

    #  Comparaison sûre
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
                continue

            try:
                run = _generate_models_from_series(item,token)

                run = enrich_run_with_github(run, token)

                # 3. Vérifier encore s'il existe (au cas où enrichissement modifie un ID)
                existing = WorkflowRun.query.filter_by(id_build=run.id_build).one_or_none()
                if existing:
                    # On met à jour l'existant, on ne crée pas un nouveau
                    for attr, value in run.__dict__.items():
                        if not attr.startswith("_") and hasattr(existing, attr):
                            setattr(existing, attr, value)
                    db.session.commit()
                    yield existing
                    continue

                # 4. Ajouter en BD
                db.session.add(run)
                db.session.commit()

                # 5. Stream vers WebSocket
                yield run

            except Exception as e:
                gha_miner.kill()
                raise e

            # Failsafe, if GHAminer returns runs outside the range for some reason
            # NOTE: GHAminer returns runs in reverse chronological order
            if run.created_at >= to_date:
                continue

            if run.created_at < from_date:
                logging.getLogger('flask.app').warning(f"created_at ({run.created_at.isoformat()}) < from_date({from_date.isoformat()})");
                break

            yield run

        gha_miner.kill()



def fetch_all_github_runs(repo, token, max_pages=200):
    """
    Récupère *tous* les workflow runs via l’API GitHub Actions (REST v3)
    avec pagination automatique.
    """
    owner, repo_name = repo.split("/")
    url = f"https://api.github.com/repos/{owner}/{repo_name}/actions/runs"

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json"
    }

    all_runs = []
    page = 1

    while page <= max_pages:
        print(f"📄 Fetching page {page}...")

        params = {
            "per_page": 100,
            "page": page
        }

        r = requests.get(url, headers=headers, params=params)
        
        if r.status_code != 200:
            raise Exception(f"GitHub API error: {r.status_code} → {r.text}")

        data = r.json()

        if "workflow_runs" not in data or len(data["workflow_runs"]) == 0:
            print(" Plus de pages → extraction terminée")
            break

        all_runs.extend(data["workflow_runs"])
        page += 1

    print(f" Récupéré {len(all_runs)} workflow runs pour {repo}")
    return pd.DataFrame(all_runs)

def _generate_models_from_series(line: str, token: str) -> WorkflowRun:
    line_values = line.split(",")

    ID_BUILD = 1
    WORKFLOW_NAME = 19
    BRANCH = 4
    COMMIT_SHA = 5
    STATUS = 7
    WORKFLOW_EVENT_TRIGGER = 8
    CONCLUSION = 9
    CREATED_AT = 10
    UPDATED_AT = 11

    # ------------------------------------
    #  1. Convertir id_build et CHECK doublon
    # ------------------------------------
    id_build = int(line_values[ID_BUILD])
    existing = WorkflowRun.query.filter_by(id_build=id_build).one_or_none()

    if existing:
        
        return existing

    # enrichissement API GitHub
    run = enrich_run_with_github(run, token)
    # ------------------------------------
    # 2. Repository
    # ------------------------------------
    repo_name = line_values[0]
    repo = Repository.query.filter_by(repo_name=repo_name).one_or_none()

    if repo is None:
        repo = Repository(
            repo_name=repo_name,
            owner=repo_name.split("/")[0],
            created_at=datetime.datetime.now(),
            updated_at=datetime.datetime.now()
        )
        db.session.add(repo)
        db.session.commit()

    # ------------------------------------
    # 3. Workflow
    # ------------------------------------
    workflow_name = line_values[WORKFLOW_NAME]
    

    workflow = Workflow.query.filter_by(
        workflow_name=workflow_name,
        repository_id=repo.id
    ).one_or_none()

    if workflow is None:
        workflow = Workflow(
            workflow_name=workflow_name,
            repository_id=repo.id,
            created_at=datetime.datetime.now(),
            updated_at=datetime.datetime.now()
        )
        db.session.add(workflow)
        db.session.commit()

    # ------------------------------------
    # 4. Create new WorkflowRun
    # ------------------------------------
    run = WorkflowRun(
        id_build=id_build,
        workflow_id=workflow.id,
        repository_id=repo.id,
        branch=line_values[BRANCH],
        commit_sha=line_values[COMMIT_SHA],
        status=line_values[STATUS],
        conclusion=line_values[CONCLUSION],
        workflow_event_trigger=line_values[WORKFLOW_EVENT_TRIGGER],
        issuer_name=line_values[3],
        created_at=datetime.datetime.fromisoformat(line_values[CREATED_AT]),
        updated_at=datetime.datetime.fromisoformat(line_values[UPDATED_AT]),
        build_duration=float(line_values[12])
    )

    db.session.add(run)
    db.session.commit()
    return run
def enrich_run_with_github(run: WorkflowRun, token: str):
    """
    Complète un run GHAminer avec les données officielles GitHub Actions.
    """
    owner, repo = run.repository.repo_name.split("/")

    url = f"https://api.github.com/repos/{owner}/{repo}/actions/runs/{run.id_build}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json"
    }

    r = requests.get(url, headers=headers)
    if r.status_code != 200:
        print(f"[WARN] Impossible d'enrichir run {run.id_build}")
        return run

    data = r.json()

    run.branch = data.get("head_branch")
    run.commit_sha = data.get("head_sha")
    run.status = data.get("status")
    run.conclusion = data.get("conclusion")
    run.issuer_name = (data.get("actor") or {}).get("login")
    run.workflow_event_trigger = data.get("event")

    # calcul durée correcte
    created = data.get("created_at")
    updated = data.get("updated_at")
    if created and updated:
        created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        updated_dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        run.build_duration = (updated_dt - created_dt).total_seconds()

    return run
