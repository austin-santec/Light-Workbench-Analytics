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
from app.reporting.models import RunQuery, SampleState
from app.reporting.repository import (
    RUN_ACTIVITY_COUNT_SQL,
    RUN_ACTIVITY_ROW_CAP,
    RUN_ACTIVITY_TIMING_SQL,
    RUN_FIELDS,
    RUN_SQL,
    TEST_TIME_BY_CONFIGURATION_ROW_CAP,
    TEST_TIME_BY_CONFIGURATION_SQL,
    SqlServerReportingRepository,
    build_run_activity_queries,
    build_run_query,
    build_test_time_by_configuration_query,
    summarize_run_activity,
    summarize_test_time_by_configuration,
)
from app.reporting.schema import (
    COLUMN_SQL,
    COLUMNS,
    IDENTITY_SQL,
    MIGRATION_SQL,
    MIGRATIONS,
    OBJECT_TYPES,
    PERMISSION_SQL,
)


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
            # sys.objects.type is char(2): SQL Server returns 'U ' / 'V ' with padding.
            (table, OBJECT_TYPES[table].ljust(2), column, *signature)
            for table, columns in COLUMNS.items()
            for column, signature in columns.items()
        ]
        self.runs = [demo_row(3), demo_row(2), demo_row(1)]
        self.activity_counts = [
            ("production", "complete", "confirmed", 1),
            ("production", "complete", "partial", 1),
            ("production", "complete", "unavailable", 1),
        ]
        self.activity_timing = [
            (60_000, 90_000, 30_000, "confirmed"),
            (None, 120_000, None, "unavailable"),
            (30_000, 180_000, None, "partial"),
        ]
        self.configuration_timing = [
            ("OSX-150", "SM", 48, 60_000, 90_000, "confirmed"),
            ("OSX-150", "SM", 48, None, 120_000, "unavailable"),
            ("OSX-150", "SM", 36, None, None, None),
        ]
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
        }.get(sql)
        if kind is None:
            if sql.startswith(RUN_ACTIVITY_COUNT_SQL):
                kind = "activity_counts"
            elif sql.startswith(RUN_ACTIVITY_TIMING_SQL):
                kind = "activity_timing"
            elif sql.startswith(TEST_TIME_BY_CONFIGURATION_SQL):
                kind = "configuration_timing"
            else:
                kind = "runs"
        self.calls.append((sql, params))
        if self.fail_at == kind:
            raise self.error
        if kind == "identity":
            self.result = [self.identity]
        elif kind == "migrations":
            self.result = sorted(self.migrations, key=lambda row: row[0])[: len(MIGRATIONS) + 1]
        else:
            self.result = getattr(self, kind)
        return self

    def fetchone(self):
        return self.result[0] if self.result else None

    def fetchmany(self, count):
        assert 1 <= count <= RUN_ACTIVITY_ROW_CAP + 1
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
        {"trust_server_certificate": True, "target_kind": None},
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


def test_nonproduction_certificate_trust_opt_in_keeps_encryption_enabled():
    connection_string = _connection_string(settings(trust_server_certificate=True))
    assert "Encrypt={yes};TrustServerCertificate={yes};" in connection_string


def test_certificate_trust_requires_declared_nonproduction_target():
    with pytest.raises(ValidationError, match="declared non-production target"):
        ReportingSettings(trust_server_certificate=True)


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
    "change",
    ["missing", "old", "new", "gap", "checksum", "name", "column", "type", "nullable"],
)
def test_schema_incompatibilities_stop_before_run_query(database, change):
    if change == "missing":
        database.migrations = []
    elif change == "old":
        database.migrations.pop()
    elif change == "new":
        database.migrations.append((8, "DEMO_new", "0" * 64))
    elif change == "gap":
        database.migrations.pop(3)
    elif change in {"checksum", "name"}:
        row = list(database.migrations[-1])
        row[2 if change == "checksum" else 1] = "DEMO_changed"
        database.migrations[-1] = tuple(row)
    elif change == "column":
        database.columns = [
            row for row in database.columns if (row[0], row[2]) != ("IL_RUNS", "station_number")
        ]
    else:
        row = list(database.columns[0])
        row[3 if change == "type" else 6] = "nvarchar" if change == "type" else True
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


