"""Offline weekly D17 outcome tests. No test opens a database connection."""

import re
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import compute_weekly_outcome_boundaries
from app.reporting.models import UnitOutcomesWeeklyQuery
from app.reporting.unit_outcomes_weekly import (
    EXCLUDED_KEYS,
    UnitOutcomesWeeklyMetrics,
    build_replacement_count_query,
    read_unit_outcomes_weekly,
    summarize_unit_outcomes_weekly,
)
from app.reporting.unit_test_time import FinishedUnitCohort, FinishedUnitRecord
from app.schemas import UnitOutcomesWeeklyConnectedResponse

EXTRACTED_AT = datetime(2026, 11, 17, 20, 30, 45, 123456, tzinfo=UTC)
BOUNDARIES = compute_weekly_outcome_boundaries(EXTRACTED_AT)


def record(
    unit_id: int,
    *,
    outcome="passed",
    finished_at=None,
    reason=None,
    outside=False,
    missing_duration=False,
):
    return FinishedUnitRecord(
        unit_id=unit_id,
        main_board_serial=f"DEMO-UNIT-{unit_id:03d}",
        outcome=outcome,
        exclusion_reason=reason,
        finished_at_utc=finished_at or BOUNDARIES.weeks[-1].start_utc + timedelta(hours=1),
        outside_period=outside,
        missing_duration=missing_duration,
        total_ms=0 if missing_duration else 600_000,
        run_count=1,
        active_run_count=0 if missing_duration else 1,
        fallback_run_count=0,
    )


def test_week_boundaries_are_monday_started_dst_correct_and_millisecond_bounded():
    boundaries = compute_weekly_outcome_boundaries(
        datetime(2026, 11, 2, 8, 0, 0, 999999, tzinfo=UTC)
    )
    assert len(boundaries.weeks) == 8
    assert boundaries.extracted_at_utc.microsecond == 999000
    assert boundaries.weeks[-1].local_date.isoformat() == "2026-11-02"
    assert boundaries.weeks[-1].start_utc == datetime(2026, 11, 2, 8, tzinfo=UTC)
    assert boundaries.weeks[-2].start_utc == datetime(2026, 10, 26, 7, tzinfo=UTC)
    assert [week.partial for week in boundaries.weeks] == [False] * 7 + [True]
    assert all(
        left.end_utc == right.start_utc
        for left, right in zip(boundaries.weeks, boundaries.weeks[1:], strict=False)
    )


def test_monday_midnight_has_zero_length_partial_current_week():
    boundaries = compute_weekly_outcome_boundaries(datetime(2026, 11, 9, 8, tzinfo=UTC))
    assert boundaries.weeks[-1].start_utc == boundaries.weeks[-1].end_utc
    assert boundaries.weeks[-1].partial is True


@pytest.mark.parametrize("week_index", range(8))
def test_finish_date_is_bucketed_into_each_week(week_index):
    finished_at = BOUNDARIES.weeks[week_index].start_utc + timedelta(minutes=1)
    result = summarize_unit_outcomes_weekly(
        (record(1, finished_at=finished_at),), BOUNDARIES, (), incomplete=False
    )
    assert result.units[0].week_start_date == BOUNDARIES.weeks[week_index].local_date
    assert result.weeks[week_index].passed_no_replacement == 1
    assert sum(week.passed_no_replacement for week in result.weeks) == 1


def test_replacement_query_is_bound_read_only_and_joins_historical_assignments():
    sql, params = build_replacement_count_query((7, 9))
    assert params == (7, 9)
    assert sql.count("?") == 2
    assert "TOP (501)" in sql
    assert "JOIN dbo.UNIT_SWITCH_ASSIGNMENTS" in sql
    assert "a.unit_id IN (?, ?)" in sql
    assert "GROUP BY a.unit_id" in sql
    assert "SELECT *" not in sql.upper() and " INTO " not in sql.upper()
    assert not re.search(
        r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE)\b",
        re.sub(r"'(?:''|[^'])*'", "''", sql),
        re.I,
    )


