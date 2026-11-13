import math
from datetime import UTC, datetime
from typing import Protocol

from app.reporting.adapter import ReportingError, SqlServerAdapter
from app.reporting.channel_activity import PERIOD_KEYS, ChannelActivityBoundaries
from app.reporting.models import (
    ChannelActivityCounts,
    ChannelActivityMetrics,
    ChannelActivityQuery,
    CompletionStatus,
    ConfigurationTestTime,
    DurationStatistics,
    RunActivityMetrics,
    RunMetadata,
    RunPage,
    RunQuery,
    SampleState,
    StoppedStatistics,
    TestTimeByConfigurationMetrics,
    TimingQuality,
)
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
from app.reporting.unit_lookup import (
    get_assignment_hardware,
    get_run_channels,
    get_unit_detail,
    search_units,
)
from app.schemas import RunPurpose

RUN_ACTIVITY_ROW_CAP = 5000
TEST_TIME_BY_CONFIGURATION_ROW_CAP = 5000


def _channel_activity_sql(window_count: int) -> str:
    window_values = ", ".join("(?, ?, ?)" for _ in range(window_count))
    return f"""
WITH window_bounds(window_ordinal, start_utc, end_utc) AS (
    SELECT window_ordinal, start_utc, end_utc
    FROM (VALUES {window_values}) AS supplied(window_ordinal, start_utc, end_utc)
),
measurement_population AS (
    SELECT w.window_ordinal, m.measurement_id, m.measurement_role,
        m.logical_channel, m.physical_port, r.run_id,
        r.front_panel_channel_count, a.unit_id
    FROM window_bounds AS w
    JOIN dbo.IL_MEASUREMENTS AS m
        ON m.written_at_utc >= w.start_utc AND m.written_at_utc < w.end_utc
    JOIN dbo.IL_RUNS AS r ON r.run_id = m.run_id
    JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
    JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
    WHERE m.written_at_utc >= ? AND m.written_at_utc < ?
        AND r.analysis_status NOT IN ('excluded', 'superseded')
        AND r.superseded_by_run_id IS NULL
        AND r.run_purpose IN (?, ?, ?, ?)
        AND (? IS NULL OR r.wavelength_mode = ?)
        AND (? IS NULL OR s.switch_model = ?)
),
valid_logical AS (
    SELECT window_ordinal, measurement_id, logical_channel, run_id, unit_id
    FROM measurement_population
    WHERE measurement_role = 'logical_channel'
        AND front_panel_channel_count IS NOT NULL
        AND front_panel_channel_count > 0
        AND logical_channel >= 1
        AND logical_channel <= front_panel_channel_count
),
channel_counts AS (
    SELECT window_ordinal, COUNT_BIG(*) AS channels_tested
    FROM (
        SELECT DISTINCT window_ordinal, unit_id, logical_channel
        FROM valid_logical
    ) AS distinct_channels
    GROUP BY window_ordinal
),
attempt_counts AS (
    SELECT window_ordinal, COUNT_BIG(*) AS attempts
    FROM (
        SELECT DISTINCT window_ordinal, measurement_id
        FROM valid_logical
    ) AS distinct_attempts
    GROUP BY window_ordinal
),
unit_counts AS (
    SELECT window_ordinal, COUNT_BIG(*) AS units
    FROM (
        SELECT DISTINCT window_ordinal, unit_id
        FROM valid_logical
    ) AS distinct_units
    GROUP BY window_ordinal
),
run_counts AS (
    SELECT window_ordinal, COUNT_BIG(*) AS runs
    FROM (
        SELECT DISTINCT window_ordinal, run_id
        FROM valid_logical
    ) AS distinct_runs
    GROUP BY window_ordinal
),
extra_counts AS (
    SELECT window_ordinal, COUNT_BIG(*) AS extra_candidate_attempts
    FROM (
        SELECT DISTINCT window_ordinal, measurement_id
        FROM measurement_population
        WHERE measurement_role = 'extra_candidate'
            AND front_panel_channel_count IS NOT NULL
            AND front_panel_channel_count > 0
            AND physical_port > front_panel_channel_count
    ) AS distinct_extras
    GROUP BY window_ordinal
),
excluded_counts AS (
    SELECT window_ordinal, COUNT_BIG(*) AS excluded_unknown_boundary
    FROM (
        SELECT DISTINCT window_ordinal, measurement_id
        FROM measurement_population
        WHERE measurement_role = 'logical_channel'
            AND (
                front_panel_channel_count IS NULL
                OR front_panel_channel_count <= 0
                OR logical_channel IS NULL
                OR logical_channel < 1
                OR logical_channel > front_panel_channel_count
            )
    ) AS distinct_excluded
    GROUP BY window_ordinal
)
SELECT w.window_ordinal,
    COALESCE(c.channels_tested, 0), COALESCE(a.attempts, 0),
    COALESCE(u.units, 0), COALESCE(r.runs, 0),
    COALESCE(e.extra_candidate_attempts, 0),
    COALESCE(x.excluded_unknown_boundary, 0)
FROM window_bounds AS w
LEFT JOIN channel_counts AS c ON c.window_ordinal = w.window_ordinal
LEFT JOIN attempt_counts AS a ON a.window_ordinal = w.window_ordinal
LEFT JOIN unit_counts AS u ON u.window_ordinal = w.window_ordinal
LEFT JOIN run_counts AS r ON r.window_ordinal = w.window_ordinal
LEFT JOIN extra_counts AS e ON e.window_ordinal = w.window_ordinal
LEFT JOIN excluded_counts AS x ON x.window_ordinal = w.window_ordinal
ORDER BY w.window_ordinal
"""


