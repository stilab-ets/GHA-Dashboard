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
