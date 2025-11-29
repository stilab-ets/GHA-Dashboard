import os
import pandas as pd
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import text
from models import db, Repository, Workflow, WorkflowRun, AggregationPeriod
from extraction.extractor import BUILD_FEATURES_PATH, extract_data, needs_refresh, run_ghaminer,fetch_all_github_runs
from analysis.endpoint import AggregationFilters, send_data
from typing import cast
from datetime import date
import asyncio
from flask_sock import Sock
import threading
import json
import numpy as np


import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "ghaminer", "src"))

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

# ============================================
# Cache système pour l'extraction
# ============================================
_extraction_cache = {}
_cache_lock = threading.Lock()

def get_cached_extraction(repo, max_age_minutes=30):
    """Récupère les données depuis le cache si elles sont récentes"""
    with _cache_lock:
        if repo in _extraction_cache:
            cached_data, cached_time = _extraction_cache[repo]
            age = datetime.now() - cached_time
            if age < timedelta(minutes=max_age_minutes):
                print(f" Cache HIT for {repo} (age: {age.seconds}s)")
                return cached_data
            else:
                print(f" Cache EXPIRED for {repo} (age: {age.seconds}s)")
        return None

def set_cached_extraction(repo, data):
    """Stocke les données dans le cache"""
    with _cache_lock:
        _extraction_cache[repo] = (data, datetime.now())
        print(f"💾 Cached extraction for {repo} ({len(data.get('data', []))} runs)")

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
        wf = Workflow(
            workflow_name=wf_name,
            repository_id=repo_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
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
# Route extraction avec cache
# ============================================
@app.get("/api/extraction")
def extraction_api():
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "repo manquant"}), 400

    token = os.getenv("GITHUB_TOKEN")

    df = fetch_all_github_runs(repo, token)

    # Nettoyage - sélectionner seulement les colonnes existantes
    expected_columns = [
        "id",
        "name",
        "event",
        "status",
        "conclusion",
        "created_at",
        "updated_at",
        "run_number",
        "actor",
        "display_title",
        "head_branch",
        "path",
        "run_attempt",
        "workflow_id"
    ]
    df = df[[col for col in expected_columns if col in df.columns]]

    # Renommer les colonnes si elles existent
    rename_dict = {}
    if "id" in df.columns:
        rename_dict["id"] = "id_build"
    if "name" in df.columns:
        rename_dict["name"] = "workflow_name"
    if "head_branch" in df.columns:
        rename_dict["head_branch"] = "branch"
    df.rename(columns=rename_dict, inplace=True)

    # Convertir timestamps si les colonnes existent
    if "created_at" in df.columns:
        df["created_at"] = pd.to_datetime(df["created_at"])
    if "updated_at" in df.columns:
        df["updated_at"] = pd.to_datetime(df["updated_at"])

    data_dict = df.to_dict(orient="records")

    return jsonify({
        "success": True,
        "repo": repo,
        "runs_extracted": len(df),
        "columns": list(df.columns),
        "data": data_dict
    }), 200

# ============================================
# Route pour vérifier le cache
# ============================================
@app.get("/api/extraction/cache-status")
def cache_status():
    """Vérifie l'état du cache pour un repo"""
    repo = request.args.get("repo")
    if not repo:
        with _cache_lock:
            return jsonify({
                "cached_repos": list(_extraction_cache.keys()),
                "count": len(_extraction_cache)
            }), 200
    
    cached_data = get_cached_extraction(repo)
    if cached_data:
        return jsonify({
            "cached": True,
            "repo": repo,
            "runs": cached_data.get("runs_extracted", 0),
            "columns": cached_data.get("columns", [])
        }), 200
    else:
        return jsonify({
            "cached": False,
            "repo": repo
        }), 200


# ============================================
# Route pour vider le cache
# ============================================
@app.post("/api/extraction/clear-cache")
def clear_cache():
    """Vide le cache d'extraction (utile pour debug)"""
    repo = request.args.get("repo")
    
    with _cache_lock:
        if repo:
            if repo in _extraction_cache:
                del _extraction_cache[repo]
                return jsonify({"success": True, "message": f"Cache cleared for {repo}"}), 200
            else:
                return jsonify({"success": False, "message": f"No cache for {repo}"}), 404
        else:
            count = len(_extraction_cache)
            _extraction_cache.clear()
            return jsonify({"success": True, "message": f"Cleared {count} cached repos"}), 200


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
            "changePercentage": 0
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
    with _cache_lock:
        cached_repos = list(_extraction_cache.keys())
    
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
        "cache": {
            "cached_repos": cached_repos,
            "count": len(cached_repos)
        },
        "working_directory": os.getcwd(),
        "python_version": os.sys.version
    })

# ============================================
# Route: Vérifier si un repo existe en BD
# ============================================

