from models import db, Repository, Workflow, WorkflowRun
from datetime import datetime
from sqlalchemy import and_


def runs_exist_for_repo_in_range(repo_name: str, start_dt, end_dt) -> bool:
    repo = Repository.query.filter_by(repo_name=repo_name).first()
    if not repo:
        return False

    exists = db.session.query(
        db.exists().where(
            and_(
                WorkflowRun.repository_id == repo.id,
                WorkflowRun.created_at >= start_dt,
                WorkflowRun.created_at <= end_dt
            )
        )
    ).scalar()

    return exists

def insert_runs_batch(repo_name: str, runs: list[dict]) -> int:
    repository = Repository.query.filter_by(repo_name=repo_name).first()
    if not repository:
        owner = repo_name.split("/")[0]
        repository = Repository(repo_name=repo_name, owner=owner)
        db.session.add(repository)
        db.session.flush()

    inserted = 0
    min_date = None
    max_date = None

    for r in runs:
        if WorkflowRun.query.filter_by(id_build=r["id"]).first():
            continue

        wf_name = r.get("workflow_name") or "unknown"
        workflow = Workflow.query.filter_by(
            workflow_name=wf_name,
            repository_id=repository.id
        ).first()

        if not workflow:
            workflow = Workflow(
                workflow_name=wf_name,
                repository_id=repository.id,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            db.session.add(workflow)
            db.session.flush()

        run_created = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
        run_created_date = run_created.date()  # Extract just the date part
        
        # Track min/max dates for synced range
        if min_date is None or run_created_date < min_date:
            min_date = run_created_date
        if max_date is None or run_created_date > max_date:
            max_date = run_created_date

        run = WorkflowRun(
            id_build=r["id"],
            workflow_id=workflow.id,
            repository_id=repository.id,
            status=r.get("status"),
            conclusion=r.get("conclusion"),
            created_at=run_created,
            updated_at=datetime.fromisoformat(r["updated_at"].replace("Z", "+00:00")) if r.get("updated_at") else None,
            build_duration=r.get("duration", 0),
            branch=r.get("branch"),
            issuer_name=r.get("actor"),
            workflow_event_trigger=r.get("event"),
        )

        db.session.add(run)
        inserted += 1

    # Update synced date range if we inserted runs
    if inserted > 0 and min_date and max_date:
        if not repository.synced_start_date or min_date < repository.synced_start_date:
            repository.synced_start_date = min_date
        if not repository.synced_end_date or max_date > repository.synced_end_date:
            repository.synced_end_date = max_date
        print(f"[DB] Updated sync range for {repo_name}: {repository.synced_start_date} to {repository.synced_end_date}")

    db.session.commit()
    print(f"[DB] Batch committed successfully — {inserted} rows written")
    return inserted