def test_run_activity_queries_are_bounded_parameterized_and_nonidentifying():
    injection = "DEMO' OR 1=1--"
    count_sql, timing_sql, params = build_run_activity_queries(
        query(
            selection="all",
            switch_model=injection,
            wavelength_mode="MM",
            run_purpose="engineering",
            started_from="2026-11-01T01:00:00+01:00",
        )
    )
    assert params == (
        datetime(2026, 11, 1),
        datetime(2026, 11, 2),
        injection,
        "MM",
        "engineering",
    )
    assert injection not in count_sql + timing_sql
    assert count_sql.count("?") == timing_sql.count("?") == len(params)
    assert "COUNT_BIG(*)" in count_sql and "t.timing_quality" in count_sql
    assert "GROUP BY" in count_sql
    assert "TOP (5001)" in timing_sql
    projection = timing_sql.split("FROM")[0]
    assert all(name in projection for name in ["active_test_ms", "elapsed_ms", "stopped_ms"])
    assert not re.search(r"\b(?:run_id|serial|operator|station)\b", projection, re.I)


def test_configuration_timing_query_is_bounded_parameterized_and_nonidentifying():
    sql, params = build_test_time_by_configuration_query(
        query(
            selection="all",
            wavelength_mode="SM",
            run_purpose="engineering",
            started_from="2026-11-01T01:00:00+01:00",
        )
    )
    assert params == (
        datetime(2026, 11, 1),
        datetime(2026, 11, 2),
        "SM",
        "engineering",
    )
    assert sql.count("?") == len(params)
    assert "TOP (5001)" in sql
    assert "r.front_panel_channel_count" in sql
    projection = sql.split("FROM")[0]
    assert all(
        name in projection
        for name in [
            "switch_model",
            "wavelength_mode",
            "front_panel_channel_count",
            "active_test_ms",
            "elapsed_ms",
            "timing_quality",
        ]
    )
    assert not re.search(r"\b(?:run_id|serial|operator|station)\b", projection, re.I)


def test_configuration_timing_groups_statistics_null_channels_and_ordering():
    rows = [
        ("OSX-150", "SM", None, None, 60_000, "unavailable"),
        ("OSX-150", "SM", 24, 30_000, 60_000, "confirmed"),
        ("OSX-150", "SM", 48, 10_000, 10_000, "confirmed"),
        ("OSX-150", "SM", 48, 20_000, 20_000, "confirmed"),
        ("OSX-150", "SM", 48, None, None, None),
        ("OSX-100", "MM", 36, None, 5_400_001, "checkpoint_estimate"),
    ]
    result = summarize_test_time_by_configuration(rows, incomplete=False)
    assert [
        (row.switch_model, row.wavelength_mode, row.front_panel_channel_count)
        for row in result.configurations
    ] == [
        ("OSX-100", "MM", 36),
        ("OSX-150", "SM", 48),
        ("OSX-150", "SM", 24),
        ("OSX-150", "SM", None),
    ]
    first = result.configurations[0]
    assert first.runs == 1 and first.open_runs == 0
    assert first.flagged_over_90_min == 1
    group = result.configurations[1]
    assert group.runs == 2 and group.open_runs == 1
    assert group.elapsed_seconds.mean == group.elapsed_seconds.median == 15
    assert group.elapsed_seconds.p90 == 20
    assert group.active_seconds.model_dump()["sample_state"] is SampleState.SMALL_SAMPLE
    assert group.confirmed_timing_runs == 2 and group.unavailable_timing_runs == 0
    assert group.seconds_per_channel == 15 / 48
    null_channels = result.configurations[-1]
    assert null_channels.front_panel_channel_count is None
    assert null_channels.seconds_per_channel is None
    assert null_channels.unavailable_timing_runs == 1


