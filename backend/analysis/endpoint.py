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
    # Calculer la duree si possible
    duration = 0
    if run.get('updated_at') and run.get('created_at'):
        try:
            created = datetime.fromisoformat(run['created_at'].replace('Z', '+00:00'))
            updated = datetime.fromisoformat(run['updated_at'].replace('Z', '+00:00'))
            duration = (updated - created).total_seconds()
        except:
            duration = 0
    
    # Extraire l'actor (peut etre un objet ou une string)
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


async def send_data(ws: Any, repo: str, filters: AggregationFilters):
    """
    Recupere les donnees depuis l'API GitHub PAGE PAR PAGE
    et envoie les RUNS BRUTS (pas agreges) au frontend.
    
    Le frontend fait l'agregation et le filtrage localement.
    """
    print(f"[WebSocket] Connection for {repo}")
    print(f"[WebSocket] Date filters: {filters.startDate} to {filters.endDate}")
    
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        error_msg = {"type": "error", "message": "GITHUB_TOKEN not configured"}
        ws.send(json.dumps(error_msg))
        ws.close()
        return
    
    try:
        page = 1
        max_pages = 100
        total_runs_sent = 0
        
        start_dt = datetime.combine(filters.startDate, dt_time())
        end_dt = datetime.combine(filters.endDate, dt_time(23, 59, 59))
        
        while page <= max_pages:
            runs, has_more = fetch_github_runs_page(repo, token, page)
            
            if not runs:
                break
            
            # Traiter et filtrer les runs par date
            processed_runs = []
            oldest_run_date = None
            
            for run in runs:
                processed = process_run(run)
                
                # Parser la date pour filtrage
                try:
                    run_date = datetime.fromisoformat(processed['created_at'].replace('Z', '+00:00'))
                    run_date_naive = run_date.replace(tzinfo=None)
                    
                    # Tracker la date la plus ancienne
                    if oldest_run_date is None or run_date_naive < oldest_run_date:
                        oldest_run_date = run_date_naive
                    
                    # Filtrer par date
                    if start_dt <= run_date_naive <= end_dt:
                        processed_runs.append(processed)
                except:
                    pass
            
            # Envoyer les runs de cette page
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
            
            # Verifier si on doit continuer
            if not has_more:
                break
            
            # Arreter si tous les runs sont plus anciens que la date de debut
            if oldest_run_date and oldest_run_date < start_dt:
                print(f"[WebSocket] Runs older than start date, stopping")
                break
            
            page += 1
            time_module.sleep(0.1)
        
        # Envoyer le message de fin
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
