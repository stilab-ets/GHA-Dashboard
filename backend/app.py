from flask import Flask, jsonify, request
import pandas as pd
import os
from extraction.extractor import extract_data

app = Flask(__name__)

CSV_PATH = "builds_features.csv"

# ============================================
# Route de Health Check (pour Docker)
# ============================================
@app.route("/health")
def health():
    """Health check endpoint pour Docker healthcheck"""
    return jsonify({
        "status": "ok",
        "service": "GHA Dashboard Backend",
        "csv_exists": os.path.exists(CSV_PATH)
    }), 200


# ============================================
# Route d'Extraction des Données
# ============================================
@app.route("/api/extraction", methods=["GET"])
def extraction_api():
    """
    Extrait les données GitHub Actions via GHAminer
    Query params: repo (required)
    """
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "Paramètre 'repo' manquant"}), 400

    # Utiliser la variable d'environnement Docker
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        return jsonify({
            "error": "GITHUB_TOKEN non configuré",
            "help": "Vérifier le fichier .env"
        }), 500
    
    # Appel à la fonction d'extraction
    try:
        result = extract_data(repo, token, "2024-04-01", "2025-10-31")
    except Exception as e:
        return jsonify({
            "error": "Erreur lors de l'extraction",
            "detail": str(e)
        }), 500

    # Gestion des retours (DataFrame ou erreur)
    if isinstance(result, tuple):
        df, error = result
        if error:
            return jsonify({"error": error}), 400
        else:
            # Conversion DataFrame → JSON
            return jsonify({
                "success": True,
                "repo": repo,
                "runs_extracted": len(df),
                "data": df.to_dict(orient="records")
            })
    else:
        return jsonify({"error": "Format de retour inattendu"}), 500


# ============================================
# Route des Métriques GitHub
# ============================================
@app.route("/api/github-metrics")
def github_metrics():
    """
    Retourne les métriques d'un repository
    Query params: repo (required)
    """
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "Paramètre 'repo' manquant"}), 400

    # Vérifier si le fichier CSV existe
    if not os.path.exists(CSV_PATH):
        return jsonify({
            "error": f"Fichier {CSV_PATH} introuvable",
            "help": "Exécutez d'abord /api/extraction?repo=<repo>"
        }), 404

    try:
        df = pd.read_csv(CSV_PATH)
    except Exception as e:
        return jsonify({
            "error": "Erreur lors de la lecture du CSV",
            "detail": str(e)
        }), 500

    # Filtrer par repository
    repo_df = df[df["repo"] == repo]

    if repo_df.empty:
        return jsonify({
            "error": "Aucune donnée trouvée pour ce dépôt",
            "repo": repo,
            "available_repos": df["repo"].unique().tolist()
        }), 404

    # Calculer les métriques
    try:
        total_runs = len(repo_df)
        successful_runs = len(repo_df[repo_df["conclusion"] == "success"])
        failed_runs = len(repo_df[repo_df["conclusion"] == "failure"])
        success_rate = round((successful_runs / total_runs) * 100, 2) if total_runs > 0 else 0
        avg_duration = round(repo_df["build_duration"].mean(), 2)
        
        result = {
            "repo": repo,
            "totalRuns": total_runs,
            "successfulRuns": successful_runs,
            "failedRuns": failed_runs,
            "successRate": success_rate,
            "avgDuration": avg_duration,
            "changePercentage": 0  # TODO: calculer le changement par rapport à la période précédente
        }
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "error": "Erreur lors du calcul des métriques",
            "detail": str(e)
        }), 500


# ============================================
# Route de Debug
# ============================================
@app.route("/api/debug")
def debug():
    """Informations de debug pour Docker"""
    return jsonify({
        "environment": {
            "FLASK_ENV": os.getenv("FLASK_ENV"),
            "DB_HOST": os.getenv("DB_HOST"),
            "DB_NAME": os.getenv("DB_NAME"),
            "GITHUB_TOKEN_SET": bool(os.getenv("GITHUB_TOKEN"))
        },
        "files": {
            "csv_exists": os.path.exists(CSV_PATH),
            "csv_path": os.path.abspath(CSV_PATH)
        },
        "working_directory": os.getcwd(),
        "python_version": os.sys.version
    })


# ============================================
# Démarrage de l'Application
# ============================================
if __name__ == "__main__":
    # Utiliser les variables d'environnement pour le port
    port = int(os.getenv("FLASK_RUN_PORT", 3000))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"
    
    print(f"Starting GHA Dashboard Backend on port {port}")
    print(f"CSV Path: {os.path.abspath(CSV_PATH)}")
    print(f"GitHub Token configured: {bool(os.getenv('GITHUB_TOKEN'))}")
    
    app.run(host="0.0.0.0", port=port, debug=debug)