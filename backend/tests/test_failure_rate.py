"""Offline Q02 failure-rate tests. No test opens a database connection."""

import json
import re
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import PERIOD_KEYS, compute_channel_activity_boundaries
from app.reporting.models import ChannelActivityQuery, FailureRateCounts, FailureRateMetrics
from app.reporting.repository import (
    FAILURE_RATE_DAILY_SQL,
    FAILURE_RATE_LIMITS_SQL,
    FAILURE_RATE_PERIOD_SQL,
    FAILURE_RATE_RUN_CAP,
    build_failure_rate_queries,
    summarize_failure_rate,
)
from app.reporting.unit_lookup import classify_losses, parse_limit_snapshot
from app.schemas import FailureRateConnectedResponse

EXTRACTED_AT = datetime(2026, 11, 13, 20, tzinfo=UTC)


def snapshot(fail: str = "2.5000", mode: str = "SM") -> str:
    return json.dumps(
        {
            "model": "OSX-100",
            "wavelength_mode": mode,
            "profile_name": "DEMO-Q02",
            "revision": "DEMO-1",
            "too_good_below_db": 0,
            "warning_enabled": False,
            "warning_above_db": None,
            "fail_above_db": fail,
            "minimum_replacement_improvement_db": 0.2,
        }
    )


def counts(value: int) -> FailureRateCounts:
    return FailureRateCounts(
        failed=value,
        observed=value + 4,
        rate=value / (value + 4),
        unknown_criteria=1,
    )


def metrics() -> FailureRateMetrics:
    return FailureRateMetrics(
        periods={key: counts(index + 1) for index, key in enumerate(PERIOD_KEYS)},
        daily=tuple(counts(index) for index in range(31)),
        incomplete=False,
    )


class FakeFailureRateRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_failure_rate(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error is not None:
            raise self.error
        return self.result


def test_source_strict_boundary_and_either_wavelength_failure():
    limits = parse_limit_snapshot(snapshot(), "SM")
    assert limits is not None
    assert classify_losses(Decimal("2.5000"), Decimal("1.0000"), limits) == "pass"
    assert classify_losses(Decimal("2.5001"), Decimal("1.0000"), limits) == "fail"
    assert classify_losses(Decimal("1.0000"), Decimal("2.5001"), limits) == "fail"


def test_sql_is_fixed_bounded_parameterized_read_only_and_ranks_before_windowing():
    injection = "DEMO' OR 1=1--"
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    query = ChannelActivityQuery(
        purposes=("production", "engineering"),
        wavelength_mode="SM",
        switch_model=injection,
    )
    period, daily, limits = build_failure_rate_queries(query, boundaries)
    for (sql, params), windows in ((period, 4), (daily, 31)):
        assert sql in {FAILURE_RATE_PERIOD_SQL, FAILURE_RATE_DAILY_SQL}
        assert injection not in sql and injection in params
        assert sql.count("?") == len(params) == windows * 3 + 10
        assert f"TOP ({FAILURE_RATE_RUN_CAP})" in sql
        assert "PARTITION BY m.run_id, m.logical_channel" in sql
        assert "ORDER BY m.written_at_utc, m.measurement_id" in sql
        assert "WHERE observation_rank = 1" in sql
        assert "f.written_at_utc >= w.start_utc" in sql
        assert "wavelength_1_il_db > sql_fail_limit" in sql
        assert "wavelength_2_il_db > sql_fail_limit" in sql
        assert "ISJSON(r.limit_snapshot_json) = 1" in sql
        assert "TRY_CONVERT(DECIMAL(9,4)" in sql
        assert "GROUP BY window_ordinal, run_id, sql_fail_limit" in sql
        unquoted = re.sub(r"'[^']*'", "", sql)
        assert not re.search(
            r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE|INTO)\b",
            unquoted,
            re.I,
        )
    assert limits[0] == FAILURE_RATE_LIMITS_SQL
    assert limits[0].count("?") == len(limits[1]) == 10
    assert f"TOP ({FAILURE_RATE_RUN_CAP + 1})" in limits[0]


def test_sql_contains_population_a_and_first_history_filters():
    sql = FAILURE_RATE_PERIOD_SQL
    for predicate in [
        "r.analysis_status NOT IN ('excluded', 'superseded')",
        "r.superseded_by_run_id IS NULL",
        "r.run_purpose IN (?, ?, ?, ?)",
        "seed.measurement_role = 'logical_channel'",
        "r.front_panel_channel_count > 0",
        "m.measurement_role = 'logical_channel'",
        "m.logical_channel >= 1",
        "m.logical_channel <= r.front_panel_channel_count",
    ]:
        assert predicate in sql
    ranked = sql.split("ranked_observations AS (", 1)[1].split("first_observations AS", 1)[0]
    assert "written_at_utc >= ?" not in ranked
    assert "completion_status" not in sql