def test_configuration_timing_no_data_group_never_invents_zero_statistics():
    result = summarize_test_time_by_configuration(
        [("OSX-150", "SM", 36, None, None, None)], incomplete=False
    ).configurations[0]
    assert result.runs == 0 and result.open_runs == 1
    assert result.elapsed_seconds.n == 0
    assert result.elapsed_seconds.mean is None
    assert result.active_seconds.median is None
    assert result.seconds_per_channel is None


def test_configuration_timing_repository_caps_rows_and_marks_incomplete(database):
    database.configuration_timing = [
        ("OSX-150", "SM", 48, 1000, 2000, "confirmed")
        for _ in range(TEST_TIME_BY_CONFIGURATION_ROW_CAP + 1)
    ]
    result = repository(database).get_test_time_by_configuration(query(selection="all"))
    assert result.incomplete is True
    assert result.configurations[0].runs == TEST_TIME_BY_CONFIGURATION_ROW_CAP
    assert database.fetch_sizes[-1] == TEST_TIME_BY_CONFIGURATION_ROW_CAP + 1


def test_run_activity_math_even_odd_nearest_rank_and_quality_rules():
    count_rows = [
        ("production", "complete", None, 1),
        ("production", "complete", "confirmed", 9),
        ("engineering", "failed", "checkpoint_estimate", 1),
    ]
    timing_rows = [
        (index * 1000, index * 1000, index * 100, "confirmed") for index in range(1, 10)
    ] + [(None, 5_400_001, None, "checkpoint_estimate")]
    result = summarize_run_activity(count_rows, timing_rows, incomplete=False)
    assert result.total_runs == 11
    assert result.open_runs == 1
    assert result.by_run_purpose["production"] == 10
    assert result.by_completion_status["failed"] == 1
    assert result.by_timing_quality["confirmed"] == 9
    assert result.active_seconds.n == 9
    assert result.active_seconds.median == 5
    assert result.active_seconds.p90 == 9
    assert result.active_seconds.sample_state is SampleState.SMALL_SAMPLE
    assert result.elapsed_seconds.n == 10
    assert result.elapsed_seconds.median == 5.5
    assert result.elapsed_seconds.p90 == 9
    assert result.elapsed_seconds.sample_state is SampleState.OK
    assert result.stopped_seconds.mean == 0.5
    assert result.flagged_over_90_min == 1


def test_run_activity_no_data_uses_null_statistics():
    result = summarize_run_activity([], [], incomplete=False)
    assert result.total_runs == result.open_runs == 0
    assert result.active_seconds.model_dump() == {
        "n": 0,
        "mean": None,
        "median": None,
        "p90": None,
        "sample_state": SampleState.NO_DATA,
    }
    assert result.stopped_seconds.mean is None
    assert result.stopped_seconds.sample_state is SampleState.NO_DATA


def test_run_activity_90_minute_flag_is_strict_and_values_stay_in_sample():
    result = summarize_run_activity(
        [("production", "complete", "unavailable", 2)],
        [
            (None, 5_400_000, None, "unavailable"),
            (None, 5_400_001, None, "unavailable"),
        ],
        incomplete=False,
    )
    assert result.flagged_over_90_min == 1
    assert result.elapsed_seconds.n == 2
    assert result.elapsed_seconds.p90 == 5400.001


def test_run_activity_repository_caps_numeric_rows_and_marks_incomplete(database):
    database.activity_counts = [("production", "complete", "confirmed", RUN_ACTIVITY_ROW_CAP + 1)]
    database.activity_timing = [
        (1000, 2000, 1000, "confirmed") for _ in range(RUN_ACTIVITY_ROW_CAP + 1)
    ]
    result = repository(database).get_run_activity(query(selection="all"))
    assert result.incomplete is True
    assert result.elapsed_seconds.n == RUN_ACTIVITY_ROW_CAP
    assert database.fetch_sizes[-1] == RUN_ACTIVITY_ROW_CAP + 1


