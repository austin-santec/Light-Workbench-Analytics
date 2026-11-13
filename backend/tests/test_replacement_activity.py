"""Offline replacement-activity tests. No test opens a database connection."""

import re
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import PERIOD_KEYS, compute_channel_activity_boundaries
from app.reporting.models import (
    ReplacementActivityCounts,
    ReplacementActivityMetrics,
    ReplacementActivityQuery,
)
from app.reporting.repository import (
    ATTRIBUTION_KEYS,
    REPLACEMENT_ACTIVITY_DAILY_SQL,
    REPLACEMENT_ACTIVITY_PERIOD_SQL,
    build_replacement_activity_queries,
    summarize_replacement_activity,
)
from app.schemas import ErrorResponse, ReplacementActivityConnectedResponse

EXTRACTED_AT = datetime(2026, 11, 13, 20, tzinfo=UTC)


def rows(windows: int) -> list[tuple]:
    return [
        (ordinal, key, ordinal + bucket + 1, 1, 1, 1, 0)
        for ordinal in range(windows)
        for bucket, key in enumerate(ATTRIBUTION_KEYS)
    ]


def metrics() -> ReplacementActivityMetrics:
    count = ReplacementActivityCounts(
        events=2,
        channels_replaced=1,
        units=1,
        events_per_unit=2,
        from_recommendation=1,
        related_run_not_current=1,
    )
    buckets = {key: count for key in ATTRIBUTION_KEYS}
    return ReplacementActivityMetrics(
        periods={key: buckets for key in PERIOD_KEYS},
        daily=tuple(buckets for _ in range(31)),
    )


class FakeReplacementRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_replacement_activity(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error:
            raise self.error
        return self.result


def test_reuses_shared_pacific_period_boundaries():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    assert boundaries.periods["today"].start_utc == datetime(2026, 11, 13, 8, tzinfo=UTC)
    assert boundaries.periods["last_30_days"].end_utc == datetime(2026, 11, 13, 8, tzinfo=UTC)
    assert len(boundaries.daily) == 31


def test_query_validates_exact_model_filter():
    assert ReplacementActivityQuery(switch_model="DEMO-MODEL-A").switch_model == "DEMO-MODEL-A"
    for value in ("", "x" * 31):
        with pytest.raises(ValidationError):
            ReplacementActivityQuery(switch_model=value)


def test_sql_is_fixed_parameterized_read_only_and_uses_exact_distincts():
    injection = "DEMO' OR 1=1--"
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    queries = build_replacement_activity_queries(
        ReplacementActivityQuery(switch_model=injection), boundaries
    )
    for (sql, params), windows in zip(queries, (4, 31), strict=True):
        assert sql in {REPLACEMENT_ACTIVITY_PERIOD_SQL, REPLACEMENT_ACTIVITY_DAILY_SQL}
        assert injection not in sql and params[-2:] == (injection, injection)
        assert sql.count("?") == len(params) == windows * 3 + 4
        assert "x.replaced_at_utc >= ? AND x.replaced_at_utc < ?" in sql
        assert "LEFT JOIN dbo.IL_RUNS" in sql
        assert "SELECT DISTINCT window_ordinal, attribution, replacement_id" in sql
        assert "SELECT DISTINCT window_ordinal, attribution, assignment_id, logical_channel" in sql
        assert "SELECT DISTINCT window_ordinal, attribution, unit_id" in sql
        assert "CONCAT" not in sql and "+ logical_channel" not in sql
        assert "AT TIME ZONE" not in sql
        unquoted = re.sub(r"'[^']*'", "", sql)
        assert not re.search(
            r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE|INTO)\b",
            unquoted,
            re.I,
        )


def test_sql_preserves_unattributed_and_not_current_events():
    sql = REPLACEMENT_ACTIVITY_PERIOD_SQL
    assert "x.related_run_id IS NULL" in sql
    assert "r.void_info_json IS NOT NULL" in sql
    assert "r.analysis_status IN ('excluded', 'superseded')" in sql
    assert "r.superseded_by_run_id IS NOT NULL" in sql
    assert "x.source_recommendation_id IS NULL" in sql
    assert "analysis_status NOT IN" not in sql


def test_synthetic_oracle_covers_attribution_and_exact_distinct_semantics():
    # replacement, assignment, logical channel, unit, purpose, current
    events = [
        (1, 10, 19, 100, "production", True),
        (2, 10, 19, 100, "production", False),
        (3, 10, 19, 100, "engineering", True),
        (4, 11, 19, 100, "engineering", True),
        (5, 12, 7, 101, None, True),
    ]

    def aggregate(purpose=None):
        selected = events if purpose == "all" else [row for row in events if row[4] == purpose]
        return (
            len({row[0] for row in selected}),
            len({(row[1], row[2]) for row in selected}),
            len({row[3] for row in selected}),
            sum(not row[5] for row in selected),
        )

    assert aggregate("production") == (2, 1, 1, 1)
    assert aggregate("engineering") == (2, 2, 1, 0)
    assert aggregate(None) == (1, 1, 1, 0)
    assert aggregate("all") == (5, 3, 2, 1)
    # One unit and one logical channel overlap across assignments/buckets; all exacts are direct.
    assert (
        aggregate("all")[1]
        != aggregate("production")[1] + aggregate("engineering")[1] + aggregate(None)[1]
    )
    assert (
        aggregate("all")[2]
        != aggregate("production")[2] + aggregate("engineering")[2] + aggregate(None)[2]
    )


def test_result_rows_return_r04_components_and_null_zero_denominator():
    period_rows = rows(4)
    daily_rows = rows(31)
    # all/today has zero units while retaining a valid zero-event row.
    period_rows[0] = (0, "all", 0, 0, 0, 0, 0)
    result = summarize_replacement_activity(period_rows, daily_rows)
    assert result.periods["today"]["all"].events_per_unit is None
    assert result.periods["today"]["production"].events == 2
    assert result.periods["today"]["production"].units == 1
    assert result.periods["today"]["production"].events_per_unit == 2
    assert result.administrative_exclusions == 0
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_replacement_activity(period_rows[:-1], daily_rows)


def test_disabled_returns_only_not_connected(client):
    response = client.get("/api/v1/reporting/replacement-activity")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}


def test_connected_contract_and_model_filter(application):
    fake = FakeReplacementRepository(metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/replacement-activity", params={"switch_model": "DEMO-MODEL-A"}
        )
    assert response.status_code == 200
    result = ReplacementActivityConnectedResponse.model_validate(response.json())
    assert result.filters.switch_model == "DEMO-MODEL-A"
    assert result.periods["today"].by_attribution["all"].events == 2
    assert result.daily[-1].partial is True
    assert fake.calls[0][1].extracted_at_utc == EXTRACTED_AT


@pytest.mark.parametrize("params", [{"switch_model": "x" * 31}, {"unknown": "DEMO"}])
def test_validation_is_sanitized(client, params):
    response = client.get("/api/v1/reporting/replacement-activity", params=params)
    assert response.status_code == 422
    assert ErrorResponse.model_validate(response.json()).error.code == "validation_error"
    assert "DEMO" not in response.text


def test_failure_is_exact_sanitized_503(application):
    fake = FakeReplacementRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "encrypted_unverified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get("/api/v1/reporting/replacement-activity")
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}
