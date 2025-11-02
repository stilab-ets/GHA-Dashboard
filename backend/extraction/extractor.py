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

# ---------------------------------------------------------------------------
# Fonction principale d’extraction
# ---------------------------------------------------------------------------
def extract_data(repo_url, token, from_date="2024-01-01", to_date="2025-12-31"):
    """
    Lance GHAminer pour extraire les données d’un dépôt GitHub donné
    et met à jour le fichier d’historique fusionné.
    """
    print(f" Extraction pour le dépôt : {repo_url}")

    #  Lancer GHAminer avec le repo donné
    try:
        subprocess.run(
            [
                "python",
                GHAMINER_PATH,
                "-t", token,
                "-s", f"https://github.com/{repo_url}",
                "-fd", from_date,
                "-td", to_date
            ],
            check=True
        )
        print(" GHAminer exécuté avec succès.")
    except subprocess.CalledProcessError as e:
        print(f" Erreur lors de l’exécution de GHAminer : {e}")
        return {"error": f"Erreur GHAminer : {e}"}

    # Vérifier que le fichier GHAminer a bien été produit
    if not os.path.exists(BUILD_FEATURES_PATH):
        return {"error": "Fichier builds_features.csv non trouvé — GHAminer n’a pas produit de sortie."}

    # Charger les nouvelles données extraites
    try:
        new_df = pd.read_csv(BUILD_FEATURES_PATH)
    except Exception as e:
        return {"error": f"Erreur de lecture du CSV de GHAminer : {e}"}

    if new_df.empty:
        return {"error": "Aucune donnée trouvée dans le CSV GHAminer."}

    # Ajouter la colonne du dépôt courant si absente
    if "repo" not in new_df.columns:
        new_df["repo"] = repo_url

    #  Fusionner avec l’historique global
    combined_df = merge_with_history(new_df, MERGED_PATH)

    # Sauvegarder le dernier dépôt traité
    with open(LAST_REPO_FILE, "w") as f:
        f.write(repo_url)

    print(f" Données fusionnées. Total lignes : {len(combined_df)}")
    return combined_df.to_dict(orient="records")

# ---------------------------------------------------------------------------
#  Fonction de fusion de CSV
# ---------------------------------------------------------------------------
def merge_with_history(new_df, merged_csv_path):
    """Fusionne le CSV actuel avec l’historique (sans doublons)."""
    if os.path.exists(merged_csv_path):
        try:
            old_df = pd.read_csv(merged_csv_path)
            combined_df = pd.concat([old_df, new_df], ignore_index=True)
            combined_df.drop_duplicates(subset=["commit_sha", "repo"], inplace=True)
        except Exception as e:
            print(" Erreur fusion CSV :", e)
            combined_df = new_df
    else:
        combined_df = new_df

    combined_df.to_csv(merged_csv_path, index=False)
    print(f" Historique mis à jour : {merged_csv_path}")
    return combined_df
