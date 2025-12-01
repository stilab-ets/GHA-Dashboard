from models import db, Repository, Workflow, WorkflowRun
from datetime import datetime

def insert_runs_batch(repo_name: str, runs: list[dict]) -> int:
    """
    Insère un batch de runs.
    Retourne le VRAI nombre inséré (sans doublons).
    """

    repository = Repository.query.filter_by(repo_name=repo_name).first()
    if not repository:
        # Jamais censé arriver, mais au cas où…
        owner = repo_name.split("/")[0]
        repository = Repository(repo_name=repo_name, owner=owner)
        db.session.add(repository)
        db.session.flush()

    inserted_count = 0

    for run in runs:
        # Skip doublons
        if WorkflowRun.query.filter_by(id_build=run["id"]).first():
            continue

        # Trouver (ou créer workflow)
        wf_name = run.get("workflow_name") or "unknown"
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

        # Création du run
        new_run = WorkflowRun(
            id_build=run["id"],
            workflow_id=workflow.id,
            repository_id=repository.id,

            branch=run.get("branch"),
            issuer_name=run.get("actor"),

            status=run.get("status"),
            conclusion=run.get("conclusion"),

            workflow_event_trigger=run.get("event"),

            created_at=datetime.fromisoformat(run["created_at"].replace("Z", "+00:00")),
            updated_at=datetime.fromisoformat(run["updated_at"].replace("Z", "+00:00")) if run.get("updated_at") else None,

            build_duration=run.get("duration")
        )

        db.session.add(new_run)
        inserted_count += 1

    db.session.commit()
    return inserted_count
