from flask_sqlalchemy import SQLAlchemy
from dataclasses import dataclass
from datetime import date
from typing import Literal, ClassVar, TypeAlias

db = SQLAlchemy()

# ================================
# Repository
# ================================
class Repository(db.Model):
    __tablename__ = "repositories"

    id = db.Column(db.Integer, primary_key=True)
    repo_name = db.Column(db.String(255), unique=True, nullable=False)
    owner = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)

    workflows = db.relationship("Workflow", backref="repository", lazy=True)
    runs = db.relationship("WorkflowRun", backref="repository", lazy=True)


# ================================
# Workflow
# ================================
class Workflow(db.Model):
    __tablename__ = "workflows"

    id = db.Column(db.Integer, primary_key=True)
    workflow_id = db.Column(db.BigInteger, unique=True)
    workflow_name = db.Column(db.String(255), nullable=False)

    repository_id = db.Column(
        db.Integer,
        db.ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False
    )

    created_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime)

    runs = db.relationship("WorkflowRun", backref="workflow", lazy=True)


# ================================
# WorkflowRun
# ================================
class WorkflowRun(db.Model):
    __tablename__ = "workflow_runs"

    id = db.Column(db.Integer, primary_key=True)

    # Identifiants
    id_build = db.Column(db.BigInteger, unique=True, nullable=False)

    workflow_id = db.Column(
        db.Integer,
        db.ForeignKey("workflows.id", ondelete="CASCADE"),
        nullable=False
    )

    repository_id = db.Column(
        db.Integer,
        db.ForeignKey("repositories.id", ondelete="CASCADE"),
        nullable=False
    )

    # Git context
    branch = db.Column(db.String(255))
    issuer_name = db.Column(db.String(255))

    # Status
    status = db.Column(db.String(50))
    conclusion = db.Column(db.String(50))

    # Trigger
    workflow_event_trigger = db.Column(db.String(100))

    # Timestamps
    created_at = db.Column(db.DateTime, nullable=False)
    updated_at = db.Column(db.DateTime)

    # Duration
    build_duration = db.Column(db.Float)


# ==========================================================
# Structures utilisées par l’UI
# ==========================================================

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