@app.get("/api/repository/status")
def repository_status():
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "Paramètre manquant : ?repo=owner/name"}), 400

    # Vérifier si le dépôt est dans la table Repository
    repo_obj = Repository.query.filter_by(repo_name=repo).first()

    if repo_obj:
        return jsonify({
            "repo": repo,
            "status": "exists",
            "repository_id": repo_obj.id
        }), 200

    return jsonify({
        "repo": repo,
        "status": "missing"
    }), 200


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

    print(" Lancement automatique de GHAminer...")
    ok = run_ghaminer(repo, token)
    if not ok:
        print("❌ ERROR: GHAminer a échoué — cause possible ci-dessous")
        import traceback
        traceback.print_exc()
        return jsonify({"error": "GHAminer a échoué"}), 500

    # 1) Extraction
   
    success = True
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
        # Charger TOUS les id_build existants d'un coup
        existing_ids = set(
            db.session.query(WorkflowRun.id_build).with_entities(WorkflowRun.id_build).all()
        )
        existing_ids = {row[0] for row in existing_ids}

        owner_name = repo.split("/")[0] if "/" in repo else "unknown"
        repo_obj = _get_or_create_repo(repo_name=repo, owner=owner_name)

        inserted, skipped = 0, 0

        # IMPORTANT : désactiver l'autoflush
        with db.session.no_autoflush:

            for _, row in df.iterrows():

                run_id = int(row["id_build"])

                # --- SKIP si existe déjà ---
                if run_id in existing_ids:
                    skipped += 1
                    continue

                # Assurer un workflow
                wf_name = str(row.get("workflow_name") or row.get("workflow") or ".github/workflows/ci.yml")
                wf_obj = _get_or_create_workflow(repo_obj.id, wf_name)

                # Créer le workflow_run
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
    
def ingest_runs(runs, repository):
    for run in runs:
        ingest_run_into_db(repository, run)

@app.post("/api/repository/create")
def create_repository():
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "Paramètre manquant : repo"}), 400
    
    owner = repo.split("/")[0] if "/" in repo else "unknown"

    # Vérifier si le repo existe déjà
    existing = db.session.query(Repository).filter_by(repo_name=repo).one_or_none()
    if existing:
        return jsonify({
            "created": False,
            "repo": repo,
            "id": existing.id,
            "message": "Repository already exists"
        }), 200

    # Créer le nouveau repository
    new_repo = Repository(
        repo_name=repo,
        owner=owner,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.session.add(new_repo)
    db.session.commit()

    return jsonify({
        "created": True,
        "repo": repo,
        "id": new_repo.id
    }), 201

@app.get("/api/repository/data")
def repository_data():
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "Paramètre manquant : repo"}), 400

    # Vérifier si le repo existe
    repo_obj = Repository.query.filter_by(repo_name=repo).first()
    if not repo_obj:
        return jsonify({"repo": repo, "status": "missing"}), 404

    # Charger les workflows
    workflows = Workflow.query.filter_by(repository_id=repo_obj.id).all()

    # Charger les runs
    runs = WorkflowRun.query.filter_by(repository_id=repo_obj.id).all()

    # Formater les données
    workflows_json = [
        {
            "id": wf.id,
            "workflow_name": wf.workflow_name,
            "created_at": wf.created_at.isoformat(),
            "updated_at": wf.updated_at.isoformat()
        }
        for wf in workflows
    ]

    runs_json = [
        {
            "id_build": wr.id_build,
            "workflow_id": wr.workflow_id,
            "repository_id": wr.repository_id,
            "status": wr.status,
            "conclusion": wr.conclusion,
            "created_at": wr.created_at.isoformat() if wr.created_at else None,
            "updated_at": wr.updated_at.isoformat() if wr.updated_at else None,
            "duration": wr.build_duration,
            "branch": wr.branch,
            "issuer_name": wr.issuer_name,
            "event": wr.workflow_event_trigger
        }
        for wr in runs
    ]

    return jsonify({
        "repo": repo,
        "status": "exists",
        "repository_id": repo_obj.id,
        "workflows": workflows_json,
        "runs": runs_json,
        "run_count": len(runs_json)
    }), 200


# ============================================
# Démarrage de l'Application
# ============================================
if __name__ == "__main__":
    port = int(os.getenv("FLASK_RUN_PORT", 3000))
    debug = os.getenv("FLASK_DEBUG", "1") == "1"

    print(f" Starting GHA Dashboard Backend on port {port}")
    print(f" CSV Path: {os.path.abspath(CSV_PATH)}")
    print(f" GitHub Token configured: {bool(os.getenv('GITHUB_TOKEN'))}")
    print(f" Cache system: ENABLED")

    app.run(host="0.0.0.0", port=port, debug=debug)