import asyncio
from models import *
from extraction.extractor import async_extract_data, fetch_all_github_runs
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

async def send_data(ws, repo: str, filters: AggregationFilters, token: str):
    print(f"[WS] Start extraction for: {repo}")

    if not token:
        ws.send(json.dumps({"type": "error", "message": "Missing GitHub token"}))
        ws.close()
        return

    start_dt = datetime.combine(filters.startDate, dt_time.min)
    end_dt = datetime.combine(filters.endDate, dt_time.max)

    cancel_event = asyncio.Event()

    total_sent = 0
    page = 0
    progress = 0
    PROGRESS_STEP = 5

    try:
        # --- Extraction initiale ---
        db_data, async_iter = async_extract_data(
            repo, token, start_dt, end_dt, cancel_event
        )

        # --- 1) ENVOI DES RUNS BD ---
        buffer = []

        for run in db_data:
            try:
                buffer.append(run.to_dict())
            except Exception as e:
                print("[DB RUN ERROR] Skipping run:", e)
                continue
            
            if len(buffer) == 50:
                ws.send(json.dumps({
                    "type": "runs",
                    "data": buffer,
                    "page": page,
                    "hasMore": True
                }, default=json_default))

                total_sent += 50
                buffer = []
                page += 1

                progress = min(100, progress + PROGRESS_STEP)
                ws.send(json.dumps({"type": "progress", "percent": progress}))

        # dernier batch
        if buffer:
            ws.send(json.dumps({
                "type": "runs",
                "data": buffer,
                "page": page,
                "hasMore": True
            }, default=json_default))

            total_sent += len(buffer)
            page += 1
            progress = min(100, progress + PROGRESS_STEP)
            ws.send(json.dumps({"type": "progress", "percent": progress}))


        # --- 2) GHAMINER STREAM ---
        miner_buffer = []
        async for run in async_iter:
            try:
                miner_buffer.append(run.to_dict())
            except Exception as e:
                print("[GHAMiner ERROR] Skipping run:", e)
                continue

            if len(miner_buffer) == 50:
                ws.send(json.dumps({
                    "type": "runs",
                    "data": miner_buffer,
                    "page": page,
                    "hasMore": True
                }, default=json_default))

                total_sent += 50
                miner_buffer = []
                page += 1

                progress = min(100, progress + PROGRESS_STEP)
                ws.send(json.dumps({"type": "progress", "percent": progress}))

        # dernier batch GHAMiner
        if miner_buffer:
            ws.send(json.dumps({
                "type": "runs",
                "data": miner_buffer,
                "page": page,
                "hasMore": False
            }, default=json_default))

            total_sent += len(miner_buffer)
            page += 1

    except Exception as e:
        print("[WS ERROR]", e)
        ws.send(json.dumps({"type": "error", "message": str(e)}))

    finally:
        try:
            ws.send(json.dumps({
                "type": "complete",
                "totalRuns": total_sent,
                "totalPages": page
            }))
        except Exception as e:
            print("[WS SEND COMPLETE ERROR]", e)

        cancel_event.set()

        try:
            ws.close()
        except:
            pass

        print(f"[WS] COMPLETE SENT → {total_sent} runs")
