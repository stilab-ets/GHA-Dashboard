from models import *
from core.utils.iter import to_async_iter
from extraction.extractor import async_extract_data
import analysis.aggregation as agg
import json
import os
import asyncio
from typing import Any, AsyncIterable, AsyncIterator

from wsproto.frame_protocol import CloseReason

from datetime import date, datetime, time

@dataclass
class AggregationFilters:
    aggregationPeriod: AggregationPeriod = "month"
    startDate: date = date(2000, 1, 1)
    endDate: date = date(2100, 1, 1)
    author: str | None = None
    branch: str | None = None
    workflowName: str | None = None

async def send_data(ws: Any, repo: str, filters: AggregationFilters):
    token = os.getenv("GITHUB_TOKEN")
    if token == None:
        raise RuntimeError("GITHUB_TOKEN envvar is not set!")

    cancellation = asyncio.Event()

    from_db, from_miner = async_extract_data(
        repo,
        token,
        datetime.combine(filters.startDate, time()),
        datetime.combine(filters.endDate, time()),
        cancellation
    )

    def predicate(data: WorkflowRun) -> bool:
        if filters.workflowName != None and filters.workflowName != data.workflow.workflow_name:
            return False
        if filters.branch != None and filters.branch != data.branch:
            return False
        if filters.author != None and filters.author != data.issuer_name:
            return False

        # TODO: check if this is equivalent to transforming the filter dates into datetimes
        if filters.startDate > data.created_at.date() or filters.endDate <= data.created_at.date():
            return False

        return True

    def json_default(o: Any):
        if isinstance(o, datetime):
            return o.isoformat()
        elif isinstance(o, NewDataMessage) or isinstance(o, InitialDataMessage):
            return {
                "type": o.type,
                "data": o.data
            }
        else:
            return o.__dict__

    async def send_data_internal():
        # INITIAL DATA
        initial_periods_iter = agg.separate_into_periods(
            to_async_iter(filter(predicate, from_db)),
            filters.aggregationPeriod
        )

        initial_data = []
        async for period, periodStart, _ in initial_periods_iter:
            aggregated = agg.aggregate_one_period(period, periodStart, filters.aggregationPeriod)
            initial_data.append(aggregated)


        initial_message = InitialDataMessage(initial_data)
        ws.send(json.dumps(initial_message, default=json_default))

        # CONTINUOUS DATA
        async def async_filter() -> AsyncIterator[WorkflowRun]:
            logging.getLogger('flask.app').warning("WAITING FOR FIRST RUN")
            async for run in from_miner:
                if predicate(run):
                    yield run

        periods_iter = agg.separate_into_periods(
            async_filter(),
            filters.aggregationPeriod
        )

        async for period, periodStart, _ in periods_iter:
            aggregated = agg.aggregate_one_period(period, periodStart, filters.aggregationPeriod)
            message = NewDataMessage(aggregated)
            ws.send(json.dumps(message, default=json_default))

    async def set_off_cancellation():
        def _check_ws_closed_sync():
            while ws.close_reason == CloseReason.NO_STATUS_RCVD:
                pass

        await asyncio.to_thread(_check_ws_closed_sync)
        cancellation.set()

    async with asyncio.TaskGroup() as tg:
        tg.create_task(send_data_internal())
        tg.create_task(set_off_cancellation())


    ws.close()
