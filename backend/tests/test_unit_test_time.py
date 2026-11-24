"""Offline D17 unit-test-time tests. No test opens a database connection."""

import hashlib
import re
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import ActivityWindow, compute_channel_activity_boundaries
from app.reporting.models import FinishedUnitCounts, UnitTestTimeQuery
from app.reporting.unit_status import AnalysisSummary, CohortAssignment, UnitStatusProjection
from app.reporting.unit_test_time import (
    EXCLUDED_KEYS,
    UNIT_TEST_TIME_COHORT_SQL,
    UnitTestTimeItem,
    UnitTestTimeMetrics,
    _cohort_params,
    build_unit_timing_query,
    finished_outcome,
    read_unit_test_time,
    summarize_unit_test_time,
)
from app.schemas import UnitTestTimeConnectedResponse

EXTRACTED_AT = datetime(2026, 11, 13, 20, tzinfo=UTC)
START = datetime(2026, 10, 14, 7, tzinfo=UTC)
END = datetime(2026, 11, 13, 8, tzinfo=UTC)
BASE = datetime(2026, 11, 10, 12, tzinfo=UTC)
WINDOW = ActivityWindow(START, END, True)


def cohort(unit_id: int, assignment_id: int | None = None) -> CohortAssignment:
    assignment_id = assignment_id or unit_id * 10
    return CohortAssignment(
        assignment_id,
        unit_id,
        f"DEMO-UNIT-{unit_id:03d}",
        f"DEMO-SWITCH-{unit_id:03d}",
        "OSX-150",
    )


def projection(
    unit_id: int,
    status="passing",
    *,
    result_status: str | None = None,
    analyzed_at: datetime | None = None,
) -> UnitStatusProjection:
    latest = None
    if result_status is not None:
        latest = AnalysisSummary(1000 + unit_id, result_status, analyzed_at or BASE, True, 0)
    return UnitStatusProjection(
        unit_id,
        f"DEMO-UNIT-{unit_id:03d}",
        unit_id * 10,
        f"DEMO-SWITCH-{unit_id:03d}",
        "OSX-150",
        unit_id * 100,
        48,
        status,
        (),
        latest,
        (),
    )


def timing_row(
    run_id: int,
    unit_id: int,
    *,
    assignment_id: int | None = None,
    purpose="production",
    started: datetime | None = None,
    ended: datetime | None | object = ...,
    analysis_status="included",
    superseded=None,
    quality="confirmed",
    active=600_000,
    elapsed=900_000,
):
    started = started or BASE
    ended = started + timedelta(minutes=20) if ended is ... else ended
    if ended is None:
        quality = active = elapsed = None
    return (
        run_id,
        unit_id,
        assignment_id or unit_id * 10,
        purpose,
        started,
        ended,
        analysis_status,
        superseded,
        quality,
        active,
        elapsed,
    )


@pytest.mark.parametrize(
    ("status", "result_status", "expected"),
    [
        ("passing", None, "passed"),
        ("review_required", None, None),
        ("not_evaluated", None, None),
        ("failing_needs_analysis", None, None),
        ("failing_recovery_available", "recommendations_available", None),
        ("failing_no_measured_recovery", "fail_no_viable_recovery", "unrecoverable"),
        (
            "failing_no_measured_recovery",
            "not_applicable_no_extra_ports",
            "unrecoverable",
        ),
        ("failing_no_measured_recovery", "pass_no_viable_optimization", None),
    ],
)
def test_finished_rule(status, result_status, expected):
    assert finished_outcome(projection(1, status, result_status=result_status)) == expected


def test_parameter_binding_and_bounded_read_only_sql():
    params = _cohort_params(UnitTestTimeQuery(purposes=("production", "engineering")), WINDOW)
    assert params == ("production", "engineering", "production", "production", START, END)
    assert UNIT_TEST_TIME_COHORT_SQL.count("?") == len(params)
    assert "TOP (501)" in UNIT_TEST_TIME_COHORT_SQL
    sql, unit_params = build_unit_timing_query((1, 2))
    assert unit_params == (1, 2)
    assert sql.count("?") == 2
    assert "TOP (100001)" in sql
    assert "CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE timing.timing_quality END" in sql
    assert "CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE timing.active_test_ms END" in sql
    assert "CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE timing.elapsed_ms END" in sql
    for statement in (UNIT_TEST_TIME_COHORT_SQL, sql):
        assert "SELECT *" not in statement.upper() and " INTO " not in statement.upper()
        unquoted = re.sub(r"'(?:''|[^'])*'", "''", statement)
        assert not re.search(
            r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE)\b",
            unquoted,
            re.I,
        )
    assert hashlib.sha256(UNIT_TEST_TIME_COHORT_SQL.encode()).hexdigest() == (
        "7b2858dc9b3eed765201dcbed242d45faf8fb1889b19dd7728f79403162c0f7c"
    )
    assert hashlib.sha256(build_unit_timing_query((10, 11))[0].encode()).hexdigest() == (
        "293e477eba39fe7ff11e08e350aeff2a07aa5fc5e0372f67f7f0f29eaf12a8aa"
    )


