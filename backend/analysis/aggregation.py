from core.models import *

from typing import AsyncIterator, AsyncGenerator
from datetime import datetime as dt, date, timedelta
from math import floor

def period_bounds_from_date(date: date, aggregationPeriod: AggregationPeriod) -> tuple[dt, dt]:
    """
    Obtain the beginning and end times of a period of given length that
    contains the date passed in.

    Args:
        date (date): The date to be contained in the period.
        aggregationPeriod (AggregationPeriod): The length of the time period
            returned.

    Returns:
        A tuple whose first element is the start time of the period and whose
        second element is the end time of the period, non-inclusive.
    """

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
    """
    Takes an asynchronous iterator to the raw data and, according to the chosen
    aggregation period, returns an iterator of lists of raw data, where all the
    data in those lists come from the same aggregation period.

    This is useful, as it makes our aggregation code agnostic to the period
    length, allowing it to simply aggregate all the values in the list, knowing
    in advace they all belong to the same aggregation period.

    Args:
        runs (AsyncIterator[RawData]): The asynchonous source of the raw data.
        aggregationPeriod (AggregationPeriod): The length of the time period.

    Returns:
        An asynchronous iterator yielding a tuple, whose first element is a
        list containing all the raw data for a single period, whose second
        element is the start time of the period, and whose third element is the
        end time of the period.
    """

    result = []
    periodStart: datetime = dt.max
    periodEnd: datetime = dt.min

    async for run in runs:
        if run.created_at < periodStart or run.created_at >= periodEnd:
            if len(result) > 0:
                yield (result, periodStart, periodEnd)
            periodStart, periodEnd = period_bounds_from_date(run.created_at.date(), aggregationPeriod)
            result = [run]
        else:
            result.append(run)

    # Once we're done with runs, we might have left over runs that didn't
    # trigger the yield. So we yield the rest.
    if len(result) > 0:
        yield (result, periodStart, periodEnd)


def aggregate_one_period(runs: list[RawData], periodStart: date, aggregationPeriod: AggregationPeriod) -> AggregationData:
    """
    Takes a list of pre-separated sets of raw data, aggregates the data and
    returns the data representation to be sent to the WebSocket.

    Args:
        runs (list[RawData]): The runs to be aggregated.
        periodStart (date): The start of the period. Used only for the
            final object.
        aggregationPeriod (AggregationPeriod): The length of the period over
            which the data was aggregated. Used only for the final object

    Returns:
        The aggregated data to be sent to the WebSocket.
    """

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
