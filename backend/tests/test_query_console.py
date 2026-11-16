import logging
from contextlib import contextmanager
from datetime import date, datetime, time
from decimal import Decimal
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from app.api import ReportingAccess, get_reporting_access
from app.reporting.adapter import ReportingError
from app.reporting.config import ReportingSettings
from app.reporting.console_guard import StatementRejected, validate_console_statement
from app.reporting.repository import ConsoleQueryError, SqlServerReportingRepository
from app.reporting.schema import (
    CATALOG_ROW_CAP,
    COLUMN_SQL,
    COLUMNS,
    IDENTITY_SQL,
    MIGRATION_SQL,
    MIGRATIONS,
    OBJECT_TYPES,
    PERMISSION_SQL,
)


def settings(**changes):
    values = {
        "enabled": True,
        "target_kind": "nonproduction",
        "identity_kind": "dedicated_readonly",
        "approval_reference": "DEMO-QUERY-CONSOLE",
        "server": "demo-server.example.invalid",
        "database": "DEMO_Query_Console",
        "approved_server": "demo-server.example.invalid",
        "approved_port": 1433,
        "approved_database": "DEMO_Query_Console",
        "authentication": "sql",
        "username": SecretStr("DEMO_console_login"),
        "password": SecretStr("DEMO_password"),
    }
    return ReportingSettings(**(values | changes))


class FakeSqlError(Exception):
    pass


class ConsoleCursor:
    def __init__(self, config, *, rows=(), description=(), error=None, next_result=False):
        self.settings = config
        self.rows = list(rows)
        self.user_description = description
        self.description = None
        self.error = error
        self.next_result = next_result
        self.calls = []
        self.result = []
        self.fetch_sizes = []

    def execute(self, sql, params=None):
        self.calls.append((sql, params))
        if sql == IDENTITY_SQL:
            self.result = [(self.settings.approved_database, *([0] * 20))]
        elif sql == PERMISSION_SQL:
            self.result = [(f"dbo.{name}", 1, 0, 0, 0, 0, 0) for name in COLUMNS]
        elif sql == MIGRATION_SQL:
            self.result = list(MIGRATIONS)
        elif sql == COLUMN_SQL:
            self.result = [
                (table, OBJECT_TYPES[table].ljust(2), column, *signature)
                for table, columns in COLUMNS.items()
                for column, signature in columns.items()
            ]
        elif sql.startswith("SET "):
            self.result = []
            self.description = None
        else:
            if self.error is not None:
                raise self.error
            self.result = self.rows
            self.description = self.user_description
        return self

    def fetchone(self):
        return self.result[0] if self.result else None

    def fetchmany(self, size):
        assert size <= max(CATALOG_ROW_CAP, self.settings.console_row_cap + 1)
        self.fetch_sizes.append(size)
        return self.result[:size]

    def nextset(self):
        self.nextset_calls = getattr(self, "nextset_calls", 0) + 1
        return self.next_result

    def cancel(self):
        self.cancelled = True


class FakeAdapter:
    def __init__(self, cursor, config):
        self.fake_cursor = cursor
        self.settings = config
        self.timeout_used = None
        self.cursor_count = 0

    @contextmanager
    def cursor(self, *, query_timeout_seconds=None):
        self.cursor_count += 1
        self.timeout_used = query_timeout_seconds
        yield self.fake_cursor


def repository(*, rows=(), description=(), error=None, next_result=False, **changes):
    config = settings(**changes)
    cursor = ConsoleCursor(
        config,
        rows=rows,
        description=description,
        error=error,
        next_result=next_result,
    )
    adapter = FakeAdapter(cursor, config)
    return SqlServerReportingRepository(adapter), adapter, cursor


@pytest.mark.parametrize(
    "sql",
    [
        "SELECT 1",
        "select 'UPDATE; ?' AS text;",
        'SELECT [DROP], "EXEC" FROM dbo.IL_RUNS',
        "/* UPDATE /* DELETE */ */ SELECT 1 -- EXEC\n",
        "WITH recent AS (SELECT run_id FROM dbo.IL_RUNS) SELECT run_id FROM recent",
        "SELECT 1 FOR JSON PATH",
        "SELECT run_id FROM dbo.IL_RUNS OPTION (RECOMPILE)",
        "SELECT N'INSERT' AS example",
    ],
)
def test_console_guard_allows_one_read_only_statement(sql):
    assert validate_console_statement(sql) == sql.strip()