def test_combined_totals_removed_assignment_and_analysis_finish_date():
    cohorts = (cohort(1), cohort(2))
    later_analysis = BASE + timedelta(hours=3)
    projections = (
        projection(1),
        projection(
            2,
            "failing_no_measured_recovery",
            result_status="fail_no_viable_recovery",
            analyzed_at=later_analysis,
        ),
    )
    rows = [
        timing_row(1, 1, assignment_id=999, active=600_000, elapsed=900_000),
        timing_row(
            2,
            1,
            assignment_id=999,
            started=BASE + timedelta(minutes=30),
            quality="partial",
            active=500_000,
            elapsed=1_200_000,
        ),
        timing_row(3, 1, analysis_status="excluded"),
        timing_row(4, 1, analysis_status="superseded"),
        timing_row(5, 1, superseded=99),
        timing_row(6, 1, purpose="engineering"),
        timing_row(7, 2, started=BASE + timedelta(hours=1), active=300_000),
    ]
    result = summarize_unit_test_time(
        cohorts, projections, rows, UnitTestTimeQuery(), WINDOW, incomplete=False
    )
    assert [item.unit_id for item in result.units] == [2, 1]
    passed = result.units[1]
    assert (passed.total_ms, passed.run_count) == (1_800_000, 2)
    assert (passed.active_run_count, passed.fallback_run_count) == (1, 1)
    assert result.units[0].finished_at_utc == later_analysis
    assert result.units[0].outcome == "unrecoverable"
    assert result.finished == FinishedUnitCounts(passed=1, unrecoverable=1)
    assert result.excluded == dict.fromkeys(EXCLUDED_KEYS, 0)


@pytest.mark.parametrize(
    ("status", "result_status", "reason"),
    [
        ("review_required", None, "review_required"),
        ("not_evaluated", None, "not_evaluated"),
        ("failing_needs_analysis", None, "failing_needs_analysis"),
        (
            "failing_recovery_available",
            "recommendations_available",
            "failing_recovery_available",
        ),
        (
            "failing_no_measured_recovery",
            "pass_no_viable_optimization",
            "other_saved_result",
        ),
    ],
)
def test_each_nonfinished_status_has_one_reason(status, result_status, reason):
    result = summarize_unit_test_time(
        (cohort(1),),
        (projection(1, status, result_status=result_status),),
        (timing_row(1, 1),),
        UnitTestTimeQuery(),
        WINDOW,
        incomplete=False,
    )
    assert result.units == ()
    assert result.excluded[reason] == 1
    assert sum(result.excluded.values()) == 1


def test_open_missing_and_finish_outside_exclude_whole_units():
    cohorts = (cohort(1), cohort(2), cohort(3))
    projections = tuple(projection(unit_id) for unit_id in (1, 2, 3))
    rows = (
        timing_row(1, 1),
        timing_row(2, 1, started=BASE + timedelta(hours=1), ended=None),
        timing_row(3, 2, quality="unavailable", active=None, elapsed=0),
        timing_row(4, 3, started=END + timedelta(hours=1)),
    )
    result = summarize_unit_test_time(
        cohorts, projections, rows, UnitTestTimeQuery(), WINDOW, incomplete=False
    )
    assert result.units == ()
    assert result.excluded["run_in_progress"] == 1
    assert result.excluded["missing_duration"] == 1
    assert result.excluded["outside_period"] == 1
    assert sum(result.excluded.values()) == 3


def test_finished_counts_include_in_period_missing_duration_only():
    cohorts = tuple(cohort(unit_id) for unit_id in range(1, 6))
    projections = (
        projection(1),
        projection(2, "failing_no_measured_recovery", result_status="fail_no_viable_recovery"),
        projection(3),
        projection(4),
        projection(5, "review_required"),
    )
    rows = (
        timing_row(1, 1),
        timing_row(2, 2, quality="unavailable", active=None, elapsed=0),
        timing_row(3, 3, started=END + timedelta(hours=1)),
        timing_row(4, 4, ended=None),
        timing_row(5, 5),
    )
    result = summarize_unit_test_time(
        cohorts, projections, rows, UnitTestTimeQuery(), WINDOW, incomplete=False
    )
    assert result.finished == FinishedUnitCounts(passed=1, unrecoverable=1)
    assert [unit.unit_id for unit in result.units] == [1]
    assert result.excluded["missing_duration"] == 1
    assert result.excluded["outside_period"] == 1
    assert result.excluded["run_in_progress"] == 1
    assert result.excluded["review_required"] == 1


def test_empty_cohort_has_zero_finished_counts():
    result = summarize_unit_test_time((), (), (), UnitTestTimeQuery(), WINDOW, incomplete=False)
    assert result.finished == FinishedUnitCounts(passed=0, unrecoverable=0)
    assert result.units == ()


