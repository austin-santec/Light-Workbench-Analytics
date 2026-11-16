"""Offline R06 recommendation-usage tests. No test opens a database connection."""

import re
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import compute_channel_activity_boundaries
from app.reporting.models import (
    RecommendationUsageAverage,
    RecommendationUsageCounts,
    RecommendationUsageMetrics,
    RecommendationUsageQuery,
)
from app.reporting.recommendation_usage import (
    RECOMMENDATION_USAGE_SQL,
    build_recommendation_usage_query,
    read_recommendation_usage,
    summarize_recommendation_usage,
)
from app.schemas import RecommendationUsageConnectedResponse

EXTRACTED_AT = datetime(2026, 11, 13, 20, tzinfo=UTC)


def result_row() -> tuple:
    return (
        2,
        2,
        1,
        3,
        1,
        1,
        1,
        2,
        1,
        1,
        0,
        Decimal("0.42495"),
        2,
        Decimal("0.38494"),
        3,
        4,
        1,
        2,
    )


class OneRowResult:
    def __init__(self, row):
        self.row = row

    def fetchone(self):
        return self.row


class FakeCursor:
    def __init__(self, row):
        self.row = row
        self.calls = []

    def execute(self, sql, params):
        self.calls.append((sql, params))
        return OneRowResult(self.row)


def test_parameter_order_window_binding_and_purpose_slots():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    query = RecommendationUsageQuery(period="today", purposes=("production", "engineering"))
    sql, params = build_recommendation_usage_query(query, boundaries)
    assert sql == RECOMMENDATION_USAGE_SQL
    assert params == (
        datetime(2026, 11, 13, 8),
        datetime(2026, 11, 13, 20),
        "production",
        "engineering",
        "engineering",
        "engineering",
        datetime(2026, 11, 13, 20),
    )
    assert sql.count("?") == len(params) == 7


def test_sql_is_fixed_read_only_and_uses_distinct_ids_and_safe_json_rules():
    sql = RECOMMENDATION_USAGE_SQL
    assert "SELECT DISTINCT analysis_id" in sql
    assert "SELECT DISTINCT rr.recommendation_id" in sql
    assert "WHERE EXISTS" in sql
    assert "x.replaced_at_utc <= t.extracted_at_utc" in sql
    assert "AVG(CAST(improvement_db AS DECIMAL(19,6)))" in sql
    assert "vw_ReplacementRecommendationUsage" not in sql
    assert "JSON_VALUE" not in sql
    assert "SELECT *" not in sql.upper() and " INTO " not in sql.upper()
    unquoted = re.sub(r"'(?:''|[^'])*'", "''", sql)
    assert not re.search(
        r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE)\b",
        unquoted,
        re.I,
    )


def test_fake_cursor_returns_splits_invalid_count_and_decimal_rounding():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    cursor = FakeCursor(result_row())
    metrics = read_recommendation_usage(cursor, RecommendationUsageQuery(), boundaries)
    assert len(cursor.calls) == 1
    assert metrics.analyses_cohort == 2
    assert metrics.analyses_with_recommendations == 2
    assert metrics.analyses_on_invalid_runs == 1
    assert metrics.recommendations.model_dump() == {
        "total": 3,
        "required": 1,
        "optional": 1,
        "other": 1,
    }
    assert metrics.linked.model_dump() == {
        "total": 2,
        "required": 1,
        "optional": 1,
        "other": 0,
    }
    assert metrics.linked_share == "0.6667"
    assert metrics.avg_improvement_linked_db.value == "0.4250"
    assert metrics.avg_improvement_all_db.value == "0.3849"
    assert metrics.unlinked_events == 4
    assert metrics.unlinked_unattributed == 1


