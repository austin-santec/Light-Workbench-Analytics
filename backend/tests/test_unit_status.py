"""Offline current-unit-status tests. No test opens a database connection."""

import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import compute_channel_activity_boundaries
from app.reporting.models import UnitStatusQuery
from app.reporting.unit_status import (
    COHORT_SQL,
    UNIT_STATUS_COHORT_CAP,
    CohortAssignment,
    LatestAnalysis,
    ProjectionMeasurement,
    ProjectionReplacement,
    ProjectionRun,
    UnitStatusMetrics,
    _cohort_params,
    _compatible_run,
    build_unit_status_queries,
    project_unit_status,
    read_unit_status,
)
from app.schemas import UnitStatusConnectedResponse

EXTRACTED_AT = datetime(2026, 11, 13, 20, tzinfo=UTC)
BASE_TIME = datetime(2026, 11, 10, 12, tzinfo=UTC)


def limits(**changes):
    values = {
        "model": "OSX-150",
        "wavelength_mode": "SM",
        "too_good_below_db": Decimal("0.5000"),
        "warning_enabled": True,
        "warning_above_db": Decimal("2.2500"),
        "fail_above_db": Decimal("2.5000"),
        "minimum_replacement_improvement_db": Decimal("0.2000"),
    }
    return values | changes


def assignment():
    return CohortAssignment(10, 20, "DEMO-UNIT-020", "DEMO-SWITCH-010", "OSX-150")


def run(
    run_id=1,
    *,
    minute=0,
    assignment_id=10,
    mode="SM",
    channels=2,
    status="included",
    superseded=None,
    run_limits=None,
):
    return ProjectionRun(
        run_id,
        assignment_id,
        BASE_TIME + timedelta(minutes=minute),
        mode,
        channels,
        status,
        superseded,
        limits() if run_limits is None else run_limits,
    )


def measurement(
    measurement_id,
    run_id,
    channel,
    loss,
    *,
    port=None,
    minute=1,
    attempt=1,
    pair=(1310, 1550),
):
    return ProjectionMeasurement(
        measurement_id,
        10,
        run_id,
        channel,
        channel if port is None else port,
        attempt,
        pair[0],
        Decimal(str(loss)),
        pair[1],
        Decimal("1.0000"),
        BASE_TIME + timedelta(minutes=minute),
    )


def project(*, rows=None, runs=None, mapping=None, replacements=(), analysis=None):
    return project_unit_status(
        assignment(),
        runs or (run(),),
        rows
        or (
            measurement(1, 1, 1, "1.0000"),
            measurement(2, 1, 2, "1.0000"),
        ),
        mapping or {1: 1, 2: 2},
        replacements,
        analysis,
    )


def test_each_status_and_strict_exact_limit():
    assert project().status == "passing"
    exact = project(
        rows=(
            measurement(1, 1, 1, "2.5000"),
            measurement(2, 1, 2, "1.0000"),
        )
    )
    assert exact.status == "passing"

    failing = (
        measurement(1, 1, 1, "2.5001"),
        measurement(2, 1, 2, "1.0000"),
    )
    assert project(rows=failing).status == "failing_needs_analysis"
    stale = LatestAnalysis(1, "fail_no_viable_recovery", BASE_TIME, 0)
    assert project(rows=failing, analysis=stale).status == "failing_needs_analysis"
    current = LatestAnalysis(2, "fail_no_viable_recovery", BASE_TIME + timedelta(minutes=5), 0)
    assert project(rows=failing, analysis=current).status == "failing_no_measured_recovery"
    available = LatestAnalysis(3, "recommendations_available", BASE_TIME + timedelta(minutes=5), 1)
    result = project(rows=failing, analysis=available)
    assert result.status == "failing_recovery_available"
    assert result.failing_channels[0].logical_channel == 1
    assert result.failing_channels[0].effective_port == 1
    # A used recommendation is linkage, not an available recovery.
    used = LatestAnalysis(4, "recommendations_available", BASE_TIME + timedelta(minutes=5), 0)
    assert project(rows=failing, analysis=used).status == "failing_no_measured_recovery"


