import json
import subprocess
import sys
import os
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

def run_ghaminer(repo):
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        return {"error": "Token GitHub manquant (.env)"}

    start_date = "2024-01-01"
    end_date = "2025-10-01"
    repo_url = f"https://github.com/{repo}"

    output_csv = os.path.join("builds_features.csv")

    # Supprime l'ancien CSV avant chaque exécution
    if os.path.exists(output_csv):
        os.remove(output_csv)

    command = [
        "python",
        "GHAminer/src/GHAMetrics.py",
        "-t", token,
        "-s", repo_url,
        "-fd", start_date,
        "-td", end_date
    ]

    print(f" Running: {' '.join(command)}", flush=True)
    subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="ignore")

    # Vérifie si le CSV a été créé
    if not os.path.exists(output_csv):
        return {"error": "Fichier CSV non trouvé — GHAminer n’a pas produit de sortie."}

    # Lis le CSV avec pandas
    try:
        df = pd.read_csv(output_csv)

        total_runs = len(df)
        success = len(df[df['conclusion'] == 'success'])
        failed = len(df[df['conclusion'] == 'failure'])
        success_rate = round((success / total_runs * 100), 2) if total_runs > 0 else 0.0

        return {
            "repo": repo,
            "total_runs": total_runs,
            "successful": success,
            "failed": failed,
            "success_rate": success_rate
        }

    except Exception as e:
        return {"error": f"Erreur lors de la lecture du CSV : {e}"}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Aucun dépôt fourni"}))
        sys.exit(1)

    repo = sys.argv[1]
    result = run_ghaminer(repo)
    print(json.dumps(result, ensure_ascii=False))