@pytest.mark.parametrize(
    ("sql", "reason"),
    [
        (" -- only a comment", "empty"),
        ("UPDATE dbo.IL_RUNS SET run_number = 1", "not_select"),
        ("SELECT * INTO #copy FROM dbo.IL_RUNS", "forbidden_keyword:INTO"),
        ("SeLeCt 1; dElEtE FROM dbo.IL_RUNS", "multiple_statements"),
        ("SELECT 1\nGO\nSELECT 2", "multiple_statements"),
        ("SELECT ?", "parameters_unsupported"),
        ("SELECT * FROM master.dbo.sys.objects", "forbidden_keyword:FOUR_PART_NAME"),
        ("SELECT * FROM [remote].[db].[dbo].[IL_RUNS]", "forbidden_keyword:FOUR_PART_NAME"),
        ("SELECT * FROM remote...IL_RUNS", "forbidden_keyword:FOUR_PART_NAME"),
        ("SELECT * FROM xp_demo", "forbidden_keyword:XP_"),
        ("SELECT * FROM dbo.IL_RUNS; SELECT 2", "multiple_statements"),
    ],
)
def test_console_guard_rejects_unsafe_shapes(sql, reason):
    with pytest.raises(StatementRejected) as captured:
        validate_console_statement(sql)
    assert captured.value.reason == reason


def test_console_success_serializes_all_value_types_and_orders_preflight_and_settings():
    marker = object()
    values = (
        7,
        Decimal("12.3400"),
        float("inf"),
        "x" * 4001,
        True,
        datetime(2026, 11, 16, 8, 9, 10, 123000),
        date(2026, 11, 16),
        time(8, 9, 10),
        bytes(range(65)),
        UUID("12345678-1234-5678-1234-567812345678"),
        marker,
    )
    types = (int, Decimal, float, str, bool, datetime, date, time, bytes, UUID, object)
    repo, adapter, cursor = repository(
        rows=[values],
        description=tuple((f"column_{index}", kind) for index, kind in enumerate(types)),
        next_result=True,
    )
    result = repo.execute_console_query("SELECT DEMO values")
    assert [column.type for column in result.columns] == [
        "integer",
        "decimal",
        "float",
        "string",
        "boolean",
        "datetime",
        "date",
        "time",
        "binary",
        "other",
        "other",
    ]
    row = result.rows[0]
    assert row[:3] == (7, "12.3400", None)
    assert len(row[3]) == 4000 and row[4] is True
    assert row[5:8] == ("2026-11-16T08:09:10.123Z", "2026-11-16", "08:09:10")
    assert row[8].startswith("0x000102") and row[8].endswith("…")
    assert row[9] == "12345678-1234-5678-1234-567812345678"
    assert result.row_count == 1 and result.multiple_result_sets is True
    assert adapter.cursor_count == 1 and adapter.timeout_used == 30
    sql_calls = [sql for sql, _params in cursor.calls]
    user_index = sql_calls.index("SELECT DEMO values")
    assert sql_calls[:4] == [IDENTITY_SQL, PERMISSION_SQL, MIGRATION_SQL, COLUMN_SQL]
    assert sql_calls[user_index - 2 : user_index] == [
        "SET LOCK_TIMEOUT 5000;",
        "SET TRANSACTION ISOLATION LEVEL READ COMMITTED;",
    ]
    assert cursor.calls[user_index][1] is None


def test_console_truncates_at_configured_cap():
    repo, _adapter, cursor = repository(
        rows=[(1,), (2,), (3,)], description=(("value", int),), console_row_cap=2
    )
    result = repo.execute_console_query("SELECT value FROM dbo.IL_RUNS")
    assert result.rows == ((1,), (2,))
    assert result.truncated is True
    assert cursor.fetch_sizes[-1] == 3
    # A capped result is cancelled rather than drained through nextset().
    assert getattr(cursor, "cancelled", False) is True
    assert getattr(cursor, "nextset_calls", 0) == 0


def test_console_no_result_set_is_rejected():
    repo, _adapter, _cursor = repository(description=None)
    with pytest.raises(StatementRejected, match="not_select"):
        repo.execute_console_query("SELECT 1")


