"""Offline Q02-by-logical-channel tests. No test opens a database connection."""

import json
import re
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import compute_channel_activity_boundaries
from app.reporting.models import (
    ChannelActivityQuery,
    ChannelFailuresQuery,
)
from app.reporting.repository import (
    CHANNEL_FAILURES_ROW_CAP,
    CHANNEL_FAILURES_SQL,
    FAILURE_RATE_LIMITS_SQL,
    FAILURE_RATE_PERIOD_SQL,
    FAILURE_RATE_RUN_CAP,
    SqlServerReportingRepository,
    build_channel_failures_queries,
    build_failure_rate_queries,
    summarize_channel_failures,
    summarize_failure_rate,
)
from app.schemas import ChannelFailuresConnectedResponse

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


LIMITS = [
    (1, "SM", snapshot()),
    (2, "SM", snapshot()),
    (3, "SM", "not-json"),
    (4, "SM", snapshot()),
]
# channel, run, front-panel count, observed, failed, SQL-parsed limit
ROWS = [
    (1, 1, 48, 1, 1, Decimal("2.5000")),
    (1, 2, 24, 1, 0, Decimal("2.5000")),
    (1, 3, 48, 1, 1, None),
    (2, 1, 48, 1, 0, Decimal("2.5000")),
    (2, 4, 48, 1, 1, Decimal("2.6000")),
    (40, 1, 48, 1, 1, Decimal("2.5000")),
]


def test_sql_reuses_failure_rate_population_and_binds_the_selected_period():
    injection = "DEMO' OR 1=1--"
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    query = ChannelFailuresQuery(
        period="this_week",
        purposes=("production", "engineering"),
        wavelength_mode="SM",
        switch_model=injection,
    )
    (sql, params), (limits_sql, limit_params) = build_channel_failures_queries(query, boundaries)
    window = boundaries.periods["this_week"]
    start, end = window.start_utc.replace(tzinfo=None), window.end_utc.replace(tzinfo=None)
    assert sql == CHANNEL_FAILURES_SQL and limits_sql == FAILURE_RATE_LIMITS_SQL
    assert injection not in sql and injection in params
    assert sql.count("?") == len(params) == 12
    expected_filters = (
        start,
        end,
        "production",
        "engineering",
        "engineering",
        "engineering",
        "SM",
        "SM",
        injection,
        injection,
    )
    assert params == (*expected_filters, start, end)
    assert limit_params == expected_filters
    # The candidate-run and first-observation CTEs are the failure-rate ones, unchanged.
    shared = FAILURE_RATE_PERIOD_SQL.split("candidate_runs AS (", 1)[1].split(
        "windowed_observations AS (", 1
    )[0]
    assert shared in sql
    assert "WHERE observation_rank = 1" in sql
    assert "f.written_at_utc >= ? AND f.written_at_utc < ?" in sql
    assert "wavelength_1_il_db > sql_fail_limit" in sql
    assert "wavelength_2_il_db > sql_fail_limit" in sql
    assert "GROUP BY logical_channel, run_id, front_panel_channel_count, sql_fail_limit" in sql
    unquoted = re.sub(r"'[^']*'", "", sql)
    assert not re.search(
        r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE|INTO)\b", unquoted, re.I
    )
    for statement in (sql, limits_sql):
        for match in re.finditer(r"JSON_VALUE\(", statement):
            assert "ISJSON(" in statement[match.end() : match.end() + 80]


def test_failure_rate_population_still_uses_the_thirty_day_seed():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    _, _, (_, filters) = build_failure_rate_queries(ChannelActivityQuery(), boundaries)
    assert filters[0] == boundaries.periods["last_30_days"].start_utc.replace(tzinfo=None)
    assert filters[1] == boundaries.extracted_at_utc.replace(tzinfo=None)


def test_summary_groups_by_channel_and_keeps_unknown_limits_out_of_counts():
    result = summarize_channel_failures(ROWS, LIMITS)
    by_channel = {c.logical_channel: c for c in result.channels}
    assert list(by_channel) == [1, 2, 40]
    # Run 3 has an invalid snapshot; run 4's SQL limit disagrees with Python's.
    assert by_channel[1].model_dump() == {
        "logical_channel": 1,
        "failed": 1,
        "observed": 2,
        "rate": 0.5,
        "unknown_criteria": 1,
    }
    assert (by_channel[2].failed, by_channel[2].observed, by_channel[2].unknown_criteria) == (
        0,
        1,
        1,
    )
    assert by_channel[40].rate == 1
    assert result.totals.model_dump() == {
        "failed": 2,
        "observed": 4,
        "rate": 0.5,
        "unknown_criteria": 2,
    }
    assert result.runs == 4
    assert result.max_channel == 48
    assert result.incomplete is False


