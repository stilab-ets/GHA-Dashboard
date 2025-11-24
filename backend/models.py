from flask_sqlalchemy import SQLAlchemy

from dataclasses import dataclass
from datetime import date
from typing import Literal, ClassVar, TypeAlias


db = SQLAlchemy()

class Repository(db.Model):
    __tablename__ = "repositories"  
    id = db.Column(db.Integer, primary_key=True)
    repo_name = db.Column(db.String(255), unique=True, nullable=False)
    owner = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)

    workflows = db.relationship("Workflow", backref="repository", lazy=True)
    runs = db.relationship("WorkflowRun", backref="repository", lazy=True)


class Workflow(db.Model):
    __tablename__ = "workflows"
    id = db.Column(db.Integer, primary_key=True)
    workflow_name = db.Column(db.String(255), nullable=False)
    repository_id = db.Column(db.Integer, db.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)

    runs = db.relationship("WorkflowRun", backref="workflow", lazy=True)

class WorkflowRun(db.Model):
    __tablename__ = "workflow_runs"
    id = db.Column(db.Integer, primary_key=True)
    
    id_build = db.Column(db.BigInteger, unique=True, nullable=False)
    workflow_id = db.Column(db.Integer, db.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    repository_id = db.Column(db.Integer, db.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)

   # Git context
    branch = db.Column(db.String(255))
    commit_sha = db.Column(db.String(40))

    # Status
    status = db.Column(db.String(50), nullable=False)
    conclusion = db.Column(db.String(50))

    # Trigger & actor
    workflow_event_trigger = db.Column(db.String(100))
    issuer_name = db.Column(db.String(255))

    # timestamps
    created_at = db.Column(db.DateTime, nullable=False)
    updated_at = db.Column(db.DateTime)

    # durée
    build_duration = db.Column(db.Float)

    # tests
    tests_ran = db.Column(db.Boolean, default=False)
    tests_passed = db.Column(db.Integer, default=0)
    tests_failed = db.Column(db.Integer, default=0)
    tests_skipped = db.Column(db.Integer, default=0)
    tests_total = db.Column(db.Integer, default=0)

    # jobs
    total_jobs = db.Column(db.Integer, default=0)

    # métriques de code
    gh_files_added = db.Column(db.Integer, default=0)
    gh_files_deleted = db.Column(db.Integer, default=0)
    gh_files_modified = db.Column(db.Integer, default=0)
    gh_lines_added = db.Column(db.Integer, default=0)
    gh_lines_deleted = db.Column(db.Integer, default=0)
    gh_src_churn = db.Column(db.Integer, default=0)
    gh_test_churn = db.Column(db.Integer, default=0)

    gh_src_files = db.Column(db.Integer, default=0)
    gh_doc_files = db.Column(db.Integer, default=0)
    gh_other_files = db.Column(db.Integer, default=0)

    gh_pull_req_number = db.Column(db.Integer)
    gh_is_pr = db.Column(db.Boolean, default=False)
    gh_num_pr_comments = db.Column(db.Integer, default=0)

    gh_sloc = db.Column(db.Integer)
    git_num_committers = db.Column(db.Integer)
    git_commits = db.Column(db.Integer)

AggregationPeriod: TypeAlias = Literal["day", "month", "week"]

@dataclass
class TimeInfo:
    min: float
    q1: float
    median: float
    q3: float
    max: float
    average: float

@dataclass
class StatusInfo:
    numRuns: int
    successes: int
    failures: int
    cancelled: int

@dataclass
class RunInfo:
    repositoryName: str
    workflowNames: list[str]
    branches: list[str]
    authors: list[str]

@dataclass
class AggregationData:
    runsInfo: RunInfo
    aggregationPeriod: AggregationPeriod
    periodStart: date
    statusInfo: StatusInfo
    timeInfo: TimeInfo

@dataclass
class NewDataMessage:
    type: ClassVar[Literal["newData"]] = "newData"
    data: AggregationData

@dataclass
class InitialDataMessage:
    type: ClassVar[Literal["initialData"]] = "initialData"
    data: list[AggregationData]
