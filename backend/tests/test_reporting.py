"""Offline adapter/repository tests. No test opens a real database connection."""

import json
import re
from datetime import UTC, datetime
from types import SimpleNamespace

import pytest
from pydantic import SecretStr, ValidationError

from app.reporting.__main__ import main as diagnostic
from app.reporting.adapter import ReportingError, SqlServerAdapter, _connection_string, _driver
from app.reporting.config import ReportingSettings
from app.reporting.models import RunQuery
from app.reporting.repository import (
    RUN_FIELDS,
    RUN_SQL,
    SqlServerReportingRepository,
    build_run_query,
)
from app.reporting.schema import (
    COLUMN_SQL,
    COLUMNS,
    IDENTITY_SQL,
    MIGRATION_SQL,
    MIGRATIONS,
    PERMISSION_SQL,
)


@pytest.fixture(autouse=True)
def isolated_reporting_environment(monkeypatch):
    import os

    for name in os.environ:
        if name.startswith("LWA_REPORTING_"):
            monkeypatch.delenv(name)


def settings(**changes):
    return ReportingSettings(
        **(
            {
                "enabled": True,
                "target_kind": "nonproduction",
                "identity_kind": "dedicated_readonly",
                "approval_reference": "DEMO-OFFLINE-APPROVAL",
                "server": "sql.example.invalid",
                "database": "DEMO_Analytics_Integration",
                "approved_server": "sql.example.invalid",
                "approved_port": 1433,
                "approved_database": "DEMO_Analytics_Integration",
            }
            | changes
        )
    )


def query(**changes):
    return RunQuery(
        **(
            {
                "started_from": "2026-11-01T00:00:00Z",
                "started_before": "2026-11-02T00:00:00Z",
            }
            | changes
        )
    )


def demo_row(run_id=3):
    return (
        run_id,
        1,
        1,
        1,
        "DEMO-UNIT-0001",
        "DEMO-SWITCH-0001",
        "DEMO-MODEL-A",
        1,
        datetime(2026, 11, 1, 12),
        None,
        "SM",
        "complete",
        "production",
        "included",
        None,
        24,
        None,
    )


class FakeOdbcError(Exception):
    pass


class FakeDatabase:
    def __init__(self):
        self.calls = []
        self.close_order = []
        self.fetch_sizes = []
        self.identity = ("DEMO_Analytics_Integration", *([0] * 20))
        self.permissions = [(f"dbo.{name}", 1, 0, 0, 0, 0, 0) for name in COLUMNS]
        self.migrations = list(MIGRATIONS)
        self.columns = [
            (table, column, *signature)
            for table, columns in COLUMNS.items()
            for column, signature in columns.items()
        ]
        self.runs = [demo_row(3), demo_row(2), demo_row(1)]
        self.fail_at = None
        self.error = FakeOdbcError("HYT00", "DEMO-sensitive-driver-message")
        self.cleanup_errors = set()
        self.result = []
        self.timeout = None

    def connect(self, connection_string, **kwargs):
        self.connection_string = connection_string
        self.connect_kwargs = kwargs
        if self.fail_at == "connect":
            raise self.error
        return self

    def cursor(self):
        if self.fail_at == "cursor":
            raise self.error
        # Separate object proves cursor close does not replace connection close.
        return SimpleNamespace(
            execute=self.execute,
            fetchone=self.fetchone,
            fetchmany=self.fetchmany,
            close=lambda: self.close_resource("cursor"),
        )

    def execute(self, sql, params=()):
        kind = {
            IDENTITY_SQL: "identity",
            PERMISSION_SQL: "permissions",
            MIGRATION_SQL: "migrations",
            COLUMN_SQL: "columns",
        }.get(sql, "runs")
        self.calls.append((sql, params))
        if self.fail_at == kind:
            raise self.error
        self.result = [self.identity] if kind == "identity" else getattr(self, kind)
        return self

    def fetchone(self):
        return self.result[0] if self.result else None

    def fetchmany(self, count):
        assert 1 <= count <= 128
        self.fetch_sizes.append(count)
        if self.fail_at == "fetch":
            raise self.error
        return self.result[:count]

    def close_resource(self, resource):
        self.close_order.append(resource)
        if resource in self.cleanup_errors:
            raise FakeOdbcError("08003", "DEMO-sensitive-close-message")

    def close(self):
        self.close_resource("connection")


@pytest.fixture
def database():
    return FakeDatabase()


def repository(database, **changes):
    return SqlServerReportingRepository(
        SqlServerAdapter(settings(**changes), load_driver=lambda: database)
    )


def test_disabled_never_loads_driver_or_connects():
    adapter = SqlServerAdapter(
        ReportingSettings(), load_driver=lambda: pytest.fail("driver loaded")
    )
    with pytest.raises(ReportingError, match="disabled"):
        SqlServerReportingRepository(adapter).check_schema()


