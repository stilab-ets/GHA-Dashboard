from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Repository(db.Model):
    __tablename__ = "repository"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), unique=True, nullable=False)

class Workflow(db.Model):
    __tablename__ = "workflow"
    id = db.Column(db.Integer, primary_key=True)
    repo_id = db.Column(db.Integer, db.ForeignKey("repository.id"), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)

class WorkflowRun(db.Model):
    __tablename__ = "workflow_run"
    id = db.Column(db.BigInteger, primary_key=True)
    workflow_id = db.Column(db.Integer, db.ForeignKey("workflow.id"), nullable=False, index=True)
    status = db.Column(db.String(40), index=True)
    conclusion = db.Column(db.String(40), index=True)
    started_at = db.Column(db.DateTime, index=True)
    completed_at = db.Column(db.DateTime, index=True)
    duration_s = db.Column(db.Integer, index=True)
    branch = db.Column(db.String(255), index=True)

# pour filtre (apres demo mi session)
"""class User(db.Model):
    __tablename__ = "user"
    id = db.Column(db.BigInteger, primary_key=True)   # id GitHub
    login = db.Column(db.String(255), unique=True, index=True, nullable=False)

class RunActor(db.Model):
    __tablename__ = "run_actor"
    run_id = db.Column(db.BigInteger, db.ForeignKey("workflow_run.id"), primary_key=True)
    user_id = db.Column(db.BigInteger, db.ForeignKey("user.id"), primary_key=True)
    role = db.Column(db.String(40), nullable=False)  # "author", "triggerer", etc."""
