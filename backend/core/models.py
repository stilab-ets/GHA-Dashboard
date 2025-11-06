from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

@dataclass
class RawData:
    repo: str
    id_build: int
    workflow_id: int
    issuer_name: str
    branch: str
    commit_sha: str
    languages: str
    status: str
    workflow_event_trigger: str
    conclusion: str
    created_at: datetime
    updated_at: datetime
    build_duration: float
    total_builds: int
    gh_first_commit_created_at: datetime
    build_language: str
    dependencies_count: int
    workflow_size: float
    test_framework: str
    workflow_name: str
    fetch_duration: float

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
    workflowName: str
    branch: str
    author: str

@dataclass
class AggregationData:
    runInfo: RunInfo
    aggregationPeriod: Literal["day", "month", "week"]
    periodStart: date
    statusInfo: StatusInfo
    timeInfo: TimeInfo

@dataclass
class NewDataMessage:
    type: Literal["newData"]
    data: AggregationData

@dataclass
class InitialDataMessage:
    type: Literal["initialData"]
    data: list[AggregationData]

