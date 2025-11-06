from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal, Self
from pandas import DataFrame

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

    @classmethod
    def from_data_frame(cls, df: DataFrame) -> list[Self]:
        return [
            cls(
                str(row["repo"]),
                int(row["id_build"]),
                int(row["workflow_id"]),
                str(row["issuer_name"]),
                str(row["branch"]),
                str(row["commit_sha"]),
                str(row["languages"]),
                str(row["status"]),
                str(row["workflow_event_trigger"]),
                str(row["conclusion"]),
                datetime.fromisoformat(str(row["created_at"])),
                datetime.fromisoformat(str(row["updated_at"])),
                float(row["build_duration"]),
                int(row["total_builds"]),
                datetime.fromisoformat(str(row["gh_first_commit_created_at"])),
                str(row["build_language"]),
                int(row["dependencies_count"]),
                float(row["workflow_size"]),
                str(row["test_framework"]),
                str(row["workflow_name"]),
                float(row["fetch_duration"]),
            )
            for _, row in df.iterrows()
        ]


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

type AggregationPeriod = Literal["day", "month", "week"]

@dataclass
class AggregationData:
    runInfo: RunInfo
    aggregationPeriod: AggregationPeriod
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

