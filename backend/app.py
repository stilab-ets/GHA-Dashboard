import os
import pandas as pd
from datetime import datetime
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from sqlalchemy import text

from models import db, Repository, Workflow, WorkflowRun
from extraction.extractor import extract_data

# ───────────────── Config de l'app ─────────────────
load_dotenv()
app = Flask(__name__)
CORS(app)

app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv("DATABASE_URL")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(app)

CSV_PATH = "builds_features.csv"

# ─────────── Helpers ingestion ───────────
def _iso_dt(v):
    if not v:
        return None
    try:
        return datetime.fromisoformat(str(v).replace("Z", ""))
    except Exception:
        return None

def _get_or_create_repo(name: str) -> Repository:
    repo = db.session.query(Repository).filter_by(name=name).one_or_none()
    if not repo:
        repo = Repository(name=name)
        db.session.add(repo)
        db.session.flush()
    return repo

def _get_or_create_workflow(repo_id: int, wf_name: str) -> Workflow:
    wf = db.session.query(Workflow).filter_by(repo_id=repo_id, name=wf_name).one_or_none()
    if not wf:
        wf = Workflow(repo_id=repo_id, name=wf_name)
        db.session.add(wf)
        db.session.flush()
    return wf

# ─────────── test BD ───────────
@app.get("/health")
def health():
    try:
        db.session.execute(text("SELECT 1"))
        return {"status": "ok"}, 200
    except Exception as e:
        return {"status": "db_error", "message": str(e)}, 500

# ─────────── Route extraction  ───────────
@app.get("/api/extraction")
def extraction_api():
    # Extrait les données pour ?repo=owner/name et retourne le DataFrame en JSON
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "Repo manquant"}), 400

    token = os.getenv("GITHUB_TOKEN")
    if not token:
        return jsonify({"error": "GITHUB_TOKEN manquant dans .env"}), 400

    df, error = extract_data(repo, token, "2024-04-01", "2025-10-31")
    if error:
        return jsonify({"error": error}), 400
    if df is None or df.empty:
        return jsonify({"error": "Aucune donnée extraite"}), 404

    return jsonify(df.to_dict(orient="records")), 200

# ─────────── Route KPI depuis CSV ───────────
@app.get("/api/github-metrics")
def github_metrics():
    repo = request.args.get("repo")
    if not repo:
        return jsonify({"error": "repo manquant"}), 400

    if not os.path.exists(CSV_PATH):
        return jsonify({"error": "CSV introuvable"}), 404

    df = pd.read_csv(CSV_PATH)
    repo_df = df[df["repo"] == repo]

    if repo_df.empty:
        return jsonify({"error": "Aucune donnée trouvée pour ce dépôt."}), 404

    result = {
        "repo": repo,
        "totalRuns": len(repo_df),
        "successRate": round((repo_df[repo_df["conclusion"] == "success"].shape[0] / len(repo_df)) * 100, 2),
        "avgDuration": round(repo_df["build_duration"].mean(), 2),
    }
    return jsonify(result), 200

# ─────────── Route Extraction + Ingestion BD  ───────────
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
            for x in db.session.query(WorkflowRun.id)
                               .filter(WorkflowRun.id.in_(ids)).all()
        }

        repo_obj = _get_or_create_repo(repo)
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
                id=run_id,
                workflow_id=wf_obj.id,
                status=str(row.get("status") or "completed"),
                conclusion=str(row.get("conclusion") or "unknown"),
                started_at=_iso_dt(row.get("created_at")),
                completed_at=_iso_dt(row.get("updated_at")),
                duration_s=int(row.get("build_duration") or 0),
                branch=str(row.get("branch") or "unknown"),
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
    
# ─────────── Lancement de l'app ───────────
if __name__ == "__main__":
    with app.app_context():
        try:
            db.session.execute(text("SELECT 1"))
            print("Connexion PostgreSQL OK")
        except Exception as e:
            print("Erreur de connexion PostgreSQL :", e)
        db.create_all()
        print("Tables créées ou déjà existantes.")
    app.run(port=3000, debug=True)
