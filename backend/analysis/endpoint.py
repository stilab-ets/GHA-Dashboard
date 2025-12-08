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
from analysis.db_ingest import insert_runs_batch




@dataclass
class AggregationFilters:
    aggregationPeriod: AggregationPeriod = "day"
    startDate: date = date(2000, 1, 1)
    endDate: date = date(2100, 1, 1)
    author: str | None = None
    branch: str | None = None
    workflowName: str | None = None


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


def process_run(run: dict) -> dict:
    """
    Extrait les champs utiles d'un run GitHub Actions.
    Retourne un dictionnaire simplifie pour le frontend.
    """
    duration = 0
    if run.get('updated_at') and run.get('created_at'):
        try:
            created = datetime.fromisoformat(run['created_at'].replace('Z', '+00:00'))
            updated = datetime.fromisoformat(run['updated_at'].replace('Z', '+00:00'))
            duration = (updated - created).total_seconds()
        except:
            duration = 0
    
    actor = run.get('actor')
    actor_login = None
    if isinstance(actor, dict):
        actor_login = actor.get('login')
    elif actor:
        actor_login = str(actor)
    
    return {
        'id': run.get('id'),
        'workflow_name': run.get('name'),
        'branch': run.get('head_branch'),
        'actor': actor_login,
        'status': run.get('status'),
        'conclusion': run.get('conclusion'),
        'created_at': run.get('created_at'),
        'updated_at': run.get('updated_at'),
        'duration': duration,
        'run_number': run.get('run_number'),
        'event': run.get('event'),
        'html_url': run.get('html_url')
    }


