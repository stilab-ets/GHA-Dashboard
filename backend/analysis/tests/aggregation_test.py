from models import AggregationPeriod
import analysis.aggregation as agg

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
