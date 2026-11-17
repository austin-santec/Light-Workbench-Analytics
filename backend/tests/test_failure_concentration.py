"""Offline failure-concentration tests. No test opens a database connection."""

import hashlib
import json
import re
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api import ReportingAccess, get_extracted_at_utc, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import compute_channel_activity_boundaries
from app.reporting.models import FailureConcentrationQuery
from app.reporting.repository import (
    CHANNEL_FAILURES_ROW_CAP,
    CHANNEL_FAILURES_SQL,
    FAILURE_CONCENTRATION_SQL,
    FAILURE_RATE_DAILY_SQL,
    FAILURE_RATE_LIMITS_SQL,
    FAILURE_RATE_PERIOD_SQL,
    FAILURE_RATE_RUN_CAP,
    FIRST_OBSERVATION_CTES,
    STATION_SUMMARY_SQL,
    SqlServerReportingRepository,
    build_failure_concentration_queries,
    summarize_channel_failures,
    summarize_failure_concentration,
)
from app.schemas import FailureConcentrationConnectedResponse

EXTRACTED_AT = datetime(2026, 11, 17, 20, tzinfo=UTC)


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
# logical channel, measured port, run, front-panel count, SQL failure, SQL-parsed limit
ROWS = [
    (1, 50, 1, 36, 1, Decimal("2.5000")),
    (2, 8, 1, 36, 0, Decimal("2.5000")),
    (2, 50, 2, 64, 1, Decimal("2.5000")),
    (1, 4, 3, 36, 0, None),
    (3, 5, 4, 36, 1, Decimal("2.5000")),
]


def test_sql_binds_selected_period_and_preserves_shared_sql_text():
    boundaries = compute_channel_activity_boundaries(EXTRACTED_AT)
    query = FailureConcentrationQuery(period="this_week", purposes=("production", "engineering"))
    (sql, params), (limits_sql, limit_params) = build_failure_concentration_queries(
        query, boundaries
    )
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
    assert sql == FAILURE_CONCENTRATION_SQL and limits_sql == FAILURE_RATE_LIMITS_SQL
    assert params == (*expected_filters, start, end)
    assert limit_params == expected_filters
    assert sql.count("?") == len(params) == 12
    assert FIRST_OBSERVATION_CTES in sql
    assert "JOIN dbo.IL_MEASUREMENTS AS m ON m.measurement_id = f.measurement_id" in sql
    assert "m.physical_port" in sql
    assert "wavelength_1_il_db > p.sql_fail_limit" in sql
    assert "wavelength_2_il_db > p.sql_fail_limit" in sql
    assert "ORDER BY run_id, logical_channel" in sql
    unquoted = re.sub(r"'[^']*'", "", sql)
    assert not re.search(
        r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE|INTO)\b",
        unquoted,
        re.I,
    )

    expected_hashes = {
        "FIRST_OBSERVATION_CTES": (
            "fad6bc803b49cf1a5670f30287178f074145a8f7c24467cfa6b960bc968e9114"
        ),
        "CHANNEL_FAILURES_SQL": "39f8a3e653de8a7b529860545d8740114e90acaddad1cab1c56abfd32947f6a7",
        "FAILURE_RATE_PERIOD_SQL": (
            "8afcbef833380698f973fbbac42558705c42bd06ccb5d94c5c6ba5a386fd059a"
        ),
        "FAILURE_RATE_DAILY_SQL": (
            "ceb9ea85f70cb29fc033278e1a3782dd445930926d15a1731f4e3845aacf1571"
        ),
        "STATION_SUMMARY_SQL": "a1f94cdcb5006b8fa3e42dfd52eda82623e88b3c0e1e1c5ab21301df8c210977",
    }
    actual = {
        name: hashlib.sha256(value.encode()).hexdigest()
        for name, value in {
            "FIRST_OBSERVATION_CTES": FIRST_OBSERVATION_CTES,
            "CHANNEL_FAILURES_SQL": CHANNEL_FAILURES_SQL,
            "FAILURE_RATE_PERIOD_SQL": FAILURE_RATE_PERIOD_SQL,
            "FAILURE_RATE_DAILY_SQL": FAILURE_RATE_DAILY_SQL,
            "STATION_SUMMARY_SQL": STATION_SUMMARY_SQL,
        }.items()
    }
    assert actual == expected_hashes


def test_summary_splits_same_port_by_extra_and_matches_channel_failures_totals():
    result = summarize_failure_concentration(ROWS, LIMITS)
    assert [item.logical_channel for item in result.channels] == [1, 2, 3]
    assert [(item.physical_port, item.extra) for item in result.ports] == [
        (4, False),
        (5, False),
        (8, False),
        (50, False),
        (50, True),
    ]
    assert result.totals.model_dump() == {
        "failed": 3,
        "observed": 4,
        "rate": 3 / 4,
        "unknown_criteria": 1,
    }
    assert result.runs == 4 and result.incomplete is False
    for key in ("failed", "observed", "unknown_criteria"):
        assert sum(getattr(item, key) for item in result.channels) == getattr(result.totals, key)
        assert sum(getattr(item, key) for item in result.ports) == getattr(result.totals, key)

    channel_rows = [(ch, run, panel, 1, failed, limit) for ch, _, run, panel, failed, limit in ROWS]
    assert summarize_channel_failures(channel_rows, LIMITS).totals == result.totals


