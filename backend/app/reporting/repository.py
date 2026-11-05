from datetime import UTC, datetime
from typing import Protocol

from app.reporting.adapter import ReportingError, SqlServerAdapter
from app.reporting.models import RunMetadata, RunPage, RunQuery
from app.reporting.schema import (
    COLUMN_SQL,
    COLUMNS,
    IDENTITY_SQL,
    MIGRATION_SQL,
    MIGRATIONS,
    PERMISSION_SQL,
)

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


class ReportingRepository(Protocol):
    def check_schema(self) -> None: ...
    def list_runs(self, query: RunQuery) -> RunPage: ...


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
        permissions = cursor.execute(PERMISSION_SQL, objects).fetchmany(6)
        if {row[0] for row in permissions} != set(objects) or any(
            len(row) != 7 or row[1] != 1 or any(flag != 0 for flag in row[2:])
            for row in permissions
        ):
            raise ReportingError("permission_denied")
        migrations = cursor.execute(MIGRATION_SQL).fetchmany(7)
        if tuple(tuple(row) for row in migrations) != MIGRATIONS:
            raise ReportingError("schema_incompatible")
        rows = cursor.execute(COLUMN_SQL, ("dbo", "U", *COLUMNS)).fetchmany(128)
        actual = {(row[0], row[1]): tuple(row[2:]) for row in rows}
        if any(
            actual.get((table, column)) != signature
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