@pytest.mark.parametrize(
    "row",
    [
        (1, 2, 3),
        timing_row(1, 1, active=-1),
        timing_row(1, 1, quality="mystery"),
        timing_row(1, 1, started=BASE, ended=BASE - timedelta(seconds=1)),
        timing_row(1, 999),
    ],
)
def test_invalid_timing_rows_fail_closed(row):
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_unit_test_time(
            (cohort(1),),
            (projection(1),),
            (row,),
            UnitTestTimeQuery(),
            WINDOW,
            incomplete=False,
        )


class Result:
    def __init__(self, rows):
        self.rows = list(rows)

    def fetchmany(self, size):
        return self.rows[:size]


class CapCursor:
    def __init__(self):
        self.calls = []

    def execute(self, sql, params=()):
        self.calls.append((sql, params))
        if sql == UNIT_TEST_TIME_COHORT_SQL:
            return Result([(10, 1, "DEMO-UNIT-001", "DEMO-SWITCH-001", "OSX-150", BASE)])
        return Result([timing_row(1, 1), timing_row(2, 1), timing_row(3, 1)])


class CohortCapCursor:
    def execute(self, sql, params=()):
        if sql == UNIT_TEST_TIME_COHORT_SQL:
            return Result(
                [
                    (
                        index * 10,
                        index,
                        f"DEMO-UNIT-{index:03d}",
                        f"DEMO-SWITCH-{index:03d}",
                        "OSX-150",
                        BASE,
                    )
                    for index in range(1, 502)
                ]
            )
        return Result([])


def test_cohort_cap_marks_incomplete():
    result = read_unit_test_time(CohortCapCursor(), UnitTestTimeQuery(), WINDOW)
    assert result.incomplete is True
    assert result.units == ()
    assert result.excluded["review_required"] == 500


def test_timing_cap_marks_incomplete(monkeypatch):
    monkeypatch.setattr("app.reporting.unit_test_time.UNIT_STATUS_RUN_CAP", 2)
    monkeypatch.setattr(
        "app.reporting.unit_test_time.read_unit_status_projections",
        lambda cursor, cohorts: ((projection(1),), False),
    )
    result = read_unit_test_time(CapCursor(), UnitTestTimeQuery(), WINDOW)
    assert result.incomplete is True
    assert result.units[0].run_count == 2


class FakeRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_unit_test_time(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error:
            raise self.error
        return self.result


def connected_metrics():
    return UnitTestTimeMetrics(
        units=(UnitTestTimeItem(1, "DEMO-UNIT-001", "passed", BASE, 600_000, 1, 1, 0),),
        finished=FinishedUnitCounts(passed=2, unrecoverable=0),
        excluded=dict.fromkeys(EXCLUDED_KEYS, 0),
        incomplete=False,
    )


def test_not_connected_connected_and_sanitized_503_contracts(client, application):
    response = client.get("/api/v1/reporting/unit-test-time")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}

    fake = FakeRepository(connected_metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as connected_client:
        response = connected_client.get(
            "/api/v1/reporting/unit-test-time",
            params=[("period", "today"), ("purpose", "production")],
        )
    assert response.status_code == 200
    result = UnitTestTimeConnectedResponse.model_validate(response.json())
    assert result.period.key == "today"
    assert result.filters.purpose == ["production"]
    assert result.units[0].main_board_serial == "DEMO-UNIT-001"
    assert result.finished.model_dump() == {"passed": 2, "unrecoverable": 0}
    assert fake.calls[0][0].period == "today"

    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        FakeRepository(error=ReportingError("query_timeout")), "verified"
    )
    with TestClient(application) as failure_client:
        response = failure_client.get("/api/v1/reporting/unit-test-time")
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}


def test_unit_test_time_response_rejects_inconsistent_finished_counts():
    payload = {
        "tls": "verified",
        "extracted_at_utc": EXTRACTED_AT,
        "period": {"key": "today", "start_utc": START, "end_utc": END, "partial": True},
        "filters": {"purpose": ["production"]},
        "units": [
            {
                "unit_id": 1,
                "main_board_serial": "DEMO-UNIT-001",
                "outcome": "passed",
                "finished_at_utc": BASE,
                "total_ms": 600_000,
                "run_count": 1,
                "active_run_count": 1,
                "fallback_run_count": 0,
            }
        ],
        "finished": {"passed": 0, "unrecoverable": 0},
        "excluded": dict.fromkeys(EXCLUDED_KEYS, 0),
        "incomplete": False,
    }
    with pytest.raises(ValueError, match="Finished counts"):
        UnitTestTimeConnectedResponse.model_validate(payload)


@pytest.mark.parametrize(
    "params",
    [
        {"period": "all_time"},
        [("purpose", "production"), ("purpose", "production")],
        {"purpose": "unknown"},
        {"unexpected": "DEMO"},
    ],
)
def test_query_validation_is_sanitized(client, params):
    response = client.get("/api/v1/reporting/unit-test-time", params=params)
    assert response.status_code == 422
    assert "DEMO" not in response.text


def test_default_query_matches_last_30_days_production():
    query = UnitTestTimeQuery()
    assert query.period == "last_30_days"
    assert query.purposes == ("production",)
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    assert boundaries.periods[query.period].start_utc == START
