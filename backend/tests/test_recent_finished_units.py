"""Offline recent-finished-unit tests. No test opens a database connection."""

import hashlib
import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.models import RecentFinishedUnitsQuery
from app.reporting.recent_finished_units import (
    RECENT_FINISHED_UNIT_CAP,
    RecentFinishedUnit,
    RecentFinishedUnitsMetrics,
    build_recent_finished_unit_queries,
    read_first_observation_failure_counts,
    read_recent_finished_units,
    summarize_recent_finished_units,
)
from app.reporting.repository import _normalized_sql_limit, _validated_failure_limits
from app.reporting.unit_status import ProjectionMeasurement
from app.reporting.unit_test_time import FinishedUnitCohort, FinishedUnitRecord

BASE = datetime(2026, 11, 23, 18, tzinfo=UTC)
LIMITS = (
    '{"model":"OSX-150","mode":"SM","profile_name":"DEMO",'
    '"revision":"DEMO-1","too_good_below_db":-0.5,"warning_enabled":true,'
    '"warning_above_db":2.0,"fail_above_db":2.5}'
)


def reading(channel=1, first=Decimal("1.2500"), second=Decimal("2.7500")):
    return ProjectionMeasurement(
        channel, 10, 100, channel, channel, 1, 1310, first, 1550, second, BASE
    )


def record(unit_id, *, outcome="passed", finished=None, total=600_000, readings=()):
    return FinishedUnitRecord(
        unit_id=unit_id,
        main_board_serial=f"DEMO-UNIT-{unit_id:03d}",
        outcome=outcome,
        exclusion_reason=None,
        finished_at_utc=finished or BASE,
        outside_period=False,
        missing_duration=total is None,
        total_ms=total or 0,
        run_count=1,
        active_run_count=0 if total is None else 1,
        fallback_run_count=0,
        switch_model="OSX-150",
        wavelength_mode="SM",
        channel_count=48,
        effective_readings=tuple(readings),
        fail_limit=Decimal("2.5000"),
    )


def failure(unit, run, channel, a, b, snapshot=LIMITS, sql_limit=Decimal("2.5000")):
    return (unit, run, "SM", snapshot, sql_limit, channel, Decimal(a), Decimal(b))


def summarize(records, stations=(), failures=(), replacements=(), **kwargs):
    return summarize_recent_finished_units(
        records,
        stations,
        failures,
        replacements,
        incomplete=kwargs.get("incomplete", False),
        failure_overflow=kwargs.get("failure_overflow", False),
        validated_failure_limits=_validated_failure_limits,
        normalized_sql_limit=_normalized_sql_limit,
    )


def test_queries_are_bound_bounded_read_only_and_existing_hashes_stay_stable():
    queries = build_recent_finished_unit_queries((7, 9), ("production", "engineering"))
    assert [len(params) for _, params in queries] == [6, 6, 2]
    assert [sql.count("?") for sql, _ in queries] == [6, 6, 2]
    assert "station_number" in queries[0][0]
    assert "ROW_NUMBER() OVER" in queries[1][0]
    assert "COUNT_BIG(DISTINCT replacement.logical_channel)" in queries[2][0]
    assert "JOIN dbo.UNIT_SWITCH_ASSIGNMENTS" in queries[2][0]
    for sql, _ in queries:
        assert "SELECT *" not in sql.upper() and " INTO " not in sql.upper()
        assert not re.search(
            r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE)\b",
            re.sub(r"'(?:''|[^'])*'", "''", sql),
            re.I,
        )
    from app.reporting.unit_test_time import UNIT_TEST_TIME_COHORT_SQL, build_unit_timing_query

    assert (
        hashlib.sha256(UNIT_TEST_TIME_COHORT_SQL.encode()).hexdigest()
        == "7b2858dc9b3eed765201dcbed242d45faf8fb1889b19dd7728"
        "f79403162c0f7c"
    )
    assert (
        hashlib.sha256(build_unit_timing_query((10, 11))[0].encode()).hexdigest()
        == "293e477eba39fe7ff11e08e350aeff2a07aa5fc5e0372f67f"
        "7f0f29eaf12a8aa"
    )


def test_rows_include_missing_duration_historical_replacement_failures_and_worst_effective_il():
    records = (
        record(
            2,
            outcome="unrecoverable",
            finished=BASE + timedelta(hours=1),
            total=None,
            readings=(reading(1),),
        ),
        record(1, readings=(reading(1, Decimal("2.5000"), Decimal("2.4000")),)),
    )
    result = summarize(
        records,
        stations=((1, 2), (2, None)),
        failures=(
            failure(1, 10, 1, "2.6", "1.0"),
            failure(1, 11, 1, "2.7", "1.0"),
            failure(1, 11, 2, "2.5", "2.5"),
            failure(2, 20, 1, "3.0", "1.0"),
        ),
        replacements=((1, 1),),
    )
    assert [item.unit_id for item in result.units] == [2, 1]
    assert result.units[0].total_ms is None
    assert result.units[0].station_number is None
    assert result.units[0].outcome == "unrecoverable"
    assert result.units[1].outcome == "passed_after_replacement"
    assert result.units[1].failed_channels == 1
    assert result.units[1].station_number == 2
    assert result.units[1].worst_il_db == Decimal("2.5000")
    assert result.units[1].worst_il_wavelength_nm == 1310
    assert result.units[1].worst_il_over_limit is False


