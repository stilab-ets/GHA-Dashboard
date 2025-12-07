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

    def __eq__(self, value) -> bool:
        if not isinstance(value, Repository):
            return NotImplemented

        is_eq = self.id == value.id
        is_eq = is_eq and self.repo_name == value.repo_name
        is_eq = is_eq and self.owner == value.owner
        is_eq = is_eq and self.created_at == value.created_at
        is_eq = is_eq and self.updated_at == value.updated_at

        return is_eq

class Workflow(db.Model):
    __tablename__ = "workflows"
    id = db.Column(db.Integer, primary_key=True)
    workflow_name = db.Column(db.String(255), nullable=False)
    repository_id = db.Column(db.Integer, db.ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)

    runs = db.relationship("WorkflowRun", backref="workflow", lazy=True)

    def __eq__(self, value) -> bool:
        if not isinstance(value, Workflow):
            return NotImplemented

        is_eq = self.id == value.id
        is_eq = is_eq and self.workflow_name == value.workflow_name
        is_eq = is_eq and self.repository_id == value.repository_id
        is_eq = is_eq and self.created_at == value.created_at
        is_eq = is_eq and self.updated_at == value.updated_at

        return is_eq

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

    def to_dict(self):
        return {
            #  le front s'attend à "id", pas "id_build"
            "id": int(self.id_build),

            # Nom du workflow : on va le chercher via la relation SQLAlchemy
            "workflow_name": self.workflow.workflow_name if self.workflow else None,

            # Branch
            "branch": self.branch,

            # Actor → on réutilise issuer_name
            "actor": self.issuer_name,

            # Statut GitHub Actions
            "status": self.status,
            "conclusion": self.conclusion,

            # Dates
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,

            # Durée en secondes → même clé que dans process_run()
            "duration": float(self.build_duration or 0),

            # Divers (optionnels mais utiles)
            "run_number": int(self.id_build),
            "event": self.workflow_event_trigger,
            "html_url": None,  # on n’a pas l’URL exacte côté GHAMiner
        }

    def __eq__(self, value) -> bool:
        if not isinstance(value, WorkflowRun):
            return NotImplemented

        is_eq = self.id == value.id
        is_eq = is_eq and self.id_build == value.id_build
        is_eq = is_eq and self.workflow_id == value.workflow_id
        is_eq = is_eq and self.repository_id == value.repository_id
        is_eq = is_eq and self.branch == value.branch
        is_eq = is_eq and self.commit_sha == value.commit_sha
        is_eq = is_eq and self.status == value.status
        is_eq = is_eq and self.conclusion == value.conclusion
        is_eq = is_eq and self.workflow_event_trigger == value.workflow_event_trigger
        is_eq = is_eq and self.issuer_name == value.issuer_name
        is_eq = is_eq and self.created_at == value.created_at
        is_eq = is_eq and self.updated_at == value.updated_at
        is_eq = is_eq and self.build_duration == value.build_duration
        is_eq = is_eq and self.tests_ran == value.tests_ran
        is_eq = is_eq and self.tests_passed == value.tests_passed
        is_eq = is_eq and self.tests_failed == value.tests_failed
        is_eq = is_eq and self.tests_skipped == value.tests_skipped
        is_eq = is_eq and self.tests_total == value.tests_total
        is_eq = is_eq and self.total_jobs == value.total_jobs
        is_eq = is_eq and self.gh_files_added == value.gh_files_added
        is_eq = is_eq and self.gh_files_deleted == value.gh_files_deleted
        is_eq = is_eq and self.gh_files_modified == value.gh_files_modified
        is_eq = is_eq and self.gh_lines_added == value.gh_lines_added
        is_eq = is_eq and self.gh_lines_deleted == value.gh_lines_deleted
        is_eq = is_eq and self.gh_src_churn == value.gh_src_churn
        is_eq = is_eq and self.gh_test_churn == value.gh_test_churn
        is_eq = is_eq and self.gh_src_files == value.gh_src_files
        is_eq = is_eq and self.gh_doc_files == value.gh_doc_files
        is_eq = is_eq and self.gh_other_files == value.gh_other_files
        is_eq = is_eq and self.gh_pull_req_number == value.gh_pull_req_number
        is_eq = is_eq and self.gh_is_pr == value.gh_is_pr
        is_eq = is_eq and self.gh_num_pr_comments == value.gh_num_pr_comments
        is_eq = is_eq and self.gh_sloc == value.gh_sloc
        is_eq = is_eq and self.git_num_committers == value.git_num_committers
        is_eq = is_eq and self.git_commits == value.git_commits
        return is_eq

AggregationPeriod: TypeAlias = Literal["day", "month", "week"]

@dataclass
class TimeInfo:
    min: float
    q1: float
    median: float
    q3: float
    max: float
    average: float

    def __eq__(self, value) -> bool:
        if not isinstance(value, TimeInfo):
            return NotImplemented

        is_eq = self.min == value.min
        is_eq = is_eq and self.q1 == value.q1
        is_eq = is_eq and self.median == value.median
        is_eq = is_eq and self.q3 == value.q3
        is_eq = is_eq and self.max == value.max
        is_eq = is_eq and self.average == value.average

        return is_eq

@dataclass
class StatusInfo:
    numRuns: int
    successes: int
    failures: int
    cancelled: int

    def __eq__(self, value) -> bool:
        if not isinstance(value, StatusInfo):
            return NotImplemented

        is_eq = self.numRuns == value.numRuns
        is_eq = is_eq and self.successes == value.successes
        is_eq = is_eq and self.failures == value.failures
        is_eq = is_eq and self.cancelled == value.cancelled

        return is_eq

@dataclass
class RunInfo:
    repositoryName: str
    workflowNames: list[str]
    branches: list[str]
    authors: list[str]

    def __eq__(self, value) -> bool:
        if not isinstance(value, RunInfo):
            return NotImplemented

        is_eq = self.repositoryName == value.repositoryName
        is_eq = is_eq and self.workflowNames == value.workflowNames
        is_eq = is_eq and self.branches == value.branches
        is_eq = is_eq and self.authors == value.authors

        return is_eq

@dataclass
class AggregationData:
    runsInfo: RunInfo
    aggregationPeriod: AggregationPeriod
    periodStart: date
    statusInfo: StatusInfo
    timeInfo: TimeInfo

    def __eq__(self, value) -> bool:
        if not isinstance(value, AggregationData):
            return NotImplemented

        is_eq = self.runsInfo == value.runsInfo
        is_eq = is_eq and self.aggregationPeriod == value.aggregationPeriod
        is_eq = is_eq and self.periodStart == value.periodStart
        is_eq = is_eq and self.statusInfo == value.statusInfo
        is_eq = is_eq and self.timeInfo == value.timeInfo

        return is_eq

@dataclass
class NewDataMessage:
    type: ClassVar[Literal["newData"]] = "newData"
    data: AggregationData

@dataclass
class InitialDataMessage:
    type: ClassVar[Literal["initialData"]] = "initialData"
    data: list[AggregationData]