CHANNEL_ACTIVITY_PERIOD_SQL = _channel_activity_sql(len(PERIOD_KEYS))
CHANNEL_ACTIVITY_DAILY_SQL = _channel_activity_sql(31)

RUN_FIELDS = (
    "run_id",
    "assignment_id",
    "unit_id",
    "switch_id",
    "main_board_serial",
    "switch_serial",
    "switch_model",
    "run_number",
    "run_started_at_utc",
    "run_ended_at_utc",
    "wavelength_mode",
    "completion_status",
    "run_purpose",
    "analysis_status",
    "superseded_by_run_id",
    "front_panel_channel_count",
    "station_number",
)

RUN_SQL = """
SELECT r.run_id, r.assignment_id, a.unit_id, a.switch_id,
    u.main_board_serial, s.switch_serial, s.switch_model, r.run_number,
    r.run_started_at_utc, r.run_ended_at_utc, r.wavelength_mode,
    r.completion_status, r.run_purpose, r.analysis_status, r.superseded_by_run_id,
    r.front_panel_channel_count, r.station_number
FROM dbo.IL_RUNS AS r
JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
JOIN dbo.UNITS AS u ON u.unit_id = a.unit_id
JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
"""

RUN_ACTIVITY_COUNT_SQL = """
SELECT r.run_purpose, r.completion_status,
    CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE t.timing_quality END,
    COUNT_BIG(*)
FROM dbo.IL_RUNS AS r
JOIN dbo.vw_RunTimingSummary AS t ON t.run_id = r.run_id
JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
"""

RUN_ACTIVITY_TIMING_SQL = """
SELECT TOP (5001) t.active_test_ms, t.elapsed_ms, t.stopped_ms, t.timing_quality
FROM dbo.IL_RUNS AS r
JOIN dbo.vw_RunTimingSummary AS t ON t.run_id = r.run_id
JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
"""

TEST_TIME_BY_CONFIGURATION_SQL = """
SELECT TOP (5001) s.switch_model, r.wavelength_mode, r.front_panel_channel_count,
    t.active_test_ms, t.elapsed_ms,
    CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE t.timing_quality END
FROM dbo.IL_RUNS AS r
JOIN dbo.vw_RunTimingSummary AS t ON t.run_id = r.run_id
JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
"""


def build_run_query(query: RunQuery) -> tuple[str, tuple]:
    where = ["r.run_started_at_utc >= ?", "r.run_started_at_utc < ?"]
    # SQL DATETIME2 is naive but stores UTC. Do not send local-time datetimes.
    params = [query.started_from.replace(tzinfo=None), query.started_before.replace(tzinfo=None)]
    if query.selection == "normal_report":
        where.extend(
            ["r.run_purpose = ?", "r.analysis_status = ?", "r.superseded_by_run_id IS NULL"]
        )
        params.extend(["production", "included"])
    for column, value in (
        ("s.switch_model", query.switch_model),
        ("r.wavelength_mode", query.wavelength_mode),
        ("r.run_purpose", query.run_purpose),
        ("r.completion_status", query.completion_status),
        ("r.analysis_status", query.analysis_status),
    ):
        if value is not None:
            where.append(f"{column} = ?")
            params.append(str(value))
    sql = (
        RUN_SQL
        + " WHERE "
        + " AND ".join(where)
        + """
ORDER BY r.run_started_at_utc DESC, r.run_id DESC
OFFSET ? ROWS FETCH NEXT ? ROWS ONLY
"""
    )
    return sql, (*params, query.offset, query.limit + 1)


