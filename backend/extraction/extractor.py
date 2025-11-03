import subprocess
import pandas as pd
import os
import datetime

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
