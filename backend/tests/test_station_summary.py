"""Offline station-summary tests. No test opens a database connection."""

import json
import re
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import compute_channel_activity_boundaries
from app.reporting.models import StationSummaryQuery
from app.reporting.repository import (
    FAILURE_RATE_LIMITS_SQL,
    FAILURE_RATE_PERIOD_SQL,
    FAILURE_RATE_RUN_CAP,
    STATION_SUMMARY_SQL,
    SqlServerReportingRepository,
    build_station_summary_queries,
    summarize_failure_rate,
    summarize_station_summary,
)
from app.schemas import StationSummaryConnectedResponse

EXTRACTED_AT = datetime(2026, 11, 13, 20, tzinfo=UTC)


def snapshot(fail: str = "2.5000") -> str:
    return json.dumps(
        {
            "model": "OSX-100",
            "wavelength_mode": "SM",
            "profile_name": "DEMO-STATION",
            "revision": "DEMO-1",
            "too_good_below_db": 0,
            "warning_enabled": False,
            "warning_above_db": None,
            "fail_above_db": fail,
            "minimum_replacement_improvement_db": 0.2,
        }
    )


LIMITS = [
    (1, "SM", snapshot()),
    (2, "SM", snapshot()),
    (3, "SM", "not-json"),
    (4, "SM", snapshot()),
    (5, "SM", snapshot()),
]
# run, station, unit, front panel, SQL limit, first-obs observed, failed,
# active and retested run-channels, elapsed ms
ROWS = [
    (1, 2, 10, 48, Decimal("2.5000"), 48, 2, 48, 3, 960_000),
    (2, 2, 10, 48, Decimal("2.5000"), 10, 0, 12, 0, None),
    (3, 1, 11, 24, None, 24, 1, 24, 0, 480_000),
    (4, None, 12, 36, Decimal("2.6000"), 36, 4, 36, 6, 720_000),
    (5, 1, 13, 24, Decimal("2.5000"), 24, 1, 24, 2, 600_000),
]


def test_sql_reuses_shared_ctes_and_binds_the_thirty_day_window():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    query = StationSummaryQuery(purposes=("production", "engineering"))
    (sql, params), (limits_sql, limit_params) = build_station_summary_queries(query, boundaries)
    window = boundaries.periods["last_30_days"]
    start, end = window.start_utc.replace(tzinfo=None), window.end_utc.replace(tzinfo=None)
    filters = (
        start,
        end,
        "production",
        "engineering",
        "engineering",
        "engineering",
        None,
        None,
        None,
        None,
    )
    assert sql == STATION_SUMMARY_SQL and limits_sql == FAILURE_RATE_LIMITS_SQL
    assert params == (start, end, *filters) and limit_params == filters
    assert sql.count("?") == len(params) == 12
    shared = FAILURE_RATE_PERIOD_SQL.split("candidate_runs AS (", 1)[1].split(
        "windowed_observations AS (", 1
    )[0]
    assert shared in sql
    assert "MAX(CASE WHEN o.observation_rank > 1 THEN 1 ELSE 0 END) AS retested" in sql
    assert "o.written_at_utc >= w.start_utc AND o.written_at_utc < w.end_utc" in sql
    assert "f.wavelength_1_il_db > p.sql_fail_limit" in sql
    assert "CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE t.elapsed_ms END" in sql
    assert "operator" not in sql.lower()
    unquoted = re.sub(r"'[^']*'", "", sql)
    assert not re.search(
        r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE|INTO)\b", unquoted, re.I
    )
    for match in re.finditer(r"JSON_VALUE\(", sql):
        assert "ISJSON(" in sql[match.end() : match.end() + 80]


def test_summary_groups_by_station_with_null_last_and_distinct_units():
    result = summarize_station_summary(ROWS, LIMITS)
    assert [s.station_number for s in result.stations] == [1, 2, None]
    one, two, none = result.stations
    # Station 2: two runs on one unit; run 2 is open, so only run 1 has timing.
    assert (two.runs, two.units) == (2, 1)
    assert (two.failed, two.observed, two.unknown_criteria) == (2, 58, 0)
    assert two.seconds_per_channel.model_dump() == {"median": "20.0000", "n": 1}
    assert (two.active_run_channels, two.retested_run_channels) == (60, 3)
    assert two.retest_share == 3 / 60
    # Station 1: run 3 has an invalid snapshot, so its first observations are unknown.
    assert (one.failed, one.observed, one.unknown_criteria) == (1, 24, 24)
    assert one.seconds_per_channel.model_dump() == {"median": "22.5000", "n": 2}
    # No station recorded: run 4's SQL limit disagrees with Python's.
    assert none.rate is None and none.unknown_criteria == 36
    totals = result.totals
    assert (totals.runs, totals.units) == (5, 4)
    assert (totals.failed, totals.observed, totals.unknown_criteria) == (3, 82, 60)
    assert totals.rate == 3 / 82
    assert (totals.active_run_channels, totals.retested_run_channels) == (144, 11)
    assert totals.seconds_per_channel.model_dump() == {"median": "20.0000", "n": 4}
    assert result.incomplete is False


