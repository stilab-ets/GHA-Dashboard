import os
from core.models import AggregationPeriod
import pandas as pd
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import text
from models import db, Repository, Workflow, WorkflowRun
from extraction.extractor import extract_data
from analysis.endpoint import AggregationFilters, send_data
from typing import cast
from datetime import date
import asyncio
from flask_sock import Sock

# Initialisation de l'application Flask
load_dotenv()
app = Flask(__name__)
sock = Sock(app)
CORS(app)

# connexion a la BD du conteneur
app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)

CSV_PATH = "builds_features.csv"

@app.route("/health")
def health():
    """Health check pour Docker et debugging"""
    return jsonify({
        "status": "ok",
        "service": "GHA Dashboard Backend",
        "csv_exists": os.path.exists(CSV_PATH),
        "github_token_set": bool(os.getenv("GITHUB_TOKEN"))
    }), 200
# ============================================
# Helpers ingestion 
# ============================================

def _iso_dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", ""))
    except Exception:
        return None

def _get_or_create_repo(repo_name: str, owner: str = "unknown") -> Repository:
    repo = db.session.query(Repository).filter_by(repo_name=repo_name).one_or_none()
    if not repo:
        repo = Repository(repo_name=repo_name, owner=owner)
        db.session.add(repo)
        db.session.flush()
    return repo

def _get_or_create_workflow(repo_id: int, wf_name: str) -> Workflow:
    wf = db.session.query(Workflow).filter_by(repository_id=repo_id, workflow_name=wf_name).one_or_none()
    if not wf:
        wf = Workflow(repository_id=repo_id, workflow_name=wf_name)
        db.session.add(wf)
        db.session.flush()
    return wf

# ============================================
# Health (BD + API) 
# ============================================

@app.get("/health")
def health():
    try:
        db.session.execute(text("SELECT 1"))
        return {
            "status": "ok",
            "service": "GHA Dashboard Backend",
            "csv_exists" : os.path.exists(CSV_PATH)
            }, 200
    except Exception as e:
        return {
            "status": "db_error", 
            "message": str(e),
            "csv_exists" : os.path.exists(CSV_PATH)
            }, 500

# ============================================
# Route extraction 
# ============================================
@app.get("/api/extraction")
def extraction_api():
    # Extrait les données pour ?repo=owner/name et retourne le DataFrame en JSON
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

    # Gestion des retours 
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
            }), 200
    return jsonify({"error": "Format de retour inattendu"}), 500


# ============================================
# Route KPI depuis CSV
# ============================================

@app.get("/api/github-metrics")
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

@sock.route("/data/<path:repositoryName>")
def websocket_data(ws, repositoryName: str):
    filters = AggregationFilters()

    aggregationPeriod = request.args.get("aggregationPeriod")
    if aggregationPeriod != None:
        filters.aggregationPeriod = cast(AggregationPeriod, aggregationPeriod)

    startDate = request.args.get("startDate")
    if startDate != None:
        filters.startDate = date.fromisoformat(startDate)

    endDate = request.args.get("endDate")
    if endDate != None:
        filters.endDate = date.fromisoformat(endDate)

    branch = request.args.get("branch")
    if branch != None:
        filters.branch = branch

    author = request.args.get("author")
    if author != None:
        filters.author = author

    workflowName = request.args.get("workflowName")
    if workflowName != None:
        filters.workflowName = workflowName

    asyncio.run(send_data(ws, repositoryName, filters))

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
# Route Extraction + Ingestion BD 
# ============================================

@app.post("/api/sync")
def sync_repo():
    """
    1) Extrait les runs pour ?repo=owner/name
    2) Sauvegarde builds_features.csv
    3) Insère en BD (Repository/Workflow/WorkflowRun), sans doublons
    4) Retourne un résumé JSON
    """
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "Paramètre manquant : ?repo=owner/name"}), 400

    token = os.getenv("GITHUB_TOKEN")
    if not token:
        return jsonify({"error": "GITHUB_TOKEN manquant dans .env"}), 400

    # 1) Extraction
    df, error = extract_data(repo, token, "2024-04-01", "2025-10-31")
    if error:
        return jsonify({"error": error}), 400
    if df is None or df.empty:
        return jsonify({"error": "Pas de données extraites pour ce dépôt."}), 404

    # 2) Sauvegarde CSV 
    try:
        df.to_csv(CSV_PATH, index=False)
    except Exception as e:
        print("Échec sauvegarde CSV:", e)

    # 3) Ingestion BD
    try:
        ids = [int(x) for x in df["id_build"].tolist() if pd.notnull(x)]
        existing_ids = {
        x[0]
        for x in db.session.query(WorkflowRun.id_build)
                       .filter(WorkflowRun.id_build.in_(ids))
                       .all()
        }
        
        owner_name = repo.split("/")[0] if "/" in repo else "unknown"
        repo_obj = _get_or_create_repo(repo_name=repo, owner=owner_name)
        inserted, skipped = 0, 0

        for _, row in df.iterrows():
            try:
                run_id = int(row["id_build"])
            except Exception:
                continue

            if run_id in existing_ids:
                skipped += 1
                continue

            wf_name = str(row.get("workflow_name") or row.get("workflow") or ".github/workflows/ci.yml")
            wf_obj = _get_or_create_workflow(repo_obj.id, wf_name)

            wr = WorkflowRun(
            id_build=run_id,
            workflow_id=wf_obj.id,
            repository_id=repo_obj.id,
            status=str(row.get("status") or "completed"),
            conclusion=str(row.get("conclusion") or "unknown"),
            created_at=_iso_dt(row.get("created_at")) or datetime.utcnow(),
            updated_at=_iso_dt(row.get("updated_at")),
            build_duration=float(row.get("build_duration") or 0),
            branch=str(row.get("branch") or "unknown"),
            issuer_name=str(row.get("issuer_name") or None),
            workflow_event_trigger=str(row.get("event") or row.get("workflow_event_trigger") or None),
            )
            db.session.add(wr)
            inserted += 1

        db.session.commit()

        return jsonify({
            "ok": True,
            "repo": repo,
            "rows_extracted": int(len(df)),
            "inserted": inserted,
            "skipped": skipped
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    
# ============================================
# Démarrage de l'Application
# ============================================
if __name__ == "__main__":
    port = int(os.getenv("FLASK_RUN_PORT", 3000))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"

    print(f"Starting GHA Dashboard Backend on port {port}")
    print(f"CSV Path: {os.path.abspath(CSV_PATH)}")
    print(f"GitHub Token configured: {bool(os.getenv('GITHUB_TOKEN'))}")

    app.run(host="0.0.0.0", port=port, debug=debug)
