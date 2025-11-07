from core.models import *
from extraction.extractor import *
import analysis.aggregation as agg
import json
from typing import Any, AsyncGenerator, cast

@dataclass
class AggregationFilters:
    aggregationPeriod: AggregationPeriod = "month"
    startDate: date = date(2000, 1, 1)
    endDate: date = date(2100, 1, 1)
    author: str | None = None
    branch: str | None = None
    workflowName: str | None = None


async def send_data(ws: Any, repo: str, filters: AggregationFilters):
    # TODO: Handle initial data

    # TODO: Get real async data source
    async def raw_data_source():
        # TODO: Use real github token
        data, _ = extract_data(repo, "", filters.startDate, filters.endDate)
        raw_data_list = RawData.from_data_frame(cast(Any, data))
        for raw_data in raw_data_list:
            yield raw_data

    async def apply_filters(gen: AsyncGenerator[RawData, None]) -> AsyncGenerator[RawData, None]:
        async for data in gen:
            if filters.workflowName != None and filters.workflowName != data.workflow_name:
                continue
            if filters.branch != None and filters.branch != data.branch:
                print(f"Not the same branch: wanted '{filters.branch}', got '{data.branch}'")
                continue
            if filters.author != None and filters.author != data.issuer_name:
                continue

            # TODO: check if this is equivalent to transforming the filter dates into datetimes
            if filters.startDate > data.created_at.date() or filters.endDate <= data.created_at.date():
                continue

            yield data

    periods = agg.separate_into_periods(apply_filters(raw_data_source()), filters.aggregationPeriod)

    async for period, periodStart, _ in periods:
        aggregated = agg.aggregate_one_period(period, periodStart, filters.aggregationPeriod)
        message = NewDataMessage(aggregated)

        def json_default(o: Any):
            if isinstance(o, datetime.datetime):
                return o.isoformat()
            elif isinstance(o, NewDataMessage) or isinstance(o, InitialDataMessage):
                return {
                    "type": o.type,
                    "data": o.data
                }
            else:
                return o.__dict__

        ws.send(json.dumps(message, default=json_default))

    ws.close()
