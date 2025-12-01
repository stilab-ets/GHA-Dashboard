from models import *
from extraction.extractor import fetch_all_github_runs
import json
import os
import pandas as pd
from datetime import date, datetime, time as dt_time
from typing import Any
from dataclasses import dataclass
import time as time_module
import requests

# Batch insertion
from analysis.db_ingest import insert_runs_batch


# ============================================================
#  Aggregation Filters
# ============================================================
@dataclass
class AggregationFilters:
    aggregationPeriod: AggregationPeriod = "day"
    startDate: date = date(2000, 1, 1)
    endDate: date = date(2100, 1, 1)
    author: str | None = None
    branch: str | None = None
    workflowName: str | None = None


# ============================================================
#  JSON Serialization Helper
# ============================================================
def json_default(o: Any):
    if isinstance(o, datetime):
        return o.isoformat()
    elif isinstance(o, date):
        return o.isoformat()
    elif isinstance(o, pd.Timestamp):
        return o.isoformat()
    elif hasattr(o, '__dict__'):
        return o.__dict__
    else:
        return str(o)


# ============================================================
#  GitHub – Pagination API
# ============================================================
def fetch_github_runs_page(repo: str, token: str, page: int = 1, per_page: int = 100) -> tuple[list, bool]:
    owner, repo_name = repo.split("/")
    url = f"https://api.github.com/repos/{owner}/{repo_name}/actions/runs"

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json"
    }

    params = {
        "per_page": per_page,
        "page": page
    }

    r = requests.get(url, headers=headers, params=params)

    if r.status_code != 200:
        raise Exception(f"GitHub API error: {r.status_code}")

    data = r.json()

    runs = data.get("workflow_runs", [])
    has_more = len(runs) == per_page

    return runs, has_more


# ============================================================
#  Process One Raw GitHub Run
# ============================================================
def process_run(run: dict) -> dict:
    duration = 0
    if run.get("updated_at") and run.get("created_at"):
        try:
            created = datetime.fromisoformat(run["created_at"].replace("Z", "+00:00"))
            updated = datetime.fromisoformat(run["updated_at"].replace("Z", "+00:00"))
            duration = (updated - created).total_seconds()
        except:
            duration = 0

    actor = run.get("actor")
    actor_login = actor.get("login") if isinstance(actor, dict) else actor

    return {
        "id": run.get("id"),
        "workflow_name": run.get("name"),
        "branch": run.get("head_branch"),
        "actor": actor_login,
        "status": run.get("status"),
        "conclusion": run.get("conclusion"),
        "created_at": run.get("created_at"),
        "updated_at": run.get("updated_at"),
        "duration": duration,
        "run_number": run.get("run_number"),
        "event": run.get("event"),
        "html_url": run.get("html_url")
    }