def build_run_activity_queries(query: RunQuery) -> tuple[str, str, tuple]:
    where = ["r.run_started_at_utc >= ?", "r.run_started_at_utc < ?"]
    params = [query.started_from.replace(tzinfo=None), query.started_before.replace(tzinfo=None)]
    for column, value in (
        ("s.switch_model", query.switch_model),
        ("r.wavelength_mode", query.wavelength_mode),
        ("r.run_purpose", query.run_purpose),
    ):
        if value is not None:
            where.append(f"{column} = ?")
            params.append(str(value))
    where_sql = " WHERE " + " AND ".join(where)
    count_sql = (
        RUN_ACTIVITY_COUNT_SQL
        + where_sql
        + " GROUP BY r.run_purpose, r.completion_status,"
        + " CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE t.timing_quality END"
    )
    timing_sql = (
        RUN_ACTIVITY_TIMING_SQL
        + where_sql
        + " AND r.run_ended_at_utc IS NOT NULL"
        + " ORDER BY r.run_started_at_utc, r.run_id"
    )
    return count_sql, timing_sql, tuple(params)


def build_test_time_by_configuration_query(query: RunQuery) -> tuple[str, tuple]:
    where = ["r.run_started_at_utc >= ?", "r.run_started_at_utc < ?"]
    params = [query.started_from.replace(tzinfo=None), query.started_before.replace(tzinfo=None)]
    for column, value in (
        ("r.wavelength_mode", query.wavelength_mode),
        ("r.run_purpose", query.run_purpose),
    ):
        if value is not None:
            where.append(f"{column} = ?")
            params.append(str(value))
    sql = (
        TEST_TIME_BY_CONFIGURATION_SQL
        + " WHERE "
        + " AND ".join(where)
        + " ORDER BY r.run_started_at_utc, r.run_id"
    )
    return sql, tuple(params)


def _window_parameters(windows: tuple) -> tuple:
    return tuple(
        value
        for ordinal, window in enumerate(windows)
        for value in (
            ordinal,
            window.start_utc.replace(tzinfo=None),
            window.end_utc.replace(tzinfo=None),
        )
    )


def build_channel_activity_queries(
    query: ChannelActivityQuery, boundaries: ChannelActivityBoundaries
) -> tuple[tuple[str, tuple], tuple[str, tuple]]:
    query = ChannelActivityQuery.model_validate(query.model_dump())
    period_windows = tuple(boundaries.periods[key] for key in PERIOD_KEYS)
    purposes = tuple(str(purpose) for purpose in query.purposes)
    padded_purposes = purposes + (purposes[-1],) * (len(RunPurpose) - len(purposes))
    filters = (
        boundaries.periods["last_30_days"].start_utc.replace(tzinfo=None),
        boundaries.extracted_at_utc.replace(tzinfo=None),
        *padded_purposes,
        query.wavelength_mode,
        query.wavelength_mode,
        query.switch_model,
        query.switch_model,
    )
    period_params = (*_window_parameters(period_windows), *filters)
    daily_params = (*_window_parameters(boundaries.daily), *filters)
    return (
        (CHANNEL_ACTIVITY_PERIOD_SQL, period_params),
        (CHANNEL_ACTIVITY_DAILY_SQL, daily_params),
    )


def _channel_activity_counts(rows: list[tuple], expected: int) -> tuple[ChannelActivityCounts, ...]:
    if len(rows) != expected:
        raise ReportingError("schema_incompatible")
    results = []
    for ordinal, row in enumerate(rows):
        if len(row) != 7 or row[0] != ordinal:
            raise ReportingError("schema_incompatible")
        values = row[1:]
        if any(type(value) is not int or value < 0 for value in values):
            raise ReportingError("schema_incompatible")
        results.append(
            ChannelActivityCounts(
                channels_tested=values[0],
                attempts=values[1],
                units=values[2],
                runs=values[3],
                extra_candidate_attempts=values[4],
                excluded_unknown_boundary=values[5],
            )
        )
    return tuple(results)