@pytest.mark.parametrize(
    "missing",
    [
        "target_kind",
        "identity_kind",
        "approval_reference",
        "server",
        "database",
        "approved_server",
        "approved_database",
        "approved_port",
    ],
)
def test_enabled_requires_all_approval_fields(missing):
    with pytest.raises(ValidationError):
        settings(**{missing: None})


@pytest.mark.parametrize(
    "changes",
    [
        {"target_kind": "production"},
        {"identity_kind": "writer"},
        {"approved_server": "other.example.invalid"},
        {"approved_database": "DEMO_Other"},
        {"approved_port": 1434},
        {"server": "sql;Encrypt=no"},
        {"server": "sql\\instance"},
        {"database": "DEMO;Other"},
        {"approval_reference": " "},
        {"connection_timeout_seconds": 0},
        {"connection_timeout_seconds": 16},
        {"query_timeout_seconds": 0},
        {"query_timeout_seconds": 31},
        {"encrypt": False},
        {"trust_server_certificate": True},
        {"connection_string": "DEMO"},
        {"username": SecretStr("DEMO-user")},
        {"authentication": "sql"},
    ],
)
def test_invalid_configuration_fails_closed(changes):
    with pytest.raises(ValidationError):
        settings(**changes)


def test_constructed_settings_are_revalidated_before_io():
    invalid = settings().model_copy(update={"approved_database": "DEMO_Other"})
    with pytest.raises(ValidationError):
        SqlServerAdapter(invalid, load_driver=lambda: pytest.fail("driver loaded"))


def test_secrets_targets_hidden_and_odbc_values_escaped():
    config = settings(
        authentication="sql",
        username=SecretStr("DEMO-readonly"),
        password=SecretStr("DEMO};Encrypt=no;"),
    )
    for value in [
        config.server,
        config.database,
        config.username.get_secret_value(),
        config.password.get_secret_value(),
    ]:
        assert value not in repr(config)
    connection_string = _connection_string(config)
    assert "PWD={DEMO}};Encrypt=no;}" in connection_string
    assert "Encrypt={yes};TrustServerCertificate={no};" in connection_string
    assert "Trusted_Connection" not in connection_string
    assert "UID={DEMO-readonly}" in connection_string


def test_preflight_timeouts_readonly_tls_and_cleanup(database):
    repository(database).check_schema()
    assert database.connect_kwargs == {"timeout": 5, "readonly": True, "autocommit": True}
    assert database.timeout == 10
    assert "SERVER={tcp:sql.example.invalid,1433};" in database.connection_string
    assert "Trusted_Connection={yes}" in database.connection_string
    assert "ApplicationIntent={ReadOnly}" in database.connection_string
    assert "Encrypt={yes};TrustServerCertificate={no};" in database.connection_string
    assert database.close_order == ["cursor", "connection"]
    assert len(database.calls) == 4


@pytest.mark.parametrize(
    ("phase", "state", "native", "code"),
    [
        ("connect", "HYT00", "", "connection_timeout"),
        ("runs", "HYT01", "", "query_timeout"),
        ("connect", "08001", "", "connection_unavailable"),
        ("connect", "28000", "", "authentication_failed"),
        ("runs", "42000", "(229)", "permission_denied"),
        ("runs", "42501", "", "permission_denied"),
        ("migrations", "42S02", "", "schema_incompatible"),
        ("columns", "42S22", "", "schema_incompatible"),
        ("cursor", "HYT00", "", "query_timeout"),
        ("fetch", "HYT00", "", "query_timeout"),
        ("runs", "HY000", "", "read_failed"),
    ],
)
def test_driver_failures_are_sanitized_and_resources_closed(
    database, caplog, phase, state, native, code
):
    database.fail_at = phase
    database.error = FakeOdbcError(state, "DEMO-sensitive-driver-message " + native)
    with pytest.raises(ReportingError) as error:
        repository(database).list_runs(query())
    assert error.value.code == code
    assert "DEMO-sensitive" not in str(error.value) + caplog.text
    assert "example.invalid" not in caplog.text
    expected = (
        []
        if phase == "connect"
        else ["connection"]
        if phase == "cursor"
        else ["cursor", "connection"]
    )
    assert database.close_order == expected


def test_cleanup_failure_closes_both_resources_and_preserves_primary_failure(database, caplog):
    database.cleanup_errors = {"cursor", "connection"}
    with pytest.raises(ReportingError, match="cleanup_failed"):
        repository(database).check_schema()
    assert database.close_order == ["cursor", "connection"]
    database.close_order.clear()
    database.fail_at = "runs"
    with pytest.raises(ReportingError, match="query_timeout"):
        repository(database).list_runs(query())
    assert database.close_order == ["cursor", "connection"]
    assert "DEMO-sensitive" not in caplog.text