def test_synthetic_first_observation_oracle_handles_history_retests_and_population_a():
    # run, channel, written, measurement, losses, status, pointer, purpose, N
    rows = [
        (1, 1, 1, 10, 2.6, 1.0, "included", None, "production", 2),
        (1, 1, 2, 11, 1.0, 1.0, "included", None, "production", 2),
        (1, 2, 0, 12, 2.6, 1.0, "included", None, "production", 2),
        (2, 1, 2, 20, 1.0, 1.0, "included", None, "production", 2),
        (3, 1, 2, 30, 2.6, 1.0, "excluded", None, "production", 2),
        (4, 1, 2, 40, 2.6, 1.0, "included", 99, "production", 2),
        (5, 3, 2, 50, 2.6, 1.0, "included", None, "production", 2),
        (6, 1, 2, 60, 2.6, 1.0, "included", None, "engineering", 2),
    ]
    eligible = [
        row
        for row in rows
        if row[6] not in {"excluded", "superseded"}
        and row[7] is None
        and row[8] == "production"
        and row[9] > 0
        and 1 <= row[1] <= row[9]
    ]
    first = {}
    for row in eligible:
        key = (row[0], row[1])
        first[key] = min(first.get(key, row), row, key=lambda item: (item[2], item[3]))
    in_window = [row for row in first.values() if 1 <= row[2] < 3]
    assert {(row[0], row[1]) for row in in_window} == {(1, 1), (2, 1)}
    assert sum(row[4] > 2.5 or row[5] > 2.5 for row in in_window) == 1
    # Run 2 is a retest run and contributes its own first observation.
    assert any(row[0] == 2 for row in in_window)


def test_summary_excludes_invalid_and_mismatched_limits_and_keeps_direct_period_sums():
    limits = [
        (1, "SM", snapshot()),
        (2, "SM", "not-json"),
        (3, "SM", snapshot()),
    ]
    period_rows = [
        (0, 1, 4, 2, Decimal("2.5000")),
        (0, 2, 3, 0, None),
        (0, 3, 2, 1, Decimal("2.6000")),
        (3, 1, 8, 3, Decimal("2.5000")),
    ]
    daily_rows = [(0, 1, 1, 0, Decimal("2.5000"))]
    result = summarize_failure_rate(period_rows, daily_rows, limits)
    assert result.periods["today"].model_dump() == {
        "failed": 2,
        "observed": 4,
        "rate": 0.5,
        "unknown_criteria": 5,
    }
    assert result.periods["last_30_days"].observed == 8
    assert result.daily[0].rate == 0
    assert result.daily[1].rate is None
    assert result.daily[1].observed == 0


def test_limit_cap_sets_incomplete_and_invalid_rows_fail_closed():
    rows = [(index, "SM", snapshot()) for index in range(1, FAILURE_RATE_RUN_CAP + 2)]
    result = summarize_failure_rate([], [], rows)
    assert result.incomplete is True
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_failure_rate([(0, 99999, 1, 0, Decimal("2.5000"))], [], rows)


def test_failure_rate_disabled_returns_only_not_connected(client):
    response = client.get("/api/v1/reporting/failure-rate")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}


def test_failure_rate_connected_contract_and_repeated_purposes(application):
    fake = FakeFailureRateRepository(metrics())
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/failure-rate",
            params=[
                ("purpose", "production"),
                ("purpose", "engineering"),
                ("wavelength_mode", "SM"),
                ("switch_model", "DEMO-MODEL-A"),
            ],
        )
    assert response.status_code == 200
    result = FailureRateConnectedResponse.model_validate(response.json())
    assert result.classification_rule == "strict >, run limit snapshot"
    assert result.filters.purpose == ["production", "engineering"]
    assert result.periods["today"].failed == 1
    assert len(result.daily) == 31 and result.daily[-1].partial is True
    query, boundaries = fake.calls[0]
    assert query.purposes == ("production", "engineering")
    assert boundaries.extracted_at_utc == EXTRACTED_AT


def test_failure_rate_failure_is_exact_sanitized_503(application):
    fake = FakeFailureRateRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "encrypted_unverified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get("/api/v1/reporting/failure-rate")
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}
    assert "encrypted_unverified" not in response.text