def summarize_channel_activity(
    period_rows: list[tuple], daily_rows: list[tuple]
) -> ChannelActivityMetrics:
    period_counts = _channel_activity_counts(period_rows, len(PERIOD_KEYS))
    daily_counts = _channel_activity_counts(daily_rows, 31)
    return ChannelActivityMetrics(
        periods=dict(zip(PERIOD_KEYS, period_counts, strict=True)),
        daily=daily_counts,
        incomplete=False,
    )


def _sample_state(n: int) -> SampleState:
    if n == 0:
        return SampleState.NO_DATA
    if n < 10:
        return SampleState.SMALL_SAMPLE
    return SampleState.OK


def _duration_statistics(values_ms: list[int]) -> DurationStatistics:
    ordered = sorted(values_ms)
    n = len(ordered)
    state = _sample_state(n)
    if not ordered:
        return DurationStatistics(n=0, mean=None, median=None, p90=None, sample_state=state)
    middle = n // 2
    median_ms = ordered[middle] if n % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    return DurationStatistics(
        n=n,
        mean=sum(ordered) / n / 1000,
        median=median_ms / 1000,
        p90=ordered[math.ceil(0.9 * n) - 1] / 1000,
        sample_state=state,
    )


def _stopped_statistics(values_ms: list[int]) -> StoppedStatistics:
    n = len(values_ms)
    return StoppedStatistics(
        n=n,
        mean=None if n == 0 else sum(values_ms) / n / 1000,
        sample_state=_sample_state(n),
    )


def summarize_run_activity(
    count_rows: list[tuple], timing_rows: list[tuple], *, incomplete: bool
) -> RunActivityMetrics:
    by_purpose = dict.fromkeys(RunPurpose, 0)
    by_completion = dict.fromkeys(CompletionStatus, 0)
    by_quality = dict.fromkeys(TimingQuality, 0)
    total_runs = open_runs = 0
    for row in count_rows:
        if len(row) != 4:
            raise ReportingError("schema_incompatible")
        try:
            purpose = RunPurpose(row[0])
            completion = CompletionStatus(row[1])
        except (TypeError, ValueError):
            raise ReportingError("schema_incompatible") from None
        raw_quality, count = row[2:]
        if type(count) is not int or count < 0:
            raise ReportingError("schema_incompatible")
        if raw_quality is None:
            open_runs += count
        else:
            try:
                quality = TimingQuality(raw_quality)
            except (TypeError, ValueError):
                raise ReportingError("schema_incompatible") from None
            by_quality[quality] += count
        by_purpose[purpose] += count
        by_completion[completion] += count
        total_runs += count

    sample_by_quality = dict.fromkeys(TimingQuality, 0)
    active_ms: list[int] = []
    elapsed_ms: list[int] = []
    stopped_ms: list[int] = []
    flagged = 0
    for row in timing_rows:
        if len(row) != 4:
            raise ReportingError("schema_incompatible")
        active, elapsed, stopped, raw_quality = row
        try:
            quality = TimingQuality(raw_quality)
        except (TypeError, ValueError):
            raise ReportingError("schema_incompatible") from None
        if type(elapsed) is not int or elapsed < 0:
            raise ReportingError("schema_incompatible")
        if quality is TimingQuality.CONFIRMED:
            if type(active) is not int or active < 0 or type(stopped) is not int or stopped < 0:
                raise ReportingError("schema_incompatible")
            active_ms.append(active)
            stopped_ms.append(stopped)
        elif active is not None and (type(active) is not int or active < 0):
            raise ReportingError("schema_incompatible")
        elif stopped is not None and (type(stopped) is not int or stopped < 0):
            raise ReportingError("schema_incompatible")
        sample_by_quality[quality] += 1
        elapsed_ms.append(elapsed)
        flagged += elapsed > 5_400_000

    if not incomplete and (
        sample_by_quality != by_quality or sum(by_quality.values()) + open_runs != total_runs
    ):
        raise ReportingError("schema_incompatible")
    return RunActivityMetrics(
        total_runs=total_runs,
        by_run_purpose=by_purpose,
        by_completion_status=by_completion,
        open_runs=open_runs,
        by_timing_quality=by_quality,
        active_seconds=_duration_statistics(active_ms),
        elapsed_seconds=_duration_statistics(elapsed_ms),
        stopped_seconds=_stopped_statistics(stopped_ms),
        flagged_over_90_min=flagged,
        incomplete=incomplete,
    )