@pytest.mark.parametrize(
    "change", ["missing", "old", "new", "checksum", "name", "column", "type", "nullable"]
)
def test_schema_incompatibilities_stop_before_run_query(database, change):
    if change == "missing":
        database.migrations = []
    elif change == "old":
        database.migrations.pop()
    elif change == "new":
        database.migrations.append((7, "DEMO_new", "0" * 64))
    elif change in {"checksum", "name"}:
        row = list(database.migrations[0])
        row[2 if change == "checksum" else 1] = "DEMO_changed"
        database.migrations[0] = tuple(row)
    elif change == "column":
        database.columns = [
            row for row in database.columns if row[:2] != ("IL_RUNS", "station_number")
        ]
    else:
        row = list(database.columns[0])
        row[2 if change == "type" else 5] = "nvarchar" if change == "type" else True
        database.columns[0] = tuple(row)
    with pytest.raises(ReportingError, match="schema_incompatible"):
        repository(database).list_runs(query())
    assert not any(sql.startswith(RUN_SQL) for sql, _ in database.calls)


@pytest.mark.parametrize(
    "change", ["database", "role", "unknown_role", "write", "select", "missing_object"]
)
def test_target_or_permission_mismatch_stops_before_records(database, change):
    if change == "database":
        database.identity = ("DEMO_Other", *database.identity[1:])
    elif change in {"role", "unknown_role"}:
        database.identity = (*database.identity[:-1], 1 if change == "role" else None)
    elif change == "missing_object":
        database.permissions.pop()
    else:
        row = list(database.permissions[0])
        row[2 if change == "write" else 1] = 1 if change == "write" else 0
        database.permissions[0] = tuple(row)
    with pytest.raises(ReportingError, match="target_mismatch|permission_denied"):
        repository(database).list_runs(query())
    assert not any(sql.startswith(RUN_SQL) for sql, _ in database.calls)


@pytest.mark.parametrize(
    "changes",
    [
        {"started_from": "2026-11-01T00:00:00"},
        {"started_before": "2026-11-01T00:00:00Z"},
        {"started_before": "2026-12-03T00:00:00Z"},
        {"limit": 0},
        {"limit": 101},
        {"limit": "1"},
        {"offset": -1},
        {"offset": 1001},
        {"run_purpose": "unknown"},
        {"wavelength_mode": "unknown"},
        {"completion_status": "pass"},
        {"analysis_status": "active"},
        {"switch_model": "x" * 31},
        {"selection": "invalid"},
    ],
)
def test_run_query_validation(changes):
    with pytest.raises(ValidationError):
        query(**changes)


def test_bound_parameters_and_reviewed_selection_are_not_kpi_semantics():
    injection = "DEMO' OR 1=1--"
    request = query(
        switch_model=injection,
        wavelength_mode="MM",
        run_purpose="engineering",
        completion_status="stopped",
        analysis_status="pending",
        selection="all",
        started_from="2026-11-01T01:00:00+01:00",
        limit=100,
        offset=1000,
    )
    sql, params = build_run_query(request)
    assert injection not in sql
    assert params == (
        datetime(2026, 11, 1),
        datetime(2026, 11, 2),
        injection,
        "MM",
        "engineering",
        "stopped",
        "pending",
        1000,
        101,
    )
    assert sql.count("?") == len(params)
    assert "r.run_started_at_utc >= ?" in sql and "r.run_started_at_utc < ?" in sql
    assert "ORDER BY r.run_started_at_utc DESC, r.run_id DESC" in sql
    normal_sql, normal_params = build_run_query(query())
    assert normal_params[2:4] == ("production", "included")
    assert "r.superseded_by_run_id IS NULL" in normal_sql
    assert "r.completion_status = ?" not in normal_sql


def test_page_has_more_empty_results_and_utc_mapping(database):
    page = repository(database).list_runs(query(limit=2))
    assert len(page.items) == 2
    assert page.has_more
    assert [row.run_id for row in page.items] == [3, 2]
    assert page.items[0].run_started_at_utc.tzinfo == UTC
    assert page.items[0].run_ended_at_utc is None
    assert "DEMO-UNIT-0001" not in repr(page)
    database.runs = []
    empty = repository(database).list_runs(query(offset=1000))
    assert empty.items == () and not empty.has_more
    assert database.calls[-1][1][-2:] == (1000, 51)


def test_unexpected_record_vocabulary_fails_safely(database, caplog):
    invalid = list(demo_row())
    invalid[11] = "DEMO-sensitive-unrecognized-status"
    database.runs = [tuple(invalid)]
    with pytest.raises(ReportingError, match="schema_incompatible"):
        repository(database).list_runs(query())
    assert "DEMO-sensitive" not in caplog.text


