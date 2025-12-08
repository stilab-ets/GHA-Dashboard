import asyncio
from models import *
from extraction.extractor import (
    async_extract_data,
    BUILD_FEATURES_PATH
)
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
    start_dt = datetime.combine(filters.startDate, datetime.min.time())
    end_dt = datetime.combine(filters.endDate, datetime.max.time())

    cancel_event = asyncio.Event()

    try:
        db_runs, miner_iter = await async_extract_data(repo, token, start_dt, end_dt, cancel_event)

        # 1) envoyer runs BD
        buffer = []
        page = 0

        for r in db_runs:
            if not (start_dt <= r.created_at <= end_dt):
                continue

            buffer.append(r.to_dict())

            if len(buffer) == 50:
                ws.send(json.dumps({"type": "runs",
                                    "data": buffer,
                                    "page": page,
                                    "hasMore": True}))
                buffer = []
                page += 1

        if buffer:
            ws.send(json.dumps({"type": "runs",
                                "data": buffer,
                                "page": page,
                                "hasMore": True}))
            page += 1

        # 2) GHAminer stream
        miner_buffer = []
        async for r in miner_iter:
            miner_buffer.append(r.to_dict())

            if len(miner_buffer) == 50:
                ws.send(json.dumps({"type": "runs",
                                    "data": miner_buffer,
                                    "page": page,
                                    "hasMore": True}))
                miner_buffer = []
                page += 1

        if miner_buffer:
            ws.send(json.dumps({"type": "runs",
                                "data": miner_buffer,
                                "page": page,
                                "hasMore": False}))
            page += 1

        # complete
        ws.send(json.dumps({
            "type": "complete",
            "totalPages": page
        }))

    except Exception as e:
        ws.send(json.dumps({"type": "error", "message": str(e)}))

    finally:
        cancel_event.set()
        try:
            ws.close()
        except:
            pass