def test_review_missing_channel_newest_measurement_and_tie_breaks():
    mismatch = project(
        rows=(
            measurement(1, 1, 1, "1.0000", pair=(850, 1300)),
            measurement(2, 1, 2, "1.0000"),
        )
    )
    assert mismatch.status == "review_required"
    assert "incompatible wavelengths" in mismatch.review_reasons[0]
    assert project(rows=(measurement(1, 1, 1, "1.0000"),)).status == "not_evaluated"

    newest = project(
        rows=(
            measurement(1, 1, 1, "1.0000", minute=1, attempt=1),
            measurement(2, 1, 1, "2.6000", minute=1, attempt=2),
            measurement(3, 1, 1, "1.0000", minute=1, attempt=2),
            measurement(4, 1, 2, "1.0000", minute=1),
        )
    )
    assert newest.status == "passing"
    failing_tie = project(
        rows=(
            measurement(2, 1, 1, "1.0000", minute=1, attempt=2),
            measurement(3, 1, 1, "2.6000", minute=1, attempt=2),
            measurement(4, 1, 2, "1.0000", minute=1),
        )
    )
    assert failing_tie.status == "failing_needs_analysis"


def test_replacement_port_retest_recovers_and_mismatch_requires_review():
    replacement = ProjectionReplacement(1, 10, 2, 3, BASE_TIME + timedelta(minutes=2), 1)
    recovered = project(
        rows=(
            measurement(1, 1, 1, "1.0000", minute=1),
            measurement(2, 1, 2, "2.6000", minute=1),
            measurement(3, 1, 2, "1.0000", port=3, minute=3),
        ),
        mapping={1: 1, 2: 3},
        replacements=(replacement,),
    )
    assert recovered.status == "passing"

    wrong_port = project(
        rows=(
            measurement(1, 1, 1, "1.0000"),
            measurement(2, 1, 2, "1.0000", port=2, minute=3),
        ),
        mapping={1: 1, 2: 3},
        replacements=(replacement,),
    )
    assert wrong_port.status == "review_required"
    assert "expected 3" in wrong_port.review_reasons[0]


def test_analysis_freshness_includes_newest_assignment_replacement():
    failing = (
        measurement(1, 1, 1, "2.6000", minute=5),
        measurement(2, 1, 2, "1.0000", minute=5),
    )
    analysis = LatestAnalysis(1, "fail_no_viable_recovery", BASE_TIME + timedelta(minutes=6))
    newer_replacement = ProjectionReplacement(1, 10, 9, 51, BASE_TIME + timedelta(minutes=7), None)
    assert (
        project(rows=failing, analysis=analysis, replacements=(newer_replacement,)).status
        == "failing_needs_analysis"
    )


def test_compatibility_exclusions_cover_source_rules():
    context = run(10, minute=10)
    cases = (
        (run(11, minute=1, assignment_id=99), "different assignment"),
        (run(12, minute=11), "later than context run"),
        (run(13, minute=1, status="excluded"), "voided"),
        (run(14, minute=1, status="superseded"), "superseded"),
        (run(15, minute=1, superseded=10), "superseded"),
        (run(16, minute=1, mode="MM"), "different wavelength mode"),
        (run(17, minute=1, channels=3), "different front-panel channel count"),
        (
            run(18, minute=1, run_limits=limits(fail_above_db=Decimal("2.6000"))),
            "incompatible criteria",
        ),
        (
            run(19, minute=1, run_limits=limits(model="OSX-100")),
            "incompatible criteria",
        ),
    )
    assert [(_compatible_run(context, candidate)) for candidate, _ in cases] == [
        reason for _, reason in cases
    ]


def test_incompatible_runs_cannot_override_context_projection():
    context = run(10, minute=10)
    incompatible = (
        run(1, minute=1, mode="MM"),
        run(2, minute=2, channels=3),
        run(3, minute=3, run_limits=limits(fail_above_db=Decimal("2.6000"))),
        run(4, minute=4, status="excluded"),
        run(5, minute=5, status="superseded"),
    )
    rows = [
        measurement(100, 10, 1, "2.6000", minute=11),
        measurement(101, 10, 2, "1.0000", minute=11),
    ]
    for index, item in enumerate(incompatible, start=1):
        rows.append(measurement(index, item.run_id, 1, "1.0000", minute=index))
    result = project(runs=(*incompatible, context), rows=tuple(rows))
    assert result.status == "failing_needs_analysis"