def test_constructed_query_revalidated_before_connect(database):
    invalid = query().model_copy(update={"limit": 1000000})
    with pytest.raises(ValidationError):
        repository(database).list_runs(invalid)
    assert not database.calls


def test_all_statements_are_read_only_and_reference_reviewed_columns(database):
    repository(database).list_runs(query())
    for sql, _ in database.calls:
        assert sql.lstrip().startswith("SELECT")
        # Static regression check only; SQL permissions enforce read-only access.
        unquoted = re.sub(r"'(?:''|[^'])*'", "''", sql)
        assert not re.search(
            r"\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|EXEC|TRUNCATE)\b", unquoted, re.I
        )
        assert not re.search(r"SELECT\s+\*|\bINTO\b", unquoted, re.I)
    aliases = {"r": "IL_RUNS", "a": "UNIT_SWITCH_ASSIGNMENTS", "u": "UNITS", "s": "SWITCHES"}
    sql, _ = build_run_query(
        query(
            switch_model="DEMO-MODEL-A",
            wavelength_mode="SM",
            completion_status="complete",
            run_purpose="production",
            analysis_status="included",
        )
    )
    for alias, column in re.findall(r"\b([raus])\.([a-z_]+)", sql):
        assert column in COLUMNS[aliases[alias]]
    projection = RUN_SQL.split("FROM")[0].replace("SELECT", "").split(",")
    assert [column.strip().split(".")[1] for column in projection] == list(RUN_FIELDS)
    assert "_json" not in RUN_SQL and "tested_by" not in RUN_SQL


def test_driver_checks_missing_installation_and_bitness_without_connect(monkeypatch):
    monkeypatch.setattr("app.reporting.adapter.struct.calcsize", lambda _: 4)
    with pytest.raises(ReportingError, match="driver_unavailable"):
        _driver()
    monkeypatch.setattr("app.reporting.adapter.struct.calcsize", lambda _: 8)
    monkeypatch.setattr(
        "app.reporting.adapter.importlib.import_module",
        lambda _: SimpleNamespace(drivers=lambda: []),
    )
    with pytest.raises(ReportingError, match="driver_unavailable"):
        _driver()


def enable_diagnostic_environment(monkeypatch):
    for name, value in settings().model_dump(exclude_none=True).items():
        monkeypatch.setenv("LWA_REPORTING_" + name.upper(), str(value))


def test_diagnostic_disabled_or_unverified_never_connects(monkeypatch, capsys):
    monkeypatch.setattr("app.reporting.__main__.SqlServerAdapter", lambda _: pytest.fail("adapter"))
    assert diagnostic(["--verify"]) == 0
    assert json.loads(capsys.readouterr().out) == {"reporting": "disabled"}
    enable_diagnostic_environment(monkeypatch)
    assert diagnostic([]) == 0
    assert json.loads(capsys.readouterr().out) == {"reporting": "configured_not_verified"}


def test_diagnostic_only_emits_status_and_counts(database, monkeypatch, capsys):
    enable_diagnostic_environment(monkeypatch)
    monkeypatch.setattr(
        "app.reporting.__main__.SqlServerAdapter",
        lambda config: SqlServerAdapter(config, load_driver=lambda: database),
    )
    assert (
        diagnostic(
            [
                "--verify",
                "--runs",
                "--started-from",
                "2026-11-01T00:00:00Z",
                "--started-before",
                "2026-11-02T00:00:00Z",
            ]
        )
        == 0
    )
    assert json.loads(capsys.readouterr().out) == {
        "reporting": "compatible",
        "returned_count": 3,
        "has_more": False,
    }
    assert diagnostic(["--verify"]) == 0
    assert json.loads(capsys.readouterr().out) == {"reporting": "compatible"}
    database.migrations = []
    assert diagnostic(["--verify"]) == 2
    assert json.loads(capsys.readouterr().out) == {
        "reporting": "incompatible",
        "code": "schema_incompatible",
    }


def test_diagnostic_configuration_errors_do_not_echo_values(monkeypatch, capsys):
    monkeypatch.setenv("LWA_REPORTING_ENABLED", "DEMO-sensitive-invalid-boolean")
    assert diagnostic(["--verify"]) == 2
    output = capsys.readouterr().out
    assert json.loads(output)["code"] == "configuration_invalid"
    assert "DEMO-sensitive" not in output


def test_reporting_configuration_does_not_wire_sensitive_http_routes(client, monkeypatch):
    # The HTTP application never reads reporting configuration, even if it is invalid.
    monkeypatch.setenv("LWA_REPORTING_ENABLED", "true")
    monkeypatch.setenv("LWA_REPORTING_SERVER", "DEMO-invalid-config")
    assert client.get("/api/v1/system/info").json()["data_source"] == "not_connected"
    assert client.get("/api/v1/demo/runs").json()["synthetic"] is True
    assert client.get("/api/v1/reporting/runs").status_code == 404