async def send_data(ws: Any, repo: str, filters: AggregationFilters, token: str = None):
    """
    Recupere les donnees depuis l'API GitHub PAGE PAR PAGE
    et envoie les RUNS BRUTS (pas agreges) au frontend.
    
    
    Args:
        ws: WebSocket connection
        repo: Repository name (owner/repo)
        filters: Aggregation filters
        token: GitHub token (from extension or fallback to env)
    """
    print(f"[WebSocket] Connection for {repo}")
    print(f"[WebSocket] Date filters: {filters.startDate} to {filters.endDate}")
    
    # Utiliser le token passé en paramètre, sinon fallback sur .env
    if not token:
        token = os.getenv("GITHUB_TOKEN")
    
    if not token:
        error_msg = {
            "type": "error",
            "message": "GitHub token required. Please configure it in the Chrome extension popup (click the extension icon and enter your token)."
        }
        ws.send(json.dumps(error_msg))
        ws.close()
        return
    
    try:
        page = 1
        max_pages = 100
        total_runs_sent = 0

        # initialisation du batch BD
        batch = []
        
        start_dt = datetime.combine(filters.startDate, dt_time())
        end_dt = datetime.combine(filters.endDate, dt_time(23, 59, 59))

        # Check if this date range has already been synchronized
        repository = Repository.query.filter_by(repo_name=repo).first()
        
        # Determine if we should use short-circuit (return data from DB) or stream from GitHub
        use_shortcircuit = False
        if repository and repository.synced_start_date and repository.synced_end_date:
            # Compare only the DATE part (ignore timezone/time differences)
            synced_start_date = repository.synced_start_date.date() if hasattr(repository.synced_start_date, 'date') else repository.synced_start_date
            synced_end_date = repository.synced_end_date.date() if hasattr(repository.synced_end_date, 'date') else repository.synced_end_date
            
            # Date range is synced if it's within the synced bounds
            if filters.startDate >= synced_start_date and filters.endDate <= synced_end_date:
                use_shortcircuit = True
                print(f"[DB] Date range {filters.startDate} to {filters.endDate} is within synced range {synced_start_date} to {synced_end_date}")

        if use_shortcircuit:
            print(f"[DB] Runs found for {repo} between {start_dt} and {end_dt}")
            print(f"[DB] Filters: author={filters.author}, branch={filters.branch}, workflowName={filters.workflowName}")
            # Short-circuit: fetch runs from DB and send them immediately instead of
            # re-streaming from the GitHub API. This avoids unnecessary API calls
            # when the requested date range is already present in the local DB.
            
            try:
                # import models via wildcard import at top: Repository, WorkflowRun, Workflow, db
                repository = Repository.query.filter_by(repo_name=repo).first()
                if repository:
                    query = WorkflowRun.query.filter(
                        WorkflowRun.repository_id == repository.id,
                        WorkflowRun.created_at >= start_dt,
                        WorkflowRun.created_at <= end_dt
                    )
                    # apply optional filters
                    if filters.author:
                        query = query.filter(WorkflowRun.issuer_name == filters.author)
                    if filters.branch:
                        query = query.filter(WorkflowRun.branch == filters.branch)
                    if filters.workflowName:
                        # join workflow to filter by name
                        query = query.join(Workflow).filter(Workflow.workflow_name == filters.workflowName)

                    runs_in_db = query.order_by(WorkflowRun.created_at.desc()).all()
                    print(f"[DB] Found {len(runs_in_db)} runs in requested date range")


                    processed_runs = []
                    for r in runs_in_db:
                        processed_runs.append({
                            'id': r.id_build,
                            'workflow_name': r.workflow.workflow_name if r.workflow else None,
                            'branch': r.branch,
                            'actor': r.issuer_name,
                            'status': r.status,
                            'conclusion': r.conclusion,
                            'created_at': r.created_at.isoformat() if r.created_at else None,
                            'updated_at': r.updated_at.isoformat() if r.updated_at else None,
                            'duration': r.build_duration or 0,
                            'run_number': None,
                            'event': r.workflow_event_trigger,
                            'html_url': None
                        })

                    # Always send runs message (even if empty) so frontend callback is triggered
                    msg = {
                        'type': 'runs',
                        'data': processed_runs,
                        'page': 1,
                        'hasMore': False
                    }
                    ws.send(json.dumps(msg, default=json_default))

                    complete_msg = {
                        'type': 'complete',
                        'totalRuns': len(processed_runs),
                        'totalPages': 1 if processed_runs else 0
                    }
                    ws.send(json.dumps(complete_msg, default=json_default))
                    print(f"[WebSocket] Served {len(processed_runs)} runs from DB for {repo}")
                else:
                    # repository not present, nothing to send
                    ws.send(json.dumps({'type': 'complete', 'totalRuns': 0, 'totalPages': 0}))
            except Exception as e:
                print(f"[WebSocket] Error reading DB runs: {e}")
                import traceback
                traceback.print_exc()
                ws.send(json.dumps({'type': 'error', 'message': str(e)}, default=json_default))
            
            # Short-circuit complete — don't fetch from GitHub
            return
        else:
            print(f"[DB] No runs found for {repo} in that date range")
        
        while page <= max_pages:
            runs, has_more = fetch_github_runs_page(repo, token, page)
            
            if not runs:
                break
            
            processed_runs = []
            oldest_run_date = None
            
            for run in runs:
                processed = process_run(run)
                #ajout au  batch BD
                batch.append(processed)

                # insertion par lot toutes les 50 entrées
                if len(batch) >= 50:
                    inserted = insert_runs_batch(repo, batch)
                    print(f"[WebSocket] Inserted {inserted} runs into DB")
                    #notify frontend
                    ws.send(json.dumps({
                        "type": "log",
                        "message": f"Inserted {inserted} runs into DB"
                    }))
                    
                    batch.clear()
                
                try:
                    run_date = datetime.fromisoformat(processed['created_at'].replace('Z', '+00:00'))
                    run_date_naive = run_date.replace(tzinfo=None)
                    
                    if oldest_run_date is None or run_date_naive < oldest_run_date:
                        oldest_run_date = run_date_naive
                    
                    # Comparer les dates naïves (sans timezone)
                    if start_dt <= run_date_naive <= end_dt:
                        processed_runs.append(processed)
                except:
                    pass
            
            if processed_runs:
                msg = {
                    "type": "runs",
                    "data": processed_runs,
                    "page": page,
                    "hasMore": has_more
                }
                ws.send(json.dumps(msg, default=json_default))
                total_runs_sent += len(processed_runs)
                print(f"[WebSocket] Page {page}: sent {len(processed_runs)} runs (total: {total_runs_sent})")
            
            if not has_more:
                break
            
            if oldest_run_date and oldest_run_date < start_dt:
                print(f"[WebSocket] Runs older than start date, stopping")
                break
            
            page += 1
            time_module.sleep(0.1)

        # insérer le reste du batch BD
        if batch:
            print(f"[BACKEND] Inserting batch of {len(batch)} runs into database…")
            inserted = insert_runs_batch(repo, batch)
            print(f"[WebSocket] Final insert : {inserted} runs into DB")
            print(f"[BACKEND] Batch inserted: {inserted} runs")
            # --- notify frontend ---
            log_msg = {
                "type": "log",
                "message": f"Inserted {inserted} runs into DB"
            }
            ws.send(json.dumps(log_msg))


        complete_msg = {
            "type": "complete",
            "totalRuns": total_runs_sent,
            "totalPages": page
        }
        ws.send(json.dumps(complete_msg, default=json_default))
        
        print(f"[WebSocket] Complete for {repo}: {total_runs_sent} runs, {page} pages")
        
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        import traceback
        traceback.print_exc()
        error_msg = {"type": "error", "message": str(e)}
        ws.send(json.dumps(error_msg, default=json_default))
    
    finally:
        ws.close()