def summarize_test_time_by_configuration(
    rows: list[tuple], *, incomplete: bool
) -> TestTimeByConfigurationMetrics:
    groups: dict[tuple[str, str, int | None], dict[str, object]] = {}
    for row in rows:
        if len(row) != 6:
            raise ReportingError("schema_incompatible")
        switch_model, wavelength_mode, channel_count, active, elapsed, raw_quality = row
        if not isinstance(switch_model, str) or not 1 <= len(switch_model) <= 30:
            raise ReportingError("schema_incompatible")
        if wavelength_mode not in {"SM", "MM"}:
            raise ReportingError("schema_incompatible")
        if channel_count is not None and (type(channel_count) is not int or channel_count <= 0):
            raise ReportingError("schema_incompatible")
        if active is not None and (type(active) is not int or active < 0):
            raise ReportingError("schema_incompatible")
        if elapsed is not None and (type(elapsed) is not int or elapsed < 0):
            raise ReportingError("schema_incompatible")

        key = (switch_model, wavelength_mode, channel_count)
        group = groups.setdefault(
            key,
            {
                "open_runs": 0,
                "elapsed_ms": [],
                "active_ms": [],
                "confirmed": 0,
                "unavailable": 0,
                "flagged": 0,
            },
        )
        if raw_quality is None:
            group["open_runs"] += 1
            continue
        try:
            quality = TimingQuality(raw_quality)
        except (TypeError, ValueError):
            raise ReportingError("schema_incompatible") from None
        if type(elapsed) is not int:
            raise ReportingError("schema_incompatible")
        group["elapsed_ms"].append(elapsed)
        group["flagged"] += elapsed > 5_400_000
        if quality is TimingQuality.CONFIRMED:
            if type(active) is not int:
                raise ReportingError("schema_incompatible")
            group["active_ms"].append(active)
            group["confirmed"] += 1
        elif quality is TimingQuality.UNAVAILABLE:
            group["unavailable"] += 1

    configurations = []
    ordered_keys = sorted(
        groups,
        key=lambda key: (key[0], key[1], key[2] is None, -(key[2] or 0)),
    )
    for switch_model, wavelength_mode, channel_count in ordered_keys:
        group = groups[(switch_model, wavelength_mode, channel_count)]
        elapsed_seconds = _duration_statistics(group["elapsed_ms"])
        configurations.append(
            ConfigurationTestTime(
                switch_model=switch_model,
                wavelength_mode=wavelength_mode,
                front_panel_channel_count=channel_count,
                runs=elapsed_seconds.n,
                open_runs=group["open_runs"],
                elapsed_seconds=elapsed_seconds,
                active_seconds=_duration_statistics(group["active_ms"]),
                confirmed_timing_runs=group["confirmed"],
                unavailable_timing_runs=group["unavailable"],
                seconds_per_channel=(
                    None
                    if channel_count is None or elapsed_seconds.median is None
                    else elapsed_seconds.median / channel_count
                ),
                flagged_over_90_min=group["flagged"],
            )
        )
    return TestTimeByConfigurationMetrics(
        configurations=tuple(configurations), incomplete=incomplete
    )


class ReportingRepository(Protocol):
    def check_schema(self) -> None: ...
    def list_runs(self, query: RunQuery) -> RunPage: ...
    def get_run_activity(self, query: RunQuery) -> RunActivityMetrics: ...
    def get_test_time_by_configuration(self, query: RunQuery) -> TestTimeByConfigurationMetrics: ...
    def get_channel_activity(
        self, query: ChannelActivityQuery, boundaries: ChannelActivityBoundaries
    ) -> ChannelActivityMetrics: ...
    def search_units(self, text: str) -> dict: ...
    def get_unit_detail(self, unit_id: int) -> dict | None: ...
    def get_run_channels(self, run_id: int) -> dict | None: ...
    def get_assignment_hardware(self, assignment_id: int) -> dict | None: ...


