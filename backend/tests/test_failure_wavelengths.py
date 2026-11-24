"""Offline failure-wavelength tests. No test opens a database connection."""

import json
import re
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import compute_channel_activity_boundaries
from app.reporting.models import FailureWavelengthsQuery
from app.reporting.repository import (
    CHANNEL_FAILURES_ROW_CAP,
    FAILURE_RATE_LIMITS_SQL,
    FAILURE_RATE_RUN_CAP,
    FAILURE_WAVELENGTHS_SQL,
    FIRST_OBSERVATION_CTES,
    SqlServerReportingRepository,
    build_failure_wavelengths_queries,
    summarize_failure_wavelengths,
)
from app.schemas import FailureWavelengthsConnectedResponse

EXTRACTED_AT = datetime(2026, 11, 24, 17, tzinfo=UTC)


def snapshot(fail: str = "2.5000", mode: str = "SM") -> str:
    return json.dumps(
        {
            "model": "DEMO-OSX-100",
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
    (2, "MM", snapshot(mode="MM")),
    (3, "SM", "not-json"),
    (4, "SM", snapshot()),
]
# channel, run, mode, nm 1/2, loss 1/2, SQL failure, SQL-parsed limit
ROWS = [
    (1, 1, "SM", 1310, 1550, Decimal("2.5001"), Decimal("2.5000"), 1, Decimal("2.5000")),
    (2, 1, "SM", 1310, 1550, Decimal("2.5000"), Decimal("2.5001"), 1, Decimal("2.5000")),
    (3, 1, "SM", 1310, 1550, Decimal("2.6000"), Decimal("2.7000"), 1, Decimal("2.5000")),
    (1, 2, "MM", 850, 1300, Decimal("2.5000"), Decimal("2.6000"), 1, Decimal("2.5000")),
    (2, 2, "MM", 850, 1300, None, Decimal("2.6000"), 1, Decimal("2.5000")),
    (3, 2, "MM", 850, 1300, Decimal("2.5000"), Decimal("2.5000"), 0, Decimal("2.5000")),
    (1, 3, "SM", 1310, 1550, Decimal("9.0000"), Decimal("9.0000"), 0, None),
    (1, 4, "SM", 1490, 1625, Decimal("2.0000"), Decimal("2.0000"), 0, Decimal("2.5000")),
]


def test_sql_binds_selected_period_and_projects_measurement_wavelengths():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    query = FailureWavelengthsQuery(period="this_week", purposes=("production", "engineering"))
    (sql, params), (limits_sql, limit_params) = build_failure_wavelengths_queries(query, boundaries)
    window = boundaries.periods["this_week"]
    start, end = window.start_utc.replace(tzinfo=None), window.end_utc.replace(tzinfo=None)
    expected_filters = (
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
    assert sql == FAILURE_WAVELENGTHS_SQL and limits_sql == FAILURE_RATE_LIMITS_SQL
    assert params == (*expected_filters, start, end)
    assert limit_params == expected_filters
    assert sql.count("?") == len(params) == 12
    assert FIRST_OBSERVATION_CTES in sql
    for field in (
        "c.wavelength_mode",
        "m.wavelength_1_nm",
        "m.wavelength_2_nm",
        "m.wavelength_1_il_db",
        "m.wavelength_2_il_db",
    ):
        assert field in sql
    assert "ORDER BY run_id, logical_channel" in sql
    unquoted = re.sub(r"'[^']*'", "", sql)
    assert not re.search(
        r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE|INTO)\b",
        unquoted,
        re.I,
    )


def test_summary_strict_buckets_two_pairs_order_totals_and_zero_failure_omission():
    result = summarize_failure_wavelengths(ROWS, LIMITS)
    assert [pair.model_dump() for pair in result.pairs] == [
        {
            "wavelength_mode": "MM",
            "wavelength_1_nm": 850,
            "wavelength_2_nm": 1300,
            "failed": 2,
            "first_only": 0,
            "second_only": 2,
            "both": 0,
        },
        {
            "wavelength_mode": "SM",
            "wavelength_1_nm": 1310,
            "wavelength_2_nm": 1550,
            "failed": 3,
            "first_only": 1,
            "second_only": 1,
            "both": 1,
        },
    ]
    assert result.totals.model_dump() == {
        "failed": 5,
        "observed": 7,
        "unknown_criteria": 1,
        "runs": 4,
    }
    assert result.totals.failed == sum(pair.failed for pair in result.pairs)
    assert result.incomplete is False


def test_empty_unknown_criteria_and_run_cap():
    empty = summarize_failure_wavelengths([], LIMITS)
    assert empty.pairs == ()
    assert empty.totals.model_dump() == {
        "failed": 0,
        "observed": 0,
        "unknown_criteria": 0,
        "runs": 0,
    }
    unknown = summarize_failure_wavelengths([ROWS[-2]], LIMITS)
    assert unknown.totals.observed == 0
    assert unknown.totals.unknown_criteria == 1
    capped = [(index, "SM", snapshot()) for index in range(1, FAILURE_RATE_RUN_CAP + 2)]
    assert summarize_failure_wavelengths([], capped).incomplete is True


@pytest.mark.parametrize(
    "bad",
    [
        (0, 1, "SM", 1310, 1550, 2.6, 2.0, 1, 2.5),
        (1, 0, "SM", 1310, 1550, 2.6, 2.0, 1, 2.5),
        (1, 1, "XX", 1310, 1550, 2.6, 2.0, 1, 2.5),
        (1, 1, "SM", 0, 1550, 2.6, 2.0, 1, 2.5),
        (1, 1, "SM", 1310, 1310, 2.6, 2.0, 1, 2.5),
        (1, 1, "SM", 1310, 1550, True, 2.0, 1, 2.5),
        (1, 1, "SM", 1310, 1550, 2.6, 2.0, 2, 2.5),
        (1, 99, "SM", 1310, 1550, 2.6, 2.0, 1, 2.5),
        (1, 1, "SM", 1310, 1550, 2.6, 2.0, 1),
    ],
)
def test_invalid_rows_fail_closed(bad):
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_failure_wavelengths([bad], LIMITS)


def test_duplicate_limit_disagreement_and_sql_bucket_mismatch_fail_closed():
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_failure_wavelengths([ROWS[0], (1, 1, *ROWS[0][2:])], LIMITS)
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_failure_wavelengths([(*ROWS[0][:-1], Decimal("2.6000"))], LIMITS)
    neither_over_but_failed = (1, 1, "SM", 1310, 1550, None, Decimal("2.5000"), 1, 2.5)
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_failure_wavelengths([neither_over_but_failed], LIMITS)


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
    result = SqlServerReportingRepository(FakeAdapter(cursor)).get_failure_wavelengths(
        FailureWavelengthsQuery(), boundaries
    )
    assert result.totals.failed == 5
    assert [sql for sql, _ in cursor.executed] == [FAILURE_WAVELENGTHS_SQL, FAILURE_RATE_LIMITS_SQL]
    assert cursor.fetch_sizes == [CHANNEL_FAILURES_ROW_CAP + 1, FAILURE_RATE_RUN_CAP + 1]

    monkeypatch.setattr("app.reporting.repository.CHANNEL_FAILURES_ROW_CAP", 2)
    with pytest.raises(ReportingError, match="schema_incompatible"):
        repository = SqlServerReportingRepository(FakeAdapter(FakeCursor(ROWS, LIMITS)))
        repository.get_failure_wavelengths(FailureWavelengthsQuery(), boundaries)


class FakeRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_failure_wavelengths(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error is not None:
            raise self.error
        return self.result


def test_disabled_returns_only_not_connected(client):
    response = client.get("/api/v1/reporting/failure-wavelengths")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}


def test_connected_contract_defaults_period_filters_and_order(application):
    fake = FakeRepository(summarize_failure_wavelengths(ROWS, LIMITS))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "encrypted_unverified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/failure-wavelengths",
            params=[("period", "yesterday"), ("purpose", "production"), ("purpose", "engineering")],
        )
    assert response.status_code == 200
    result = FailureWavelengthsConnectedResponse.model_validate(response.json())
    assert result.period.key == "yesterday" and result.period.partial is False
    assert result.filters.purpose == ["production", "engineering"]
    assert [(pair.wavelength_mode, pair.wavelength_1_nm) for pair in result.pairs] == [
        ("MM", 850),
        ("SM", 1310),
    ]
    assert result.totals.failed == 5 and result.totals.runs == 4
    query, _ = fake.calls[0]
    assert query.period == "yesterday" and query.purposes == ("production", "engineering")


@pytest.mark.parametrize(
    "params",
    [
        {"period": "forever"},
        [("purpose", "production"), ("purpose", "production")],
        {"wavelength_mode": "SM"},
        {"model": "DEMO"},
        {"unknown": "value"},
    ],
)
def test_invalid_or_unknown_query_params_are_rejected(application, params):
    fake = FakeRepository(summarize_failure_wavelengths([], LIMITS))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    with TestClient(application) as client:
        response = client.get("/api/v1/reporting/failure-wavelengths", params=params)
    assert response.status_code == 422
    assert fake.calls == []


def test_failure_is_exact_sanitized_503(application):
    fake = FakeRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get("/api/v1/reporting/failure-wavelengths")
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}
