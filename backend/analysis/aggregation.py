from core.models import *

from typing import AsyncIterator, AsyncGenerator
from datetime import datetime as dt, date, timedelta
from math import floor

def period_bounds_from_date(date: date, aggregationPeriod: AggregationPeriod) -> tuple[dt, dt]:
    if aggregationPeriod == "day":
        periodStart = dt(date.year, date.month, date.day)
        periodEnd = periodStart + timedelta(days=1)
        return (periodStart, periodEnd)
    elif aggregationPeriod == "week":
        calendar = date.isocalendar()
        periodStart = dt.fromisocalendar(calendar.year, calendar.week, 1)
        periodEnd = periodStart + timedelta(weeks=1)
        return (periodStart, periodEnd)
    elif aggregationPeriod == "month":
        periodStart = dt(date.year, date.month, 1)
        if date.month == 12:
            periodEnd = dt(date.year + 1, 1, 1)
        else:
            periodEnd = dt(date.year, date.month + 1, 1)
        return (periodStart, periodEnd)

async def separate_into_periods(runs: AsyncIterator[RawData], aggregationPeriod: AggregationPeriod) -> AsyncGenerator[tuple[list[RawData], dt, dt], None]:
    result = []
    periodStart: datetime | None = None
    periodEnd: datetime | None = None

    async for run in runs:
        if periodStart == None or periodEnd == None:
            periodStart, periodEnd = period_bounds_from_date(run.created_at.date(), aggregationPeriod)
            result.append(run)
        else:
            if run.created_at < periodStart or run.created_at >= periodEnd:
                yield (result, periodStart, periodEnd)
                periodStart, periodEnd = period_bounds_from_date(run.created_at.date(), aggregationPeriod)
                result = [run]
            else:
                result.append(run)

def aggregate_one_period(runs: list[RawData], periodStart: date, aggregationPeriod: AggregationPeriod) -> AggregationData:
    # Runs info
    workflow_names: set[str] = set()
    branches: set[str] = set()
    authors: set[str] = set()

    # Run status
    num_runs: int = len(runs)
    num_successes: int = 0
    num_failures: int = 0
    num_cancelled: int = 0

    # Time info
    build_times: list[float] = []
    average_build_time: float = 0

    for run in runs:
        workflow_names.add(run.workflow_name)
        branches.add(run.branch)
        authors.add(run.issuer_name)

        build_times.append(run.build_duration)
        average_build_time += run.build_duration / num_runs

        if run.conclusion == "success":
            num_successes += 1
        elif run.conclusion == "failure":
            num_failures += 1
        elif run.conclusion == "cancelled":
            num_cancelled += 1

    sorted_build_times = [x for x in sorted(build_times)]

    median_idx = num_runs * 0.5

    # Median index is not an integer
    if median_idx % 1 != 0:
        median = sorted_build_times[floor(median_idx)]
    else:
        median = (sorted_build_times[int(median_idx)] + sorted_build_times[int(median_idx) - 1]) / 2

    q1_idx = num_runs * 0.25
    if q1_idx % 1 != 0:
        q1 = sorted_build_times[floor(q1_idx)]
    else:
        q1 = (sorted_build_times[int(q1_idx)] + sorted_build_times[int(q1_idx) - 1]) / 2

    q3_idx = num_runs * 0.75
    if q3_idx % 1 != 0:
        q3 = sorted_build_times[floor(q3_idx)]
    else:
        q3 = (sorted_build_times[int(q3_idx)] + sorted_build_times[int(q3_idx) - 1]) / 2

    return AggregationData(
        RunInfo(
            runs[0].repo,
            list(workflow_names),
            list(branches),
            list(authors),
        ),
        aggregationPeriod,
        periodStart,
        StatusInfo(
            num_runs,
            num_successes,
            num_failures,
            num_cancelled,
        ),
        TimeInfo(
            sorted_build_times[0],
            q1,
            median,
            q3,
            sorted_build_times[-1],
            average_build_time,
        )
    )

from extraction.extractor import *
from typing import cast, Any
import asyncio
import json

def test(aggregationPeriod: AggregationPeriod):
    res = extract_data("rust-lang/crates.io", "", "2024-04-01", "2025-10-31")
    df = cast(DataFrame, res[0])

    raw_data = RawData.from_data_frame(df)

    async def gen() -> AsyncGenerator[RawData, None]:
        for data in raw_data:
            await asyncio.sleep(0.01)
            yield data

    async def runner():
        async for data, periodStart, _periodEnd in separate_into_periods(gen(), aggregationPeriod):
            aggregated = aggregate_one_period(data, periodStart, aggregationPeriod)

            def serialize_default(any: Any) -> Any:
                if isinstance(any, dt):
                    return any.isoformat()
                else:
                    return any.__dict__

            print(json.dumps(aggregated, default=serialize_default))

    asyncio.run(runner())