# ============================================================
#  WebSocket – Streaming + Batch Insert
# ============================================================
async def send_data(ws: Any, repo: str, filters: AggregationFilters):

    print(f"[WebSocket] Connection for {repo}")

    # ---------------------------------------------------------
    # Vérification du repository dans la BD
    # ---------------------------------------------------------
    existing_repo = Repository.query.filter_by(repo_name=repo).first()

    # Calcul période
    start_dt = datetime.combine(filters.startDate, dt_time())
    end_dt = datetime.combine(filters.endDate, dt_time(23, 59, 59))

    if existing_repo:
        # Vérifier si runs existent dans l'intervalle
        runs_in_range = WorkflowRun.query.filter(
            WorkflowRun.repository_id == existing_repo.id,
            WorkflowRun.created_at >= start_dt,
            WorkflowRun.created_at <= end_dt
        ).count()

        if runs_in_range > 0:
            # --------------------------------------------
            # Repo + données existantes → utiliser le cache BD
            # --------------------------------------------
            ws.send(json.dumps({
                "type": "repo_status",
                "repo": repo,
                "exists": True,
                "hasDataInRange": True,
                "message": f"Repository '{repo}' already has {runs_in_range} runs in this date range."
            }))

            print(f"[WebSocket] Cache hit → {runs_in_range} runs already in DB for {repo}")

            # Récupérer les runs
            existing_runs = WorkflowRun.query.filter(
                WorkflowRun.repository_id == existing_repo.id,
                WorkflowRun.created_at >= start_dt,
                WorkflowRun.created_at <= end_dt
            ).all()

            # Convertir en format dict
            runs_serialized = []
            for r in existing_runs:
                d = r.__dict__.copy()
                d.pop("_sa_instance_state", None)
                runs_serialized.append(d)

            # Envoi direct au frontend
            ws.send(json.dumps({
                "type": "runs_cached",
                "data": runs_serialized,
                "cached": True,
                "totalRuns": len(runs_serialized)
            }, default=json_default))

            ws.send(json.dumps({
                "type": "complete",
                "cached": True,
                "totalRuns": len(runs_serialized),
                "totalPages": 0
            }))

            ws.close()
            return

        else:
            # Repo existe mais pas de données pour cette période
            ws.send(json.dumps({
                "type": "repo_status",
                "repo": repo,
                "exists": True,
                "hasDataInRange": False,
                "message": f"Repository '{repo}' exists but has NO data for this date range. Streaming GitHub..."
            }))

    else:
        # Repo entièrement nouveau
        ws.send(json.dumps({
            "type": "repo_status",
            "repo": repo,
            "exists": False,
            "hasDataInRange": False,
            "message": f"Repository '{repo}' does NOT exist in DB. Streaming GitHub..."
        }))

    print(f"[WebSocket] No cache hit → starting GitHub streaming for {repo}")
    total_inserted = 0

    # ---------------------------------------------------------
    # TOKEN GitHub
    # ---------------------------------------------------------
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        ws.send(json.dumps({"type": "error", "message": "GITHUB_TOKEN not configured"}))
        ws.close()
        return

    # ---------------------------------------------------------
    # GitHub Streaming
    # ---------------------------------------------------------
    try:
        page = 1
        max_pages = 100
        total_runs_sent = 0
        batch = []

        while page <= max_pages:
            runs, has_more = fetch_github_runs_page(repo, token, page)

            if not runs:
                break

            processed_runs = []
            oldest_run_date = None

            for run in runs:
                processed = process_run(run)
                batch.append(processed)

                # Batch insert every 50
                if len(batch) >= 50:
                    inserted = insert_runs_batch(repo, batch)
                    total_inserted += inserted

                    ws.send(json.dumps({
                        "type": "db_insert",
                        "batchInserted": inserted,
                        "totalInserted": total_inserted
                    }))

                    batch.clear()

                # Filtrage par date pour le streaming UI
                try:
                    created_at = datetime.fromisoformat(processed["created_at"].replace("Z", "+00:00"))
                    created_at_naive = created_at.replace(tzinfo=None)

                    if oldest_run_date is None or created_at_naive < oldest_run_date:
                        oldest_run_date = created_at_naive

                    if start_dt <= created_at_naive <= end_dt:
                        processed_runs.append(processed)

                except:
                    pass

            # Envoyer une page au frontend
            if processed_runs:
                ws.send(json.dumps({
                    "type": "runs",
                    "data": processed_runs,
                    "page": page,
                    "hasMore": has_more
                }, default=json_default))

                total_runs_sent += len(processed_runs)

            if not has_more:
                break

            if oldest_run_date and oldest_run_date < start_dt:
                break

            page += 1
            time_module.sleep(0.1)

        # Final batch insert
        if batch:
            inserted = insert_runs_batch(repo, batch)
            total_inserted += inserted

        # Final DB message
        ws.send(json.dumps({
            "type": "db_final_insert",
            "repo": repo,
            "inserted": total_inserted,
            "message": f"Insertion terminée : {total_inserted} runs insérés en BD pour {repo}"
        }))

        # Final streaming message
        ws.send(json.dumps({
            "type": "complete",
            "cached": False,
            "totalRuns": total_runs_sent,
            "totalPages": page
        }, default=json_default))

        print(f"[WebSocket] COMPLETE for {repo}: {total_runs_sent} runs streamed.")

    except Exception as e:
        ws.send(json.dumps({"type": "error", "message": str(e)}))
        print(f"[WebSocket] ERROR: {e}")
        import traceback
        traceback.print_exc()

    finally:
        ws.close()
