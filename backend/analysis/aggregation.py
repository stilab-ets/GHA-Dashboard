from core.models import *

from typing import AsyncIterator, AsyncGenerator
from datetime import datetime as dt, date, timedelta

@dataclass
class AggregationFilters:
    runInfo: RunInfo
    aggregationPeriod: AggregationPeriod
    startDate: date
    endDate: date

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