def test_week_buckets_replacement_split_missing_duration_and_exclusions():
    oldest = BOUNDARIES.weeks[0].start_utc + timedelta(hours=1)
    records = (
        record(1, finished_at=oldest),
        record(2, finished_at=oldest + timedelta(hours=1), missing_duration=True),
        record(3, outcome="unrecoverable", finished_at=BOUNDARIES.weeks[3].start_utc),
        record(4, reason="run_in_progress"),
        record(5, outside=True),
    )
    result = summarize_unit_outcomes_weekly(records, BOUNDARIES, ((2, 1),), incomplete=True)
    assert [(unit.unit_id, unit.replaced) for unit in result.units] == [
        (3, False),
        (2, True),
        (1, False),
    ]
    assert result.weeks[0].passed_no_replacement == 1
    assert result.weeks[0].passed_after_replacement == 1
    assert result.weeks[3].unrecoverable == 1
    assert result.excluded == dict.fromkeys(EXCLUDED_KEYS, 0) | {
        "run_in_progress": 1,
        "outside_period": 1,
    }
    assert result.incomplete is True


def test_unrecoverable_is_never_replacement_split():
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_unit_outcomes_weekly(
            (record(1, outcome="unrecoverable"),), BOUNDARIES, ((1, 2),), incomplete=False
        )


@pytest.mark.parametrize("rows", [[(1,)], [(1, 0)], [(99, 1)], [(1, 1), (1, 2)]])
def test_bad_replacement_rows_fail_closed(rows):
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_unit_outcomes_weekly((record(1),), BOUNDARIES, rows, incomplete=False)


def test_replacement_overflow_fails_closed():
    records = tuple(record(index) for index in range(1, 502))
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_unit_outcomes_weekly(
            records,
            BOUNDARIES,
            tuple((index, 1) for index in range(1, 502)),
            incomplete=True,
        )


class NoQueryCursor:
    def execute(self, *_args):
        raise AssertionError("replacement query must be skipped")


def test_empty_finished_window_skips_replacement_query(monkeypatch):
    monkeypatch.setattr(
        "app.reporting.unit_outcomes_weekly.read_finished_unit_cohort",
        lambda cursor, query, window: FinishedUnitCohort((), False),
    )
    result = read_unit_outcomes_weekly(NoQueryCursor(), UnitOutcomesWeeklyQuery(), BOUNDARIES)
    assert result.units == ()
    assert all(
        week.passed_no_replacement + week.passed_after_replacement + week.unrecoverable == 0
        for week in result.weeks
    )


class FakeRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_unit_outcomes_weekly(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error:
            raise self.error
        return self.result


def connected_metrics():
    summary = summarize_unit_outcomes_weekly((record(1),), BOUNDARIES, (), incomplete=False)
    return UnitOutcomesWeeklyMetrics(**summary.__dict__)


def test_not_connected_connected_and_sanitized_503(client, application):
    response = client.get("/api/v1/reporting/unit-outcomes-weekly")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}

    fake = FakeRepository(connected_metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as connected_client:
        response = connected_client.get(
            "/api/v1/reporting/unit-outcomes-weekly",
            params=[("purpose", "production")],
        )
    assert response.status_code == 200
    parsed = UnitOutcomesWeeklyConnectedResponse.model_validate(response.json())
    assert parsed.filters.purpose == ["production"]
    assert parsed.units[0].main_board_serial == "DEMO-UNIT-001"
    assert fake.calls[0][0].purposes == ("production",)

    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        FakeRepository(error=ReportingError("query_timeout")), "verified"
    )
    with TestClient(application) as failure_client:
        response = failure_client.get("/api/v1/reporting/unit-outcomes-weekly")
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}


@pytest.mark.parametrize(
    "params",
    [
        {"period": "last_30_days"},
        [("purpose", "production"), ("purpose", "production")],
        {"purpose": "unknown"},
        {"unexpected": "DEMO"},
    ],
)
def test_query_validation_is_sanitized(client, params):
    response = client.get("/api/v1/reporting/unit-outcomes-weekly", params=params)
    assert response.status_code == 422
    assert "DEMO" not in response.text