def test_station_sums_equal_failure_rate_period_totals_for_the_same_runs():
    period_rows = [(3, row[0], row[5], row[6], row[4]) for row in ROWS if row[5] > 0]
    period = summarize_failure_rate(period_rows, [], LIMITS).periods["last_30_days"]
    totals = summarize_station_summary(ROWS, LIMITS).totals
    assert (totals.failed, totals.observed, totals.unknown_criteria) == (
        period.failed,
        period.observed,
        period.unknown_criteria,
    )


def test_empty_and_even_median_and_fail_closed_rows():
    empty = summarize_station_summary([], LIMITS)
    assert empty.stations == () and empty.totals.rate is None and empty.totals.retest_share is None
    assert empty.totals.seconds_per_channel.median is None
    limits = [(index, "SM", snapshot()) for index in range(1, FAILURE_RATE_RUN_CAP + 2)]
    assert summarize_station_summary([], limits).incomplete is True
    good = ROWS[0]
    for bad in [
        good[:9],
        (99, *good[1:]),  # run outside the limit set
        (1, 0, *good[2:]),  # nonpositive station
        (1, 2, 10, 48, Decimal("2.5000"), 48, 49, 48, 3, 960_000),  # failed > observed
        (1, 2, 10, 48, Decimal("2.5000"), 49, 0, 48, 3, 960_000),  # observed > active
        (1, 2, 10, 48, Decimal("2.5000"), 48, 0, 48, 49, 960_000),  # retested > active
        (1, 2, 10, 48, Decimal("2.5000"), 0, 0, 0, 0, None),  # no activity
        (1, 2, 10, 48, Decimal("2.5000"), 48, 0, 48, 0, -1),
    ]:
        with pytest.raises(ReportingError, match="schema_incompatible"):
            summarize_station_summary([bad], LIMITS)
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_station_summary([good, good], LIMITS)


class FakeCursor:
    def __init__(self, rows, limit_rows):
        self.results = [rows, limit_rows]
        self.executed = []
        self.fetch_sizes = []

    def execute(self, sql, params=()):
        self.executed.append((sql, params))
        return self

    def fetchmany(self, size):
        self.fetch_sizes.append(size)
        return self.results.pop(0)


class FakeAdapter:
    def __init__(self, cursor):
        self._cursor = cursor

    def cursor(self):
        cursor = self._cursor

        class Context:
            def __enter__(self):
                return cursor

            def __exit__(self, *exc):
                return False

        return Context()


def test_repository_reads_capped_rows_and_rejects_overflow(monkeypatch):
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    monkeypatch.setattr(SqlServerReportingRepository, "_preflight", lambda self, cursor: None)
    cursor = FakeCursor(ROWS, LIMITS)
    result = SqlServerReportingRepository(FakeAdapter(cursor)).get_station_summary(
        StationSummaryQuery(), boundaries
    )
    assert result.totals.runs == 5
    assert [sql for sql, _ in cursor.executed] == [STATION_SUMMARY_SQL, FAILURE_RATE_LIMITS_SQL]
    assert cursor.fetch_sizes == [FAILURE_RATE_RUN_CAP + 1, FAILURE_RATE_RUN_CAP + 1]
    monkeypatch.setattr("app.reporting.repository.FAILURE_RATE_RUN_CAP", 2)
    with pytest.raises(ReportingError, match="schema_incompatible"):
        SqlServerReportingRepository(FakeAdapter(FakeCursor(ROWS, LIMITS))).get_station_summary(
            StationSummaryQuery(), boundaries
        )


class FakeRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_station_summary(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error is not None:
            raise self.error
        return self.result


def test_disabled_returns_only_not_connected(client):
    response = client.get("/api/v1/reporting/station-summary")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}


def test_connected_contract_and_purposes(application):
    fake = FakeRepository(summarize_station_summary(ROWS, LIMITS))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/station-summary",
            params=[("purpose", "production"), ("purpose", "engineering")],
        )
    assert response.status_code == 200
    body = response.json()
    result = StationSummaryConnectedResponse.model_validate(body)
    assert result.period.key == "last_30_days"
    assert result.filters.purpose == ["production", "engineering"]
    assert [s.station_number for s in result.stations] == [1, 2, None]
    assert body["stations"][1]["seconds_per_channel"] == {"median": "20.0000", "n": 1}
    query, _ = fake.calls[0]
    assert query.purposes == ("production", "engineering")


def test_invalid_purpose_and_period_parameter_are_rejected(application):
    fake = FakeRepository(summarize_station_summary([], LIMITS))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    with TestClient(application) as client:
        assert (
            client.get("/api/v1/reporting/station-summary", params={"purpose": "x"}).status_code
            == 422
        )
        assert (
            client.get("/api/v1/reporting/station-summary", params={"period": "today"}).status_code
            == 422
        )
    assert fake.calls == []


def test_failure_is_exact_sanitized_503(application):
    fake = FakeRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "encrypted_unverified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get("/api/v1/reporting/station-summary")
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}
