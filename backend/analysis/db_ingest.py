from models import db, Repository, Workflow, WorkflowRun
from datetime import datetime

def insert_runs_batch(repo_name: str, runs: list[dict]) -> int:
    repository = Repository.query.filter_by(repo_name=repo_name).first()
    if not repository:
        owner = repo_name.split("/")[0]
        repository = Repository(repo_name=repo_name, owner=owner)
        db.session.add(repository)
        db.session.flush()

    inserted = 0

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

        run = WorkflowRun(
            id_build=r["id"],
            workflow_id=workflow.id,
            repository_id=repository.id,
            status=r.get("status"),
            conclusion=r.get("conclusion"),
            created_at=datetime.fromisoformat(r["created_at"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(r["updated_at"].replace("Z", "+00:00")) if r.get("updated_at") else None,
            build_duration=r.get("duration", 0),
            branch=r.get("branch"),
            issuer_name=r.get("actor"),
            workflow_event_trigger=r.get("event"),
        )

        db.session.add(run)
        inserted += 1

    db.session.commit()
    db.session.commit()
    print(f"[DB] Batch committed successfully — {inserted} rows written")
    return inserted