def test_unknown_criteria_sets_null_and_flag_and_bad_rows_fail_closed():
    invalid = '{"mode":"SM","fail_above_db":"bad"}'
    result = summarize((record(1),), failures=(failure(1, 10, 1, "3", "1", invalid, None),))
    assert result.units[0].failed_channels is None
    assert result.units[0].failed_unknown is True
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize((record(1),), failures=((1, 10),))


class FailureRowsCursor:
    def __init__(self, rows):
        self.rows = rows

    def execute(self, *_args):
        return self

    def fetchmany(self, _size):
        return self.rows


def test_shared_failure_follow_up_marks_row_and_criteria_caps_incomplete(monkeypatch):
    rows = (
        failure(1, 10, 1, "1", "1"),
        failure(2, 20, 1, "1", "1"),
    )
    monkeypatch.setattr("app.reporting.recent_finished_units.RECENT_FAILURE_ROW_CAP", 1)
    counts, incomplete = read_first_observation_failure_counts(
        FailureRowsCursor(rows),
        (1, 2),
        ("production",),
        validated_failure_limits=_validated_failure_limits,
        normalized_sql_limit=_normalized_sql_limit,
    )
    assert counts == {1: 0, 2: 0} and incomplete is True

    counts, incomplete = read_first_observation_failure_counts(
        FailureRowsCursor(rows[:1]),
        (1,),
        ("production",),
        validated_failure_limits=lambda _rows: ({}, True),
        normalized_sql_limit=_normalized_sql_limit,
    )
    assert counts == {1: None} and incomplete is True


def test_unfinished_open_and_outside_period_records_are_not_listed():
    excluded = (
        record(1),
        record(2),
        record(3),
        record(4),
    )
    excluded = (
        excluded[0],
        FinishedUnitRecord(**(excluded[1].__dict__ | {"outcome": None})),
        FinishedUnitRecord(**(excluded[2].__dict__ | {"exclusion_reason": "run_in_progress"})),
        FinishedUnitRecord(**(excluded[3].__dict__ | {"outside_period": True})),
    )
    result = summarize(
        excluded,
        failures=(failure(1, 10, 1, "1", "1"),),
    )
    assert [item.unit_id for item in result.units] == [1]


def test_ordering_truncation_and_incomplete_flags():
    records = tuple(
        record(index, finished=BASE - timedelta(minutes=index // 2))
        for index in range(1, RECENT_FINISHED_UNIT_CAP + 2)
    )
    listed = records[:RECENT_FINISHED_UNIT_CAP]
    result = summarize(
        records,
        failures=tuple(failure(item.unit_id, item.unit_id, 1, "1", "1") for item in listed),
        incomplete=True,
        failure_overflow=True,
    )
    assert len(result.units) == 100
    assert result.truncated is True and result.incomplete is True
    assert [item.unit_id for item in result.units[:2]] == [1, 2]


class NoQueryCursor:
    def execute(self, *_args):
        raise AssertionError("follow-up queries must be skipped")


def test_empty_finished_cohort_skips_all_follow_up_queries(monkeypatch):
    monkeypatch.setattr(
        "app.reporting.recent_finished_units.read_finished_unit_cohort",
        lambda cursor, query, window: FinishedUnitCohort((), False),
    )
    result = read_recent_finished_units(
        NoQueryCursor(),
        RecentFinishedUnitsQuery(),
        object(),
        validated_failure_limits=_validated_failure_limits,
        normalized_sql_limit=_normalized_sql_limit,
    )
    assert result == RecentFinishedUnitsMetrics((), False, False)


class FakeRepository:
    def __init__(self, result=None, error=None):
        self.result, self.error, self.calls = result, error, []

    def get_recent_finished_units(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error:
            raise self.error
        return self.result


def connected_metrics():
    return RecentFinishedUnitsMetrics(
        (
            RecentFinishedUnit(
                1,
                "DEMO-UNIT-001",
                "OSX-150",
                "SM",
                48,
                2,
                BASE,
                "passed_no_replacement",
                0,
                0,
                False,
                600_000,
                Decimal("2.4000"),
                1550,
                False,
            ),
        ),
        False,
        False,
    )


def test_not_connected_connected_rejected_params_and_sanitized_503(client, application):
    assert client.get("/api/v1/reporting/recent-finished-units").json() == {
        "data_source": "not_connected"
    }
    fake = FakeRepository(connected_metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: BASE
    with TestClient(application) as connected:
        response = connected.get(
            "/api/v1/reporting/recent-finished-units", params={"period": "today"}
        )
    assert response.status_code == 200
    assert response.json()["units"][0]["worst_il_db"] == "2.4000"
    assert fake.calls[0][0].period == "today"
    for params in (
        {"period": "all_time"},
        {"unexpected": "DEMO"},
        [("purpose", "production"), ("purpose", "production")],
    ):
        with TestClient(application) as connected:
            assert (
                connected.get("/api/v1/reporting/recent-finished-units", params=params).status_code
                == 422
            )
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        FakeRepository(error=ReportingError("query_timeout")), "verified"
    )
    with TestClient(application) as failed:
        response = failed.get("/api/v1/reporting/recent-finished-units")
    assert response.status_code == 503 and response.json() == {"code": "query_timeout"}