def test_empty_unknown_limits_disagreement_and_run_cap():
    empty = summarize_failure_concentration([], LIMITS)
    assert empty.channels == () and empty.ports == () and empty.runs == 0
    assert empty.totals.model_dump() == {
        "failed": 0,
        "observed": 0,
        "rate": None,
        "unknown_criteria": 0,
    }
    result_unknown = summarize_failure_concentration([ROWS[-2]], LIMITS)
    assert result_unknown.totals.observed == 0
    assert result_unknown.totals.failed == 0
    assert result_unknown.totals.unknown_criteria == 1
    capped = [(index, "SM", snapshot()) for index in range(1, FAILURE_RATE_RUN_CAP + 2)]
    assert summarize_failure_concentration([], capped).incomplete is True


@pytest.mark.parametrize(
    "bad",
    [
        (0, 1, 1, 36, 0, Decimal("2.5000")),
        (37, 1, 1, 36, 0, Decimal("2.5000")),
        (1, 0, 1, 36, 0, Decimal("2.5000")),
        (1, 1, 0, 36, 0, Decimal("2.5000")),
        (1, 1, 99, 36, 0, Decimal("2.5000")),
        (1, 1, 1, 36, 2, Decimal("2.5000")),
        (1, 1, 1, 36, False, Decimal("2.5000")),
        (1, 1, 1, 36, 0),
    ],
)
def test_invalid_rows_fail_closed(bad):
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_failure_concentration([bad], LIMITS)


def test_duplicate_run_channel_fails_closed():
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_failure_concentration([ROWS[0], (*ROWS[0][:1], 51, *ROWS[0][2:])], LIMITS)


def test_sql_python_limit_disagreement_fails_closed():
    mismatched = (3, 5, 4, 36, 1, Decimal("2.6000"))
    with pytest.raises(ReportingError, match="schema_incompatible"):
        summarize_failure_concentration([mismatched], LIMITS)


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
    result = SqlServerReportingRepository(FakeAdapter(cursor)).get_failure_concentration(
        FailureConcentrationQuery(), boundaries
    )
    assert result.totals.observed == 4
    assert [sql for sql, _ in cursor.executed] == [
        FAILURE_CONCENTRATION_SQL,
        FAILURE_RATE_LIMITS_SQL,
    ]
    assert cursor.fetch_sizes == [CHANNEL_FAILURES_ROW_CAP + 1, FAILURE_RATE_RUN_CAP + 1]

    monkeypatch.setattr("app.reporting.repository.CHANNEL_FAILURES_ROW_CAP", 2)
    with pytest.raises(ReportingError, match="schema_incompatible"):
        repository = SqlServerReportingRepository(FakeAdapter(FakeCursor(ROWS, LIMITS)))
        repository.get_failure_concentration(FailureConcentrationQuery(), boundaries)


class FakeRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def get_failure_concentration(self, query, boundaries):
        self.calls.append((query, boundaries))
        if self.error is not None:
            raise self.error
        return self.result


def test_disabled_returns_only_not_connected(client):
    response = client.get("/api/v1/reporting/failure-concentration")
    assert response.status_code == 200
    assert response.json() == {"data_source": "not_connected"}


def test_connected_contract_period_filters_and_order(application):
    fake = FakeRepository(summarize_failure_concentration(ROWS, LIMITS))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get(
            "/api/v1/reporting/failure-concentration",
            params=[
                ("period", "yesterday"),
                ("purpose", "production"),
                ("purpose", "engineering"),
            ],
        )
    assert response.status_code == 200
    result = FailureConcentrationConnectedResponse.model_validate(response.json())
    assert result.period.key == "yesterday" and result.period.partial is False
    assert result.filters.purpose == ["production", "engineering"]
    assert [item.logical_channel for item in result.channels] == [1, 2, 3]
    assert [(item.physical_port, item.extra) for item in result.ports][-2:] == [
        (50, False),
        (50, True),
    ]
    assert result.totals.failed == 3 and result.runs == 4
    query, _ = fake.calls[0]
    assert query.period == "yesterday" and query.purposes == ("production", "engineering")


@pytest.mark.parametrize(
    "params",
    [
        {"period": "forever"},
        [("purpose", "production"), ("purpose", "production")],
        {"wavelength_mode": "SM"},
        {"unknown": "value"},
    ],
)
def test_invalid_or_unknown_query_params_are_rejected(application, params):
    fake = FakeRepository(summarize_failure_concentration([], LIMITS))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "verified"
    )
    with TestClient(application) as client:
        response = client.get("/api/v1/reporting/failure-concentration", params=params)
    assert response.status_code == 422
    assert fake.calls == []


def test_failure_is_exact_sanitized_503(application):
    fake = FakeRepository(error=ReportingError("query_timeout"))
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        fake, "encrypted_unverified"
    )
    application.dependency_overrides[get_extracted_at_utc] = lambda: EXTRACTED_AT
    with TestClient(application) as client:
        response = client.get("/api/v1/reporting/failure-concentration")
    assert response.status_code == 503
    assert response.json() == {"code": "query_timeout"}