def test_channel_sums_equal_failure_rate_period_totals_for_the_same_runs():
    per_run: dict[int, list[int]] = {}
    for _, run_id, _, observed, failed, _ in ROWS:
        totals = per_run.setdefault(run_id, [0, 0])
        totals[0] += observed
        totals[1] += failed
    limits_by_run = {row[1]: row[5] for row in ROWS}
    period_rows = [
        (0, run_id, observed, failed, limits_by_run[run_id])
        for run_id, (observed, failed) in sorted(per_run.items())
    ]
    period = summarize_failure_rate(period_rows, [], LIMITS).periods["today"]
    channels = summarize_channel_failures(ROWS, LIMITS).totals
    assert channels == period


def test_empty_period_has_no_channels_and_null_rate():
    result = summarize_channel_failures([], LIMITS)
    assert result.channels == ()
    assert result.totals.rate is None and result.totals.observed == 0
    assert result.max_channel is None and result.runs == 0


def test_run_cap_sets_incomplete_and_invalid_rows_fail_closed():
    limits = [(index, "SM", snapshot()) for index in range(1, FAILURE_RATE_RUN_CAP + 2)]
    assert summarize_channel_failures([], limits).incomplete is True
    for bad in [
        (49, 1, 48, 1, 0, Decimal("2.5000")),  # channel beyond front panel
        (0, 1, 48, 1, 0, Decimal("2.5000")),
        (1, 99, 48, 1, 0, Decimal("2.5000")),  # run outside the limit set
        (1, 1, 48, 1, 2, Decimal("2.5000")),  # failed > observed
        (1, 1, 48, 1, 0),
    ]:
        with pytest.raises(ReportingError, match="schema_incompatible"):
            summarize_channel_failures([bad], LIMITS)
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_channel_failures([ROWS[0], ROWS[0]], LIMITS)


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
    result = SqlServerReportingRepository(FakeAdapter(cursor)).get_channel_failures(
        ChannelFailuresQuery(), boundaries
    )
    assert result.totals.observed == 4
    assert [sql for sql, _ in cursor.executed] == [CHANNEL_FAILURES_SQL, FAILURE_RATE_LIMITS_SQL]
    assert cursor.fetch_sizes == [CHANNEL_FAILURES_ROW_CAP + 1, FAILURE_RATE_RUN_CAP + 1]

    monkeypatch.setattr("app.reporting.repository.CHANNEL_FAILURES_ROW_CAP", 2)
    with pytest.raises(ReportingError, match="schema_incompatible"):
        SqlServerReportingRepository(FakeAdapter(FakeCursor(ROWS, LIMITS))).get_channel_failures(
            ChannelFailuresQuery(), boundaries
        )


class FakeRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_channel_failures(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error is not None:
            raise self.error
        return self.result


def test_disabled_returns_only_not_connected(client):
    response = client.get("/api/v1/reporting/channel-failures")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}


def test_connected_contract_period_and_filters(application):
    fake = FakeRepository(summarize_channel_failures(ROWS, LIMITS))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/channel-failures",
            params=[
                ("period", "yesterday"),
                ("purpose", "production"),
                ("purpose", "engineering"),
                ("wavelength_mode", "SM"),
                ("switch_model", "DEMO-MODEL-A"),
            ],
        )
    assert response.status_code == 200
    result = ChannelFailuresConnectedResponse.model_validate(response.json())
    assert result.period.key == "yesterday" and result.period.partial is False
    assert result.filters.purpose == ["production", "engineering"]
    assert result.filters.switch_model == "DEMO-MODEL-A"
    assert [c.logical_channel for c in result.channels] == [1, 2, 40]
    assert result.totals.failed == 2 and result.max_channel == 48
    query, _ = fake.calls[0]
    assert query.period == "yesterday" and query.purposes == ("production", "engineering")


def test_invalid_period_is_rejected(application):
    fake = FakeRepository(summarize_channel_failures([], LIMITS))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    with TestClient(application) as client:
        response = client.get("/api/v1/reporting/channel-failures", params={"period": "forever"})
    assert response.status_code == 422
    assert fake.calls == []


def test_failure_is_exact_sanitized_503(application):
    fake = FakeRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "encrypted_unverified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get("/api/v1/reporting/channel-failures")
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}
