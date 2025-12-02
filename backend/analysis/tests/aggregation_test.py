import analysis.aggregation as agg
from models import AggregationData, AggregationPeriod, RunInfo, StatusInfo, TimeInfo, WorkflowRun, Workflow, Repository
from typing import TypeAlias

import asyncio
import datetime as dt

import pytest

# ===================================
# || period_bounds_from_date tests ||
# ===================================
@pytest.mark.parametrize('date, aggregation_period, expected', [
    # "day" tests
    (dt.date(2025, 11, 15), "day", (dt.datetime(2025, 11, 15), dt.datetime(2025, 11, 16))),
    (dt.date(2025, 11, 30), "day", (dt.datetime(2025, 11, 30), dt.datetime(2025, 12, 1))),
    (dt.date(2025, 12, 31), "day", (dt.datetime(2025, 12, 31), dt.datetime(2026, 1, 1))),

    # "week" tests
    (dt.date(2025, 11, 13), "week", (dt.datetime(2025, 11, 10), dt.datetime(2025, 11, 17))),
    (dt.date(2025, 11, 26), "week", (dt.datetime(2025, 11, 24), dt.datetime(2025, 12, 1))),
    (dt.date(2025, 10, 29), "week", (dt.datetime(2025, 10, 27), dt.datetime(2025, 11, 3))),
    (dt.date(2025, 12, 29), "week", (dt.datetime(2025, 12, 29), dt.datetime(2026, 1, 5))),
    (dt.date(2025, 12, 30), "week", (dt.datetime(2025, 12, 29), dt.datetime(2026, 1, 5))),
    (dt.date(2025, 12, 31), "week", (dt.datetime(2025, 12, 29), dt.datetime(2026, 1, 5))),
    (dt.date(2026, 1, 1), "week", (dt.datetime(2025, 12, 29), dt.datetime(2026, 1, 5))),
    (dt.date(2026, 1, 2), "week", (dt.datetime(2025, 12, 29), dt.datetime(2026, 1, 5))),
    (dt.date(2026, 1, 3), "week", (dt.datetime(2025, 12, 29), dt.datetime(2026, 1, 5))),
    (dt.date(2026, 1, 4), "week", (dt.datetime(2025, 12, 29), dt.datetime(2026, 1, 5))),
    (dt.date(2026, 1, 5), "week", (dt.datetime(2026, 1, 5), dt.datetime(2026, 1, 12))),

    # "month" tests
    (dt.date(2025, 11, 1), "month", (dt.datetime(2025, 11, 1), dt.datetime(2025, 12, 1))),
    (dt.date(2025, 11, 15), "month", (dt.datetime(2025, 11, 1), dt.datetime(2025, 12, 1))),
    (dt.date(2025, 11, 30), "month", (dt.datetime(2025, 11, 1), dt.datetime(2025, 12, 1))),
    (dt.date(2025, 12, 1), "month", (dt.datetime(2025, 12, 1), dt.datetime(2026, 1, 1))),
    (dt.date(2025, 12, 15), "month", (dt.datetime(2025, 12, 1), dt.datetime(2026, 1, 1))),
    (dt.date(2025, 12, 31), "month", (dt.datetime(2025, 12, 1), dt.datetime(2026, 1, 1))),
    (dt.date(2026, 1, 1), "month", (dt.datetime(2026, 1, 1), dt.datetime(2026, 2, 1))),
])
def test_correct_period_bounds(date: dt.date,
                               aggregation_period: AggregationPeriod,
                               expected: tuple[dt.datetime, dt.datetime]):
    assert agg.period_bounds_from_date(date, aggregation_period) == expected

# =====================================
# || Dataset creation for next tests ||
# =====================================
N = 31

def _generate_run(index: int) -> WorkflowRun:
    run = WorkflowRun()
    run.workflow = Workflow()
    run.workflow.workflow_name = "CI"
    run.repository = Repository()
    run.repository.repo_name = "rust-lang/crates.io"
    run.branch = "main"
    run.issuer_name = "Gaubbe"
    run.build_duration = float(index + 1)

    if index > N / 2:
        run.conclusion = "success"
    else:
        run.conclusion = "failure"

    run.created_at = dt.datetime(2025, 12, index + 1)

    return run

WORKFLOW_RUN_TEST_DATASET = [_generate_run(i) for i in range(N)]

from asyncio import Future

class DatasetAsyncIter():
    def __aiter__(self):
        self.i = 0
        return self

    def __anext__(self):
        if self.i < N:
            fut = Future()
            fut.set_result(WORKFLOW_RUN_TEST_DATASET[self.i])
            self.i += 1
            return fut
        else:
            raise StopAsyncIteration

# =================================
# || separate_into_periods tests ||
# =================================
ExpectedSet: TypeAlias = list[tuple[list[WorkflowRun], dt.datetime, dt.datetime]]

CORRECT_DAY_SET: ExpectedSet = [
    (
        [WORKFLOW_RUN_TEST_DATASET[i]],
        dt.datetime(2025, 12, i + 1),
        dt.datetime(2025, 12, i + 1) + dt.timedelta(days=1)
    ) for i in range(N)
]

CORRECT_WEEK_SET: ExpectedSet = [
    (WORKFLOW_RUN_TEST_DATASET[0:7], dt.datetime(2025, 12, 1), dt.datetime(2025, 12, 8)),
    (WORKFLOW_RUN_TEST_DATASET[7:14], dt.datetime(2025, 12, 8), dt.datetime(2025, 12, 15)),
    (WORKFLOW_RUN_TEST_DATASET[14:21], dt.datetime(2025, 12, 15), dt.datetime(2025, 12, 22)),
    (WORKFLOW_RUN_TEST_DATASET[21:28], dt.datetime(2025, 12, 22), dt.datetime(2025, 12, 29)),
    (WORKFLOW_RUN_TEST_DATASET[28:31], dt.datetime(2025, 12, 29), dt.datetime(2026, 1, 5)),
]

CORRECT_MONTH_SET: ExpectedSet = [
    (
        WORKFLOW_RUN_TEST_DATASET,
        dt.datetime(2025, 12, 1),
        dt.datetime(2026, 1, 1),
    )
]

@pytest.mark.parametrize('aggregation_period, expected', [
    ("day", CORRECT_DAY_SET),
    ("week", CORRECT_WEEK_SET),
    ("month", CORRECT_MONTH_SET),
])
def test_correct_period_separation(aggregation_period: AggregationPeriod,
                                   expected: ExpectedSet):
    async def exhaust_list() -> ExpectedSet:
        result: ExpectedSet = []
        async for res in agg.separate_into_periods(DatasetAsyncIter(), aggregation_period):
            result.append(res)

        return result

    final_list = asyncio.run(exhaust_list())
    assert final_list == expected

# ================================
# || aggregate_one_period tests ||
# ================================
def test_aggregation():
    data = agg.aggregate_one_period(WORKFLOW_RUN_TEST_DATASET, dt.date(2025, 12, 1), "month")
    expected = AggregationData(
            RunInfo(
                "rust-lang/crates.io",
                ["CI"],
                ["main"],
                ["Gaubbe"],
            ),
            "month",
            dt.date(2025, 12, 1),
            StatusInfo(
                31,
                15,
                16,
                0
            ),
            TimeInfo(
                1.0,
                8.0,
                16.0,
                24.0,
                31.0,
                16.0
            )
        )

    assert data == expected
