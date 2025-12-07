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
    # Vérifier si le repo existe déjà dans la BD
    existing_repo = Repository.query.filter_by(repo_name=repo).first()

    if existing_repo:
        ws.send(json.dumps({
            "type": "repo_status",
            "repo": repo,
            "exists": True,
            "message": f"Repository '{repo}' already exists in the database."
        }))
    else:
        ws.send(json.dumps({
            "type": "repo_status",
            "repo": repo,
            "exists": False,
            "message": f"Repository '{repo}' does NOT exist in the database."
        }))

    print(f"[WebSocket] Date filters: {filters.startDate} to {filters.endDate}")
    total_inserted = 0

    token = os.getenv("GITHUB_TOKEN")
    if not token:
        ws.send(json.dumps({"type": "error", "message": "GITHUB_TOKEN not configured"}))
        ws.close()
        return

    try:
        page = 1
        max_pages = 100
        total_runs_sent = 0

        start_dt = datetime.combine(filters.startDate, dt_time())
        end_dt = datetime.combine(filters.endDate, dt_time(23, 59, 59))

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

                if len(batch) >= 50:
                    inserted = insert_runs_batch(repo, batch)
                    total_inserted += inserted

                    ws.send(json.dumps({
                        "type": "db_insert",
                        "batchInserted": inserted,
                        "totalInserted": total_inserted
                    }))

                    batch.clear()

                try:
                    run_date = datetime.fromisoformat(processed["created_at"].replace("Z", "+00:00"))
                    run_date_naive = run_date.replace(tzinfo=None)

                    if oldest_run_date is None or run_date_naive < oldest_run_date:
                        oldest_run_date = run_date_naive

                    if start_dt <= run_date_naive <= end_dt:
                        processed_runs.append(processed)

                except:
                    pass

            if processed_runs:
                ws.send(json.dumps({
                    "type": "runs",
                    "data": processed_runs,
                    "page": page,
                    "hasMore": has_more
                }, default=json_default))

                total_runs_sent += len(processed_runs)
                print(f"[WebSocket] Page {page}: sent {len(processed_runs)} runs (total: {total_runs_sent})")

            if not has_more:
                break

            if oldest_run_date and oldest_run_date < start_dt:
                print("[WebSocket] Runs older than start date → stopping")
                break

            page += 1
            time_module.sleep(0.1)

        # Final batch insert
        if batch:
            inserted = insert_runs_batch(repo, batch)
            total_inserted += inserted

        # Inform front-end of total inserted
        ws.send(json.dumps({
            "type": "db_final_insert",
            "repo": repo,
            "inserted": total_inserted,
            "message": f"Insertion terminée : {total_inserted} runs insérés en BD pour {repo}"
        }))

        # Inform WebSocket stream is complete
        ws.send(json.dumps({
            "type": "complete",
            "totalRuns": total_runs_sent,
            "totalPages": page
        }, default=json_default))

        print(f"[WebSocket] COMPLETE for {repo}: {total_runs_sent} runs, {page} pages")

    finally:
         ws.close()
        