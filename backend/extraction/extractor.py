from models import WorkflowRun

import pandas as pd

import subprocess
import os
import datetime
from typing import AsyncIterator

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

def async_extract_data(repo_url: str, token:str, from_date: datetime.datetime, to_date: datetime.datetime) -> tuple[list[WorkflowRun], AsyncIterator[WorkflowRun]]:
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
    iter = _execute_ghaminer_async(repo_url, token, miner_start_date, miner_end_date)
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

    pass

def _execute_ghaminer_async(repo_url: str, token:str, from_date: datetime.datetime, to_date: datetime.datetime) -> AsyncIterator[WorkflowRun]:
    """
    Returns an asynchronous iterator that yields the data coming from GHAMiner.

    Args:
        repo_url (str): The name of the GitHub repository.
        token (str): The GitHub API token to use for GHAMiner.
        from_date (datetime): The start time of the search.
        to_date (datetime): The end time of the search (non-inclusive).

    Returns:
        An asynchronous iterator that yields the data coming from GHAMiner.
    """

    pass
