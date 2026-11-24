"""Offline live-failure-KPI tests. No test opens a database connection."""

import hashlib
import re
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import compute_channel_activity_boundaries
from app.reporting.failure_kpis import (
    FAILURE_KPI_RETEST_SQL,
    FAILURE_KPI_RUN_CAP,
    build_failure_kpi_retest_query,
    read_failure_kpis,
    summarize_failure_kpis,
)
from app.reporting.models import (
    FailureKpiRetestCounts,
    FailureKpisMetrics,
    FailureKpisQuery,
    FailureKpiUnitCounts,
)
from app.reporting.recent_finished_units import (
    build_first_observation_failure_query,
    build_replacement_query,
)
from app.reporting.repository import (
    STATION_SUMMARY_SQL,
    _normalized_sql_limit,
    _validated_failure_limits,
    summarize_station_summary,
)
from app.reporting.unit_test_time import (
    UNIT_TEST_TIME_COHORT_SQL,
    FinishedUnitCohort,
    FinishedUnitRecord,
)
from app.schemas import FailureKpisConnectedResponse, FailureKpiUnitsResponse

EXTRACTED_AT = datetime(2026, 11, 24, 17, tzinfo=UTC)


def record(unit_id, *, outcome="passed", exclusion=None, outside=False, missing=False):
    return FinishedUnitRecord(
        unit_id=unit_id,
        main_board_serial=f"DEMO-UNIT-{unit_id:03d}",
        outcome=outcome,
        exclusion_reason=exclusion,
        finished_at_utc=None
        if exclusion == "run_in_progress"
        else EXTRACTED_AT - timedelta(hours=1),
        outside_period=outside,
        missing_duration=missing,
        total_ms=0 if missing else 60_000,
        run_count=1,
        active_run_count=0 if missing else 1,
        fallback_run_count=0,
    )


def test_sql_is_bound_read_only_and_preserves_shared_statement_hashes():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    query = FailureKpisQuery(purposes=("production", "engineering"))
    sql, params = build_failure_kpi_retest_query(query, boundaries.periods["last_30_days"])
    window = boundaries.periods["last_30_days"]
    start = window.start_utc.replace(tzinfo=None)
    end = window.end_utc.replace(tzinfo=None)
    assert sql == FAILURE_KPI_RETEST_SQL
    assert params == (
        start,
        end,
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
        None,
        None,
        None,
        None,
    )
    assert sql.count("?") == len(params) == 16
    assert "PARTITION BY m.run_id, m.logical_channel" in sql
    assert "observation_rank > 1" in sql
    assert f"SELECT TOP ({FAILURE_KPI_RUN_CAP}) run_id" in sql
    assert f"SELECT TOP ({FAILURE_KPI_RUN_CAP + 1}) r.run_id" in sql
    assert "o.written_at_utc >= w.start_utc AND o.written_at_utc < w.end_utc" in sql
    assert "SELECT *" not in sql.upper()
    assert not re.search(
        r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE|INTO)\b",
        re.sub(r"'(?:''|[^'])*'", "''", sql),
        re.I,
    )
    assert hashlib.sha256(STATION_SUMMARY_SQL.encode()).hexdigest() == (
        "f02c88a029f97fb1c9a8165f616efb6f84c98c9816228d32cd72505dbe0da8ce"
    )
    assert hashlib.sha256(UNIT_TEST_TIME_COHORT_SQL.encode()).hexdigest() == (
        "7b2858dc9b3eed765201dcbed242d45faf8fb1889b19dd7728f79403162c0f7c"
    )
    replacement_sql, replacement_params = build_replacement_query((10, 11))
    assert replacement_params == (10, 11)
    assert "COUNT_BIG(DISTINCT replacement.logical_channel)" in replacement_sql
    assert "JOIN dbo.UNIT_SWITCH_ASSIGNMENTS" in replacement_sql
    assert hashlib.sha256(replacement_sql.encode()).hexdigest() == (
        "25061e9ba764d6e1cd35d29a38f552d5cc27f1a5c3a5c42d3153021a2dd9d948"
    )
    failure_sql, failure_params = build_first_observation_failure_query(
        (10, 11), ("production", "engineering")
    )
    assert failure_params == (10, 11, "production", "engineering", "production", "production")
    assert hashlib.sha256(failure_sql.encode()).hexdigest() == (
        "bbe08f6996a77735951a6d7abe577a1b33e95623ceaf21c1f93f6f8225239cd1"
    )


