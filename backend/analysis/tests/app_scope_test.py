import importlib
import sys
from datetime import date

import pytest


def _load_app(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["app.py"])
    sys.modules.pop("app", None)
    return importlib.import_module("app")


def test_build_aggregation_filters_parses_date_range_and_workflow_ids(monkeypatch):
    app_module = _load_app(monkeypatch)

    filters = app_module._build_aggregation_filters({
        "start": "2026-06-01",
        "end": "2026-06-30",
        "workflowIds": ["111", 222],
        "fetchJobDetails": "true",
    })

    assert filters.startDate == date(2026, 6, 1)
    assert filters.endDate == date(2026, 6, 30)
    assert filters.workflowIds == [111, 222]
    assert filters.fetchJobDetails is True


def test_build_aggregation_filters_parses_refresh_workflow_ids_separately(monkeypatch):
    app_module = _load_app(monkeypatch)

    filters = app_module._build_aggregation_filters({
        "workflowIds": ["111", "222"],
        "refreshWorkflowIds": ["333"],
    })

    assert filters.workflowIds == [111, 222]
    assert filters.refreshWorkflowIds == [333]


def test_build_aggregation_filters_defaults_blank_scope_to_beginning_through_today(monkeypatch):
    app_module = _load_app(monkeypatch)

    filters = app_module._build_aggregation_filters({
        "start": "",
        "end": "",
    })

    assert filters.startDate == date(2000, 1, 1)
    assert filters.endDate == date.today()


@pytest.mark.parametrize("payload", [
    {"start": "not-a-date"},
    {"workflowIds": ["abc"]},
])
def test_build_aggregation_filters_rejects_invalid_scope(monkeypatch, payload):
    app_module = _load_app(monkeypatch)

    with pytest.raises(ValueError):
        app_module._build_aggregation_filters(payload)


def test_filter_runs_for_scope_filters_dates_workflows_and_dedupes(monkeypatch):
    app_module = _load_app(monkeypatch)
    filters = app_module._build_aggregation_filters({
        "start": "2026-06-01",
        "end": "2026-06-30",
        "workflowIds": [10],
    })
    runs = [
        {"id": 1, "workflow_id": 10, "created_at": "2026-06-02T10:00:00Z"},
        {"id": 1, "workflow_id": 10, "created_at": "2026-06-02T10:00:00Z"},
        {"id": 2, "workflow_id": 20, "created_at": "2026-06-03T10:00:00Z"},
        {"id": 3, "workflow_id": 10, "created_at": "2026-07-01T10:00:00Z"},
        {"id": 4, "workflow_id": 10, "created_at": "2026-06-30T23:59:59Z"},
    ]

    scoped = app_module._filter_runs_for_scope(runs, filters)

    assert [run["id"] for run in scoped] == [1, 4]


def test_attach_persisted_jobs_to_runs_keeps_cached_websocket_jobs(monkeypatch):
    from analysis import endpoint as endpoint_module

    class PersistenceStub:
        def get_jobs_for_run(self, repo, run_id):
            if repo == "owner/repo" and run_id == "101":
                return [{"name": "build", "conclusion": "success"}]
            return None

    runs = [
        {"id": 101, "workflow_id": 10, "created_at": "2026-06-02T10:00:00Z"},
        {"id": 102, "workflow_id": 10, "created_at": "2026-06-03T10:00:00Z", "jobs": []},
    ]

    hydrated = endpoint_module._attach_persisted_jobs_to_runs("owner/repo", runs, PersistenceStub())

    assert hydrated[0]["jobs"] == [{"name": "build", "conclusion": "success"}]
    assert hydrated[1]["jobs"] == []
    assert "jobs" not in runs[0]


def test_send_ws_json_treats_closed_client_as_disconnect():
    from analysis import endpoint as endpoint_module

    class ConnectionClosed(Exception):
        pass

    class ClosedWebSocket:
        def send(self, payload):
            raise ConnectionClosed("Connection closed: 1005")

    with pytest.raises(endpoint_module.WebSocketClientDisconnected):
        endpoint_module._send_ws_json(ClosedWebSocket(), {"type": "runs"})


def test_phase2_job_collection_can_be_limited_to_refreshed_workflows(monkeypatch):
    import ghaminer_stream

    monkeypatch.setattr(ghaminer_stream, "DATA_PERSISTENCE_AVAILABLE", False)
    requested_run_ids = []

    def fake_get_jobs_for_run(repo, run_id, token):
        requested_run_ids.append(run_id)
        return [], [{"job_name": "test", "job_result": "success", "job_duration": 1}], 1

    monkeypatch.setattr(ghaminer_stream, "get_jobs_for_run", fake_get_jobs_for_run)

    runs = [
        {"id": 101, "workflow_id": 10, "created_at": "2026-06-02T10:00:00Z"},
        {"id": 202, "workflow_id": 20, "created_at": "2026-06-03T10:00:00Z"},
    ]

    collected = list(ghaminer_stream.stream_job_details_phase2(
        "owner/repo",
        "token",
        runs,
        {"fetch_job_details": True, "job_workflow_ids": [20]},
    ))

    assert requested_run_ids == [202]
    assert [run["id"] for run, _, _ in collected] == [202]