@pytest.mark.parametrize("change", ["missing_view", "missing_view_column", "wrong_object_type"])
def test_timing_view_schema_gate_fails_closed(database, change):
    if change == "missing_view":
        database.columns = [row for row in database.columns if row[0] != "vw_RunTimingSummary"]
    elif change == "missing_view_column":
        database.columns = [
            row
            for row in database.columns
            if (row[0], row[2]) != ("vw_RunTimingSummary", "elapsed_ms")
        ]
    else:
        database.columns = [
            (row[0], "U ", *row[2:]) if row[0] == "vw_RunTimingSummary" else row
            for row in database.columns
        ]
    with pytest.raises(ReportingError, match="schema_incompatible"):
        repository(database).get_run_activity(query(selection="all"))
    assert not any(sql.startswith(RUN_ACTIVITY_COUNT_SQL) for sql, _ in database.calls)


def test_timing_view_select_denial_fails_closed(database):
    view_permission = next(
        index for index, row in enumerate(database.permissions) if row[0].endswith("TimingSummary")
    )
    row = list(database.permissions[view_permission])
    row[1] = 0
    database.permissions[view_permission] = tuple(row)
    with pytest.raises(ReportingError, match="permission_denied"):
        repository(database).get_run_activity(query(selection="all"))
    assert not any(sql.startswith(RUN_ACTIVITY_COUNT_SQL) for sql, _ in database.calls)


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
    repo = repository(database)
    repo.list_runs(query())
    repo.get_test_time_by_configuration(query(selection="all"))
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
    configuration_sql, _ = build_test_time_by_configuration_query(query(selection="all"))
    for alias, column in re.findall(r"\b([ras])\.([a-z_]+)", configuration_sql):
        assert column in COLUMNS[aliases[alias]]


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
    assert json.loads(capsys.readouterr().out) == {
        "reporting": "configured_not_verified",
        "tls": "verified",
    }

    monkeypatch.setenv("LWA_REPORTING_TRUST_SERVER_CERTIFICATE", "true")
    assert diagnostic([]) == 0
    assert json.loads(capsys.readouterr().out) == {
        "reporting": "configured_not_verified",
        "tls": "encrypted_unverified",
    }


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
        "tls": "verified",
        "returned_count": 3,
        "has_more": False,
    }
    assert diagnostic(["--verify"]) == 0
    assert json.loads(capsys.readouterr().out) == {
        "reporting": "compatible",
        "tls": "verified",
    }
    database.migrations = []
    assert diagnostic(["--verify"]) == 2
    assert json.loads(capsys.readouterr().out) == {
        "reporting": "incompatible",
        "code": "schema_incompatible",
        "tls": "verified",
    }


def test_diagnostic_configuration_errors_do_not_echo_values(monkeypatch, capsys):
    monkeypatch.setenv("LWA_REPORTING_ENABLED", "DEMO-sensitive-invalid-boolean")
    assert diagnostic(["--verify"]) == 2
    output = capsys.readouterr().out
    assert json.loads(output)["code"] == "configuration_invalid"
    assert "DEMO-sensitive" not in output


def test_invalid_reporting_configuration_fails_closed_without_affecting_existing_routes(
    client, monkeypatch
):
    monkeypatch.setenv("LWA_REPORTING_ENABLED", "true")
    monkeypatch.setenv("LWA_REPORTING_SERVER", "DEMO-invalid-config")
    assert client.get("/api/v1/system/info").json()["data_source"] == "not_connected"
    assert client.get("/api/v1/demo/runs").json()["synthetic"] is True
    assert client.get(
        "/api/v1/reporting/run-activity",
        params={
            "started_from": "2026-11-01T00:00:00Z",
            "started_before": "2026-11-02T00:00:00Z",
        },
    ).json() == {"data_source": "not_connected"}
    assert client.get("/api/v1/reporting/runs").status_code == 404