def test_period_and_purpose_are_bound_and_defaulted():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    query = UnitStatusQuery()
    assert query.period == "last_30_days"
    params = _cohort_params(query, boundaries.periods[query.period])
    assert params[:2] == (
        datetime(2026, 10, 14, 7, tzinfo=UTC),
        datetime(2026, 11, 13, 8, tzinfo=UTC),
    )
    assert params[2:] == ("production",) * 4
    mixed = UnitStatusQuery(purposes=("production", "engineering"))
    assert _cohort_params(mixed, boundaries.periods["today"])[2:] == (
        "production",
        "engineering",
        "production",
        "production",
    )


def test_generated_queries_are_bounded_parameterized_and_read_only():
    queries = build_unit_status_queries((10, 11), (100, 101))
    assert COHORT_SQL.count("?") == 6
    for sql, params in queries:
        assert params in {(10, 11), (100, 101)}
        assert sql.count("?") == len(params) == 2
        assert "SELECT *" not in sql.upper() and " INTO " not in sql.upper()
        unquoted = re.sub(r"'(?:''|[^'])*'", "''", sql)
        assert not re.search(
            r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE)\b",
            unquoted,
            re.I,
        )


class Result:
    def __init__(self, rows):
        self.rows = list(rows)

    def fetchmany(self, size):
        return self.rows[:size]


class CapCursor:
    def execute(self, sql, params=()):
        if sql == COHORT_SQL:
            row = (1, 1, "DEMO-UNIT", "DEMO-SWITCH", "OSX-150", BASE_TIME)
            return Result(
                [
                    (index, index, f"DEMO-UNIT-{index}", f"DEMO-SWITCH-{index}", row[4], row[5])
                    for index in range(1, UNIT_STATUS_COHORT_CAP + 2)
                ]
            )
        return Result([])


def test_cohort_cap_marks_response_incomplete():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    result = read_unit_status(CapCursor(), UnitStatusQuery(), boundaries.periods["last_30_days"])
    assert result.incomplete is True
    assert result.counts["cohort_units"] == UNIT_STATUS_COHORT_CAP
    assert result.counts["review_required"] == UNIT_STATUS_COHORT_CAP


class FakeRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_unit_status(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error:
            raise self.error
        return self.result


def connected_metrics():
    item = project(
        rows=(
            measurement(1, 1, 1, "2.6000"),
            measurement(2, 1, 2, "1.0000"),
        ),
        analysis=LatestAnalysis(1, "fail_no_viable_recovery", BASE_TIME + timedelta(minutes=5)),
    )
    return UnitStatusMetrics(
        counts={
            "cohort_units": 1,
            "review_required": 0,
            "not_evaluated": 0,
            "passing": 0,
            "failing_recovery_available": 0,
            "failing_needs_analysis": 0,
            "failing_no_measured_recovery": 1,
        },
        units=(item,),
        incomplete=False,
    )


def test_disabled_connected_and_sanitized_503_contracts(client, application):
    response = client.get("/api/v1/reporting/unit-status")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}

    fake = FakeRepository(connected_metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as connected_client:
        response = connected_client.get(
            "/api/v1/reporting/unit-status",
            params=[("period", "today"), ("purpose", "production")],
        )
    assert response.status_code == 200
    result = UnitStatusConnectedResponse.model_validate(response.json())
    assert result.period.key == "today"
    assert result.filters.purpose == ["production"]
    assert result.counts.failing_no_measured_recovery == 1
    assert result.units[0].main_board_serial == "DEMO-UNIT-020"

    failure = FakeRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        failure, "encrypted_unverified"
    )
    with TestClient(application) as failure_client:
        response = failure_client.get("/api/v1/reporting/unit-status")
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}


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
    response = client.get("/api/v1/reporting/unit-status", params=params)
    assert response.status_code == 422
    assert "DEMO" not in response.text
