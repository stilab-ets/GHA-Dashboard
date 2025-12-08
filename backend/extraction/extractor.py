import os
import asyncio
import subprocess
import datetime
import pandas as pd
from typing import AsyncIterator
from models import db, Repository, Workflow, WorkflowRun


BUILD_FEATURES_PATH = "builds_features.csv"


# ============================================================
#  LECTURE SÉCURISÉE DES LIGNES CSV GÉNÉRÉES PAR GHAMINER
# ============================================================
def _parse_csv_line(line: str):
    """Parse une ligne CSV GHAminer, sécurisée."""

    values = line.strip().split(",")

    if len(values) < 20:
        raise ValueError("Ligne CSV invalide")

    try:
        id_build = int(values[1])

        # Lire dates en forçant awareness
        created_at = datetime.datetime.fromisoformat(values[10].replace("Z", "+00:00"))
        updated_at = datetime.datetime.fromisoformat(values[11].replace("Z", "+00:00"))

        # FIX : rendre naïves (plus de timezone)
        created_at = created_at.replace(tzinfo=None)
        updated_at = updated_at.replace(tzinfo=None)

    except Exception:
        raise ValueError("Bad CSV date format: " + line)

    return {
        "repo": values[0],
        "id_build": id_build,
        "branch": values[4],
        "commit_sha": values[5],
        "status": values[7],
        "conclusion": values[9],
        "workflow_event": values[8],
        "workflow_name": values[19],
        "issuer": values[3],
        "created_at": created_at,
        "updated_at": updated_at,
        "duration": float(values[12])
    }


# ============================================================
#  INGESTION BD
# ============================================================

def _insert_run_into_db(data: dict) -> WorkflowRun:
    """Création ou mise à jour d'un WorkflowRun."""

    repo_name = data["repo"]
    repo = Repository.query.filter_by(repo_name=repo_name).one_or_none()

    if repo is None:
        repo = Repository(repo_name=repo_name, owner=repo_name.split("/")[0])
        db.session.add(repo)
        db.session.flush()

    wf = Workflow.query.filter_by(
        repository_id=repo.id,
        workflow_name=data["workflow_name"]
    ).one_or_none()

    if wf is None:
        wf = Workflow(
            repository_id=repo.id,
            workflow_name=data["workflow_name"]
        )
        db.session.add(wf)
        db.session.flush()

    run = WorkflowRun.query.filter_by(id_build=data["id_build"]).one_or_none()

    if run is None:
        run = WorkflowRun(
            id_build=data["id_build"],
            repository_id=repo.id,
            workflow_id=wf.id
        )
        db.session.add(run)

    # mise à jour
    run.branch = data["branch"]
    run.commit_sha = data["commit_sha"]
    run.status = data["status"]
    run.conclusion = data["conclusion"]
    run.workflow_event_trigger = data["workflow_event"]
    run.issuer_name = data["issuer"]
    run.created_at = data["created_at"]
    run.updated_at = data["updated_at"]
    run.build_duration = data["duration"]

    db.session.commit()
    return run


# ============================================================
#  EXTRACTION ASYNC — VERSION FIXÉE
# ============================================================

async def _execute_ghaminer_async(repo_url: str, token: str,
                                 start_dt: datetime.datetime,
                                 end_dt: datetime.datetime,
                                 cancel_event: asyncio.Event) -> AsyncIterator[WorkflowRun]:
    """
    Exécute GHAminer, puis lit le CSV de manière propre.
    """

    # 1. Lancer GHAminer
    process = await asyncio.create_subprocess_exec(
        "python", "ghaminer/src/GHAMetrics.py",
        "-t", token,
        "-s", repo_url,
        "--clone-path", "/tmp/gha_clone",
        "-fd", start_dt.date().isoformat(),
        "-td", end_dt.date().isoformat()
    )
    await process.wait()

    # 2. Lire le fichier généré
    if not os.path.exists(BUILD_FEATURES_PATH):
        return

    with open(BUILD_FEATURES_PATH, "r") as f:
        for line in f:
            if cancel_event.is_set():
                break

            if line.startswith("repo,"):
                continue

            # ignorons les autres repos
            if not line.startswith(repo_url + ","):
                continue

            try:
                parsed = _parse_csv_line(line)
            except Exception as e:
                print("[CSV PARSE ERROR]", e)
                continue

            # filtrage dates AVANT insertion BD
            if not (start_dt <= parsed["created_at"] <= end_dt):
                continue

            run = _insert_run_into_db(parsed)
            yield run


def _get_data_from_db(repo_url: str, start_dt: datetime.datetime,
                      end_dt: datetime.datetime) -> list[WorkflowRun]:
    repo = Repository.query.filter_by(repo_name=repo_url).one_or_none()
    if not repo:
        return []

    runs = WorkflowRun.query.filter(
        WorkflowRun.repository_id == repo.id,
        WorkflowRun.created_at >= start_dt,
        WorkflowRun.created_at <= end_dt
    ).order_by(WorkflowRun.created_at.asc()).all()

    return runs


async def async_extract_data(repo_url: str, token: str,
                             start_dt: datetime.datetime,
                             end_dt: datetime.datetime,
                             cancel_event: asyncio.Event):

    db_runs = _get_data_from_db(repo_url, start_dt, end_dt)

    if db_runs:
        miner_start = db_runs[-1].created_at
    else:
        miner_start = start_dt

    if miner_start >= end_dt:
        async def empty():
            if False:
                yield
        return db_runs, empty()

    miner_iter = _execute_ghaminer_async(repo_url, token, miner_start, end_dt, cancel_event)

    return db_runs, miner_iter