def test_outcomes_include_missing_duration_exclude_open_and_count_all_over_100():
    records = [record(index, missing=index == 1) for index in range(1, 103)]
    records += [record(200, outcome="unrecoverable"), record(201, outcome="unrecoverable")]
    records += [record(300, exclusion="run_in_progress"), record(301, outside=True)]
    failures = {item.unit_id: 0 for item in records if item.unit_id not in {300, 301}}
    failures[1] = None  # A replacement means unknown criteria does not enter either proxy count.
    failures[3] = 1  # A later passing retest does not erase a failed first reading.
    failures[4] = None
    result = summarize_failure_kpis(
        records,
        ((1, 3), (2, 2), (200, 1)),
        failures,
        (7, 560, 41),
        incomplete=False,
    )
    assert result.units.model_dump() == {
        "finished": 104,
        "passed_no_replacement": 100,
        "passed_after_replacement": 2,
        "unrecoverable": 2,
        "replacement_units": 3,
        "replaced_channels": 6,
        "first_pass": 99,
        "first_pass_unknown": 1,
    }
    assert result.retest.model_dump() == {
        "active_run_channels": 560,
        "retested_run_channels": 41,
    }
    assert result.incomplete is False


@pytest.mark.parametrize(
    ("outcome", "replacement_rows", "failed", "expected"),
    (
        ("passed", (), 0, (1, 0)),
        ("passed", (), 1, (0, 0)),
        ("passed", ((1, 1),), 0, (0, 0)),
        ("passed", (), None, (0, 1)),
        ("passed", ((1, 1),), None, (0, 0)),
        ("unrecoverable", (), 0, (1, 0)),
    ),
)
def test_first_pass_proxy_classification(outcome, replacement_rows, failed, expected):
    result = summarize_failure_kpis(
        (record(1, outcome=outcome),),
        replacement_rows,
        {1: failed},
        (0, 0, 0),
        incomplete=False,
    )
    assert (result.units.first_pass, result.units.first_pass_unknown) == expected


def test_empty_overflow_and_invalid_invariants_fail_closed():
    empty = summarize_failure_kpis((), (), {}, (0, 0, 0), incomplete=False)
    assert empty.units.finished == 0 and empty.retest.active_run_channels == 0
    overflow = summarize_failure_kpis((), (), {}, (FAILURE_KPI_RUN_CAP + 1, 0, 0), incomplete=True)
    assert overflow.incomplete is True
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_failure_kpis((), (), {}, (0, 1, 2), incomplete=False)
    base = {
        "finished": 2,
        "passed_no_replacement": 1,
        "passed_after_replacement": 1,
        "unrecoverable": 0,
        "replacement_units": 1,
        "replaced_channels": 1,
        "first_pass": 1,
        "first_pass_unknown": 0,
    }
    for invalid in (
        base | {"first_pass_unknown": 1},
        base
        | {
            "passed_no_replacement": 0,
            "unrecoverable": 1,
            "first_pass": 2,
        },
    ):
        for model in (FailureKpiUnitCounts, FailureKpiUnitsResponse):
            with pytest.raises(ValidationError):
                model(**invalid)


class Result:
    def __init__(self, rows=None, row=None):
        self.rows = rows
        self.row = row

    def fetchmany(self, _size):
        return self.rows

    def fetchone(self):
        return self.row


class Cursor:
    def __init__(self, replacement_rows, retest_row):
        self.results = [Result(replacement_rows), Result(row=retest_row)]
        self.executed = []

    def execute(self, sql, params=()):
        self.executed.append((sql, params))
        return self.results.pop(0)


@pytest.mark.parametrize("cohort_incomplete,follow_up_overflow", [(True, False), (False, True)])
def test_cohort_or_follow_up_overflow_sets_incomplete(
    monkeypatch, cohort_incomplete, follow_up_overflow
):
    records = (record(1), record(2)) if follow_up_overflow else (record(1),)
    cohort = FinishedUnitCohort(records, cohort_incomplete)
    monkeypatch.setattr(
        "app.reporting.failure_kpis.read_finished_unit_cohort",
        lambda cursor, query, window: cohort,
    )
    if follow_up_overflow:
        monkeypatch.setattr("app.reporting.failure_kpis.UNIT_STATUS_COHORT_CAP", 1)
    monkeypatch.setattr(
        "app.reporting.failure_kpis.read_first_observation_failure_counts",
        lambda *args, **kwargs: ({item.unit_id: 0 for item in records}, follow_up_overflow),
    )
    rows = [(1, 1), (2, 1)] if follow_up_overflow else []
    cursor = Cursor(rows, (0, 0, 0))
    window = compute_channel_activity_boundaries(EXTRACTED_AT).periods["last_30_days"]
    result = read_failure_kpis(
        cursor,
        FailureKpisQuery(),
        window,
        validated_failure_limits=_validated_failure_limits,
        normalized_sql_limit=_normalized_sql_limit,
    )
    assert result.incomplete is True


