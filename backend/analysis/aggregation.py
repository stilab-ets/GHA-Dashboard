from models import WorkflowRun, AggregationPeriod, AggregationData, RunInfo, StatusInfo, TimeInfo

from typing import AsyncIterator, AsyncGenerator
from datetime import datetime as dt, date, timedelta
from math import floor

# Import the metrics system
from .metrics import get_registry, MetricResult

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

async def separate_into_periods(runs: AsyncIterator[WorkflowRun], aggregationPeriod: AggregationPeriod) -> AsyncGenerator[tuple[list[WorkflowRun], dt, dt], None]:
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
    periodStart: dt = dt.max
    periodEnd: dt = dt.min

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


def aggregate_one_period(runs: list[WorkflowRun], periodStart: date, aggregationPeriod: AggregationPeriod) -> AggregationData:
    """
    Takes a list of pre-separated sets of raw data, aggregates the data and
    returns the data representation to be sent to the WebSocket.
    
    This function now uses the extensible metrics system. To add new metrics,
    create a MetricCalculator class and register it.

    Args:
        runs (list[WorkflowRun]): The runs to be aggregated.
        periodStart (date): The start of the period. Used only for the
            final object.
        aggregationPeriod (AggregationPeriod): The length of the period over
            which the data was aggregated. Used only for the final object

    Returns:
        The aggregated data to be sent to the WebSocket.
    """
    
    if not runs:
        # Return empty aggregation if no runs
        return AggregationData(
            RunInfo("", [], [], []),
            aggregationPeriod,
            periodStart,
            StatusInfo(0, 0, 0, 0),
            TimeInfo(0, 0, 0, 0, 0, 0)
        )
    
    # Get the metric registry and calculate all metrics
    registry = get_registry()
    metric_results = registry.calculate_all(runs)
    
    # Extract results (with fallback for missing metrics)
    status_result = metric_results.get("status")
    time_result = metric_results.get("time")
    run_info_result = metric_results.get("run_info")
    
    # Build AggregationData from metric results
    # Fallback to empty values if metrics are missing (shouldn't happen with default metrics)
    if not run_info_result:
        # Fallback: construct RunInfo manually if metric failed
        repo_name = runs[0].repository.repo_name if runs and runs[0].repository else ""
        workflow_names = set()
        branches = set()
        authors = set()
        for run in runs:
            if run.workflow and run.workflow.workflow_name:
                workflow_names.add(run.workflow.workflow_name)
            if run.branch:
                branches.add(run.branch)
            if run.issuer_name:
                authors.add(run.issuer_name)
        run_info_result = MetricResult(
            name="run_info",
            value=RunInfo(repo_name, list(workflow_names), list(branches), list(authors))
        )
    
    return AggregationData(
        run_info_result.value,
        aggregationPeriod,
        periodStart,
        status_result.value if status_result else StatusInfo(0, 0, 0, 0),
        time_result.value if time_result else TimeInfo(0, 0, 0, 0, 0, 0)
    )