def test_console_sql_error_is_redacted_and_neither_sql_nor_message_is_logged(caplog):
    secret_message = (
        "[Microsoft][ODBC Driver 18 for SQL Server][SQL Server]Invalid object on "
        "DEMO-SERVER.example.invalid in DEMO_Query_Console for DEMO_console_login (208)"
    )
    error = FakeSqlError("42S02", secret_message)
    repo, _adapter, _cursor = repository(error=error)
    sql = "SELECT DEMO_PRIVATE_SQL FROM dbo.Missing"
    with caplog.at_level(logging.WARNING, logger="lwa.reporting"):
        with pytest.raises(ConsoleQueryError) as captured:
            repo.execute_console_query(sql)
    assert captured.value.sql_error_number == 208
    assert captured.value.message.startswith("Invalid object on <server>")
    assert "<database>" in captured.value.message and "<login>" in captured.value.message
    assert "[Microsoft]" not in captured.value.message
    assert sql not in caplog.text
    assert secret_message not in caplog.text
    assert "query_failed" in caplog.text and "208" in caplog.text


def test_console_timeout_is_sanitized_and_does_not_log_sql_or_message(caplog):
    error = FakeSqlError("HYT00", "DEMO_PRIVATE_TIMEOUT_MESSAGE")
    repo, _adapter, _cursor = repository(error=error)
    sql = "SELECT DEMO_PRIVATE_TIMEOUT_SQL"
    with caplog.at_level(logging.WARNING, logger="lwa.reporting"):
        with pytest.raises(ReportingError, match="query_timeout"):
            repo.execute_console_query(sql)
    assert sql not in caplog.text and "DEMO_PRIVATE_TIMEOUT_MESSAGE" not in caplog.text


def test_console_settings_are_bounded():
    for changes in (
        {"console_timeout_seconds": 0},
        {"console_timeout_seconds": 61},
        {"console_row_cap": 0},
        {"console_row_cap": 20_001},
    ):
        with pytest.raises(ValidationError):
            settings(**changes)


class ApiRepository:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def execute_console_query(self, sql):
        self.calls.append(sql)
        if self.error is not None:
            raise self.error
        return self.result


def test_query_endpoints_not_connected_and_request_validation(client):
    assert client.get("/api/v1/query/schema").json() == {"data_source": "not_connected"}
    assert client.post("/api/v1/query/execute", json={"sql": "SELECT 1"}).json() == {
        "data_source": "not_connected"
    }
    for body in ({"sql": "   "}, {"sql": "x" * 20_001}, {"sql": "SELECT 1", "extra": 1}):
        response = client.post("/api/v1/query/execute", json=body)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "validation_error"
        assert "SELECT 1" not in response.text


def test_query_schema_is_the_reviewed_contract_without_repository_io(application):
    fake = ApiRepository()
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        repository=fake, tls="verified"
    )
    with TestClient(application) as client:
        response = client.get("/api/v1/query/schema")
    assert response.status_code == 200
    body = response.json()
    assert body["source"] == "reviewed_grant_contract"
    assert len(body["objects"]) == 14
    assert body["objects"][0] == {
        "name": "SCHEMA_MIGRATIONS",
        "kind": "table",
        "columns": list(COLUMNS["SCHEMA_MIGRATIONS"]),
    }
    assert fake.calls == []


@pytest.mark.parametrize(
    ("error", "status", "body"),
    [
        (
            StatementRejected("forbidden_keyword:UPDATE"),
            400,
            {"code": "statement_rejected", "reason": "forbidden_keyword:UPDATE"},
        ),
        (
            ConsoleQueryError(208, "Invalid object <database>.dbo.Missing"),
            422,
            {
                "code": "query_failed",
                "sql_error_number": 208,
                "message": "Invalid object <database>.dbo.Missing",
            },
        ),
        (ReportingError("query_timeout"), 503, {"code": "query_timeout"}),
    ],
)
def test_query_execute_error_contracts(application, error, status, body):
    fake = ApiRepository(error=error)
    application.dependency_overrides[get_reporting_access] = lambda: ReportingAccess(
        repository=fake, tls="encrypted_unverified"
    )
    with TestClient(application) as client:
        response = client.post("/api/v1/query/execute", json={"sql": "SELECT DEMO"})
    assert response.status_code == status
    assert response.json() == body