class SqlServerReportingRepository:
    def __init__(self, adapter: SqlServerAdapter):
        self._adapter = adapter

    def _preflight(self, cursor) -> None:
        identity = cursor.execute(IDENTITY_SQL).fetchone()
        if identity is None or identity[0] != self._adapter.settings.approved_database:
            raise ReportingError("target_mismatch")
        if len(identity) != 21 or any(flag != 0 for flag in identity[1:]):
            raise ReportingError("permission_denied")
        objects = tuple(f"dbo.{name}" for name in COLUMNS)
        permissions = cursor.execute(PERMISSION_SQL, objects).fetchmany(len(objects) + 1)
        if {row[0] for row in permissions} != set(objects) or any(
            len(row) != 7 or row[1] != 1 or any(flag != 0 for flag in row[2:])
            for row in permissions
        ):
            raise ReportingError("permission_denied")
        migrations = cursor.execute(MIGRATION_SQL).fetchmany(len(MIGRATIONS) + 1)
        if tuple(tuple(row) for row in migrations) != MIGRATIONS:
            raise ReportingError("schema_incompatible")
        rows = cursor.execute(COLUMN_SQL, ("dbo", "U", "V", *COLUMNS)).fetchmany(CATALOG_ROW_CAP)
        if len(rows) >= CATALOG_ROW_CAP:
            raise ReportingError("schema_incompatible")
        # sys.objects.type is char(2), so drivers return 'U ' / 'V '; compare trimmed.
        actual = {(row[0], row[2]): (str(row[1]).rstrip(), *row[3:]) for row in rows}
        if any(
            actual.get((table, column)) != (OBJECT_TYPES[table], *signature)
            for table, columns in COLUMNS.items()
            for column, signature in columns.items()
        ):
            raise ReportingError("schema_incompatible")

    def check_schema(self) -> None:
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)

    def list_runs(self, query: RunQuery) -> RunPage:
        # Revalidate even an in-process caller's constructed/copied model before I/O.
        query = RunQuery.model_validate(query.model_dump())
        sql, params = build_run_query(query)
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)  # Same short-lived connection; never cache readiness.
            rows = cursor.execute(sql, params).fetchmany(query.limit + 1)
            items = []
            for row in rows[: query.limit]:
                if len(row) != len(RUN_FIELDS):
                    raise ReportingError("schema_incompatible")
                values = dict(zip(RUN_FIELDS, row, strict=True))
                for field in ("run_started_at_utc", "run_ended_at_utc"):
                    value = values[field]
                    if value is not None:
                        if not isinstance(value, datetime):
                            raise ReportingError("schema_incompatible")
                        values[field] = (
                            value.replace(tzinfo=UTC)
                            if value.tzinfo is None
                            else value.astimezone(UTC)
                        )
                try:
                    items.append(RunMetadata.model_validate(values))
                except ValueError:
                    raise ReportingError("schema_incompatible") from None
            return RunPage(
                items=tuple(items),
                limit=query.limit,
                offset=query.offset,
                has_more=len(rows) > query.limit,
            )

    def get_run_activity(self, query: RunQuery) -> RunActivityMetrics:
        query = RunQuery.model_validate(query.model_dump())
        count_sql, timing_sql, params = build_run_activity_queries(query)
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            count_rows = cursor.execute(count_sql, params).fetchmany(97)
            timing_rows = cursor.execute(timing_sql, params).fetchmany(RUN_ACTIVITY_ROW_CAP + 1)
            incomplete = len(timing_rows) > RUN_ACTIVITY_ROW_CAP
            return summarize_run_activity(
                count_rows,
                timing_rows[:RUN_ACTIVITY_ROW_CAP],
                incomplete=incomplete,
            )

    def get_test_time_by_configuration(self, query: RunQuery) -> TestTimeByConfigurationMetrics:
        query = RunQuery.model_validate(query.model_dump())
        sql, params = build_test_time_by_configuration_query(query)
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            rows = cursor.execute(sql, params).fetchmany(TEST_TIME_BY_CONFIGURATION_ROW_CAP + 1)
            incomplete = len(rows) > TEST_TIME_BY_CONFIGURATION_ROW_CAP
            return summarize_test_time_by_configuration(
                rows[:TEST_TIME_BY_CONFIGURATION_ROW_CAP], incomplete=incomplete
            )

    def get_channel_activity(
        self, query: ChannelActivityQuery, boundaries: ChannelActivityBoundaries
    ) -> ChannelActivityMetrics:
        query = ChannelActivityQuery.model_validate(query.model_dump())
        period_query, daily_query = build_channel_activity_queries(query, boundaries)
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            period_rows = cursor.execute(*period_query).fetchmany(len(PERIOD_KEYS) + 1)
            daily_rows = cursor.execute(*daily_query).fetchmany(32)
            return summarize_channel_activity(period_rows, daily_rows)

    def search_units(self, text: str) -> dict:
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            return search_units(cursor, text)

    def get_unit_detail(self, unit_id: int) -> dict | None:
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            return get_unit_detail(cursor, unit_id)

    def get_run_channels(self, run_id: int) -> dict | None:
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            return get_run_channels(cursor, run_id)

    def get_assignment_hardware(self, assignment_id: int) -> dict | None:
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            return get_assignment_hardware(cursor, assignment_id)
