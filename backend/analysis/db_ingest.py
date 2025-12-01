from models import db, Repository, Workflow, WorkflowRun
from datetime import datetime

BATCH_SIZE = 50

def insert_runs_batch(repo_name: str, runs: list[dict]):
    """Insère plusieurs runs en un seul commit (performant et propre)."""

    if not runs:
        return 0

    owner = repo_name.split("/")[0]

    # 1. Repo
    repo = Repository.query.filter_by(repo_name=repo_name).first()
    if not repo:
        repo = Repository(
            repo_name=repo_name,
            owner=owner,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.session.add(repo)
        db.session.flush()

    inserted = 0

    for r in runs:
        try:
            # Nom du workflow
            wf_name = (
                r.get("workflow_name")
                or r.get("name")
                or "unknown"
            )

            wf = Workflow.query.filter_by(
                repository_id=repo.id,
                workflow_name=wf_name
            ).first()

            if not wf:
                wf = Workflow(
                    workflow_name=wf_name,
                    repository_id=repo.id,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                db.session.add(wf)
                db.session.flush()

            # Skip doublons
            build_id = r.get("id")
            if WorkflowRun.query.filter_by(id_build=build_id).first():
                continue

            # Dates
            created_at = None
            if r.get("created_at"):
                try:
                    created_at = datetime.fromisoformat(r["created_at"].replace("Z", "+00:00"))
                except:
                    pass

            updated_at = None
            if r.get("updated_at"):
                try:
                    updated_at = datetime.fromisoformat(r["updated_at"].replace("Z", "+00:00"))
                except:
                    pass

            # Insert WorkflowRun
            wr = WorkflowRun(
                id_build=build_id,
                workflow_id=wf.id,
                repository_id=repo.id,
                status=r.get("status"),
                conclusion=r.get("conclusion"),
                created_at=created_at,
                updated_at=updated_at,
                build_duration=r.get("duration") or 0,
                branch=r.get("branch"),
                issuer_name=r.get("actor"),
                workflow_event_trigger=r.get("event"),
            )

            db.session.add(wr)
            inserted += 1

        except Exception as e:
            print("❌ ERROR inserting run:", e)
            db.session.rollback()

    db.session.commit()
    print(f"📌 BATCH INSERT — {inserted} runs inserted for {repo_name}")

    return inserted