def test_read_counts_every_eligible_unit_before_recent_display_cap(monkeypatch):
    records = tuple(record(index) for index in range(1, 102))
    monkeypatch.setattr(
        "app.reporting.failure_kpis.read_finished_unit_cohort",
        lambda cursor, query, window: FinishedUnitCohort(records, False),
    )
    captured = []

    def failures(_cursor, unit_ids, purposes, **_kwargs):
        captured.append((unit_ids, purposes))
        return {unit_id: 0 for unit_id in unit_ids}, False

    monkeypatch.setattr(
        "app.reporting.failure_kpis.read_first_observation_failure_counts", failures
    )
    cursor = Cursor([], (0, 0, 0))
    window = compute_channel_activity_boundaries(EXTRACTED_AT).periods["last_30_days"]
    result = read_failure_kpis(
        cursor,
        FailureKpisQuery(),
        window,
        validated_failure_limits=_validated_failure_limits,
        normalized_sql_limit=_normalized_sql_limit,
    )
    assert len(captured[0][0]) == 101
    assert captured[0][1] == ("production",)
    assert result.units.first_pass == 101


def test_retest_window_semantics_and_station_total_equality():
    start = EXTRACTED_AT - timedelta(days=1)
    attempts = [
        (1, 1, start - timedelta(seconds=1)),
        (1, 1, start + timedelta(seconds=1)),  # predecessor outside P makes this a retest
        (2, 1, start + timedelta(seconds=2)),  # same channel, another run: not a retest
    ]
    ranks = {}
    active = set()
    retested = set()
    for run, channel, written in sorted(attempts, key=lambda item: item[2]):
        key = (run, channel)
        ranks[key] = ranks.get(key, 0) + 1
        if start <= written < EXTRACTED_AT:
            active.add(key)
            if ranks[key] > 1:
                retested.add(key)
    assert active == {(1, 1), (2, 1)} and retested == {(1, 1)}

    snapshot = (
        '{"model":"DEMO","wavelength_mode":"SM","profile_name":"DEMO",'
        '"revision":"1","too_good_below_db":0,"warning_enabled":false,'
        '"warning_above_db":null,"fail_above_db":2.5}'
    )
    station = summarize_station_summary(
        [(1, 1, 10, 2, 2.5, 2, 0, 2, 1, 1000)], [(1, "SM", snapshot)]
    )
    kpis = summarize_failure_kpis(
        (),
        (),
        {},
        (1, station.totals.active_run_channels, station.totals.retested_run_channels),
        incomplete=station.incomplete,
    )
    assert kpis.retest.active_run_channels == station.totals.active_run_channels
    assert kpis.retest.retested_run_channels == station.totals.retested_run_channels


class FakeRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_failure_kpis(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error:
            raise self.error
        return self.result


def connected_metrics():
    return FailureKpisMetrics(
        units=FailureKpiUnitCounts(
            finished=6,
            passed_no_replacement=5,
            passed_after_replacement=1,
            unrecoverable=0,
            replacement_units=1,
            replaced_channels=3,
            first_pass=4,
            first_pass_unknown=0,
        ),
        retest=FailureKpiRetestCounts(active_run_channels=560, retested_run_channels=41),
        incomplete=False,
    )


def test_not_connected_connected_validation_and_sanitized_503(client, application):
    assert client.get("/api/v1/reporting/failure-kpis").json() == {"data_source": "not_connected"}
    fake = FakeRepository(connected_metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "encrypted_unverified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as connected:
        response = connected.get(
            "/api/v1/reporting/failure-kpis",
            params=[("period", "today"), ("purpose", "production")],
        )
        for params in (
            {"unexpected": "DEMO"},
            {"period": "all_time"},
            [("purpose", "production"), ("purpose", "production")],
        ):
            assert connected.get("/api/v1/reporting/failure-kpis", params=params).status_code == 422
    assert response.status_code == 200
    body = FailureKpisConnectedResponse.model_validate(response.json())
    assert body.period.key == "today" and body.filters.purpose == ["production"]
    assert body.units.replaced_channels == 3 and body.retest.retested_run_channels == 41
    assert fake.calls[0][0] == FailureKpisQuery(period="today")

    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        FakeRepository(error=ReportingError("query_timeout")), "verified"
    )
    with TestClient(application) as failed:
        response = failed.get("/api/v1/reporting/failure-kpis")
    assert response.status_code == 503 and response.json() == {"code": "query_timeout"}
