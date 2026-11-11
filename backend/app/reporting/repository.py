import math
from datetime import UTC, datetime
from typing import Protocol

from app.reporting.adapter import ReportingError, SqlServerAdapter
from app.reporting.models import (
    CompletionStatus,
    DurationStatistics,
    RunActivityMetrics,
    RunMetadata,
    RunPage,
    RunQuery,
    SampleState,
    StoppedStatistics,
    TimingQuality,
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
from app.schemas import RunPurpose

RUN_ACTIVITY_ROW_CAP = 5000

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


class ReportingRepository(Protocol):
    def check_schema(self) -> None: ...
    def list_runs(self, query: RunQuery) -> RunPage: ...
    def get_run_activity(self, query: RunQuery) -> RunActivityMetrics: ...


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
        migrations = cursor.execute(MIGRATION_SQL).fetchmany(7)
        if tuple(tuple(row) for row in migrations) != MIGRATIONS:
            raise ReportingError("schema_incompatible")
        rows = cursor.execute(COLUMN_SQL, ("dbo", "U", "V", *COLUMNS)).fetchmany(128)
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