def test_synthetic_demo_oracle_includes_links_outside_period_and_unattributed_events():
    start = EXTRACTED_AT - timedelta(days=1)
    analyses = [
        (1, "production", True),
        (2, "production", False),
        (3, "engineering", True),
    ]
    recommendations = [
        (101, 1, "required", Decimal("0.5000")),
        (102, 1, "optional", Decimal("0.3000")),
        (103, 1, "DEMO-other", Decimal("0.1000")),
        (104, 2, "required", Decimal("0.9000")),
        (105, 3, "required", Decimal("0.7000")),
    ]
    replacements = [
        (201, 101, start - timedelta(days=5), "production"),
        (202, None, start + timedelta(hours=2), "production"),
        (203, None, start + timedelta(hours=3), None),
        (204, 102, start + timedelta(hours=4), "production"),
    ]
    valid_analysis_ids = {
        analysis_id for analysis_id, purpose, valid in analyses if purpose == "production" and valid
    }
    cohort = [row for row in recommendations if row[1] in valid_analysis_ids]
    linked_ids = {
        recommendation_id
        for _, recommendation_id, replaced_at, _ in replacements
        if recommendation_id is not None and replaced_at <= EXTRACTED_AT
    }
    assert [row[0] for row in cohort] == [101, 102, 103]
    assert {row[0] for row in cohort if row[0] in linked_ids} == {101, 102}
    assert 101 in linked_ids  # Its replacement is outside P but linkage still counts through T.
    assert (
        sum(
            recommendation_id is None and purpose == "production"
            for _, recommendation_id, replaced_at, purpose in replacements
            if start <= replaced_at < EXTRACTED_AT
        )
        == 1
    )
    assert (
        sum(
            recommendation_id is None and purpose is None
            for _, recommendation_id, replaced_at, purpose in replacements
            if start <= replaced_at < EXTRACTED_AT
        )
        == 1
    )
    assert sum(not valid for _, purpose, valid in analyses if purpose == "production") == 1


def test_zero_denominator_returns_null_share_and_averages():
    result = summarize_recommendation_usage(
        (0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, None, 0, None, 0, 0, 0, 0)
    )
    assert result.linked_share is None
    assert result.avg_improvement_linked_db.model_dump() == {"value": None, "n": 0}
    assert result.avg_improvement_all_db.model_dump() == {"value": None, "n": 0}


@pytest.mark.parametrize(
    "row",
    [
        result_row()[:-1],
        (*result_row()[:11], None, *result_row()[12:]),
        (2, 2, 1, 3, 1, 1, 0, 2, 1, 1, 0, Decimal("0.4"), 2, Decimal("0.3"), 3, 0, 0, 0),
    ],
)
def test_malformed_aggregate_rows_fail_closed(row):
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_recommendation_usage(row)


class FakeRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_recommendation_usage(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error:
            raise self.error
        return self.result


def connected_metrics() -> RecommendationUsageMetrics:
    return RecommendationUsageMetrics(
        analyses_cohort=2,
        analyses_with_recommendations=2,
        analyses_on_invalid_runs=1,
        recommendations=RecommendationUsageCounts(total=3, required=1, optional=1, other=1),
        linked=RecommendationUsageCounts(total=2, required=1, optional=1, other=0),
        linked_share="0.6667",
        avg_improvement_linked_db=RecommendationUsageAverage(value="0.4250", n=2),
        avg_improvement_all_db=RecommendationUsageAverage(value="0.3849", n=3),
        unlinked_events=4,
        unlinked_unattributed=1,
        linked_events_in_period=2,
    )


def test_not_connected_connected_and_sanitized_503(client, application):
    response = client.get("/api/v1/reporting/recommendation-usage")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}

    fake = FakeRepository(connected_metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as connected_client:
        response = connected_client.get(
            "/api/v1/reporting/recommendation-usage",
            params=[("period", "today"), ("purpose", "production")],
        )
    assert response.status_code == 200
    result = RecommendationUsageConnectedResponse.model_validate(response.json())
    assert result.period.key == "today"
    assert result.filters.purpose == ["production"]
    assert result.linked_share == "0.6667"
    assert result.avg_improvement_linked_db.value == "0.4250"
    assert fake.calls[0][1].extracted_at_utc == EXTRACTED_AT

    failure = FakeRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        failure, "encrypted_unverified"
    )
    with TestClient(application) as failure_client:
        response = failure_client.get("/api/v1/reporting/recommendation-usage")
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
    response = client.get("/api/v1/reporting/recommendation-usage", params=params)
    assert response.status_code == 422
    assert "DEMO" not in response.text
