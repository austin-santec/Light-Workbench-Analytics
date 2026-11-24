"""Bounded detail rows for the Overview's D17 recently finished units table."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import ActivityWindow
from app.reporting.first_observations import FIRST_OBSERVATION_CTES
from app.reporting.models import RecentFinishedUnitsQuery
from app.reporting.unit_status import UNIT_STATUS_COHORT_CAP, UNIT_STATUS_RUN_CAP, _positive_int
from app.reporting.unit_test_time import FinishedUnitRecord, read_finished_unit_cohort

RECENT_FINISHED_UNIT_CAP = 100
RECENT_FAILURE_ROW_CAP = UNIT_STATUS_RUN_CAP
_PURPOSE_SLOTS = 4

_STATION_SQL = f"""
WITH ranked_runs AS (
    SELECT a.unit_id, r.station_number,
        ROW_NUMBER() OVER (
            PARTITION BY a.unit_id
            ORDER BY r.run_started_at_utc DESC, r.run_id DESC
        ) AS run_rank
    FROM dbo.UNIT_SWITCH_ASSIGNMENTS AS a
    JOIN dbo.IL_RUNS AS r ON r.assignment_id = a.assignment_id
    WHERE a.unit_id IN ({{placeholders}})
        AND r.run_purpose IN ({", ".join("?" for _ in range(_PURPOSE_SLOTS))})
        AND r.analysis_status NOT IN ('excluded', 'superseded')
        AND r.superseded_by_run_id IS NULL
)
SELECT TOP ({UNIT_STATUS_COHORT_CAP + 1}) unit_id, station_number
FROM ranked_runs
WHERE run_rank = 1
ORDER BY unit_id
"""

_FAILURES_SQL = f"""
WITH candidate_runs AS (
    SELECT TOP (5001) r.run_id, a.unit_id, r.wavelength_mode,
        r.limit_snapshot_json, r.front_panel_channel_count
    FROM dbo.UNIT_SWITCH_ASSIGNMENTS AS a
    JOIN dbo.IL_RUNS AS r ON r.assignment_id = a.assignment_id
    WHERE a.unit_id IN ({{placeholders}})
        AND r.run_purpose IN ({", ".join("?" for _ in range(_PURPOSE_SLOTS))})
        AND r.analysis_status NOT IN ('excluded', 'superseded')
        AND r.superseded_by_run_id IS NULL
    ORDER BY r.run_id
),
{FIRST_OBSERVATION_CTES}
selected_observations AS (
    SELECT r.unit_id, r.run_id, r.wavelength_mode, r.limit_snapshot_json,
        p.sql_fail_limit, f.logical_channel,
        f.wavelength_1_il_db, f.wavelength_2_il_db
    FROM candidate_runs AS r
    JOIN parsed_runs AS p ON p.run_id = r.run_id
    LEFT JOIN first_observations AS f ON f.run_id = r.run_id
)
SELECT TOP ({RECENT_FAILURE_ROW_CAP + 1}) r.unit_id, r.run_id, r.wavelength_mode,
    r.limit_snapshot_json, r.sql_fail_limit, r.logical_channel,
    r.wavelength_1_il_db, r.wavelength_2_il_db
FROM selected_observations AS r
ORDER BY r.unit_id, r.run_id, r.logical_channel
"""

_REPLACEMENTS_SQL = f"""
SELECT TOP ({UNIT_STATUS_COHORT_CAP + 1}) a.unit_id,
    COUNT_BIG(DISTINCT replacement.logical_channel) AS replaced_channels
FROM dbo.CHANNEL_REPLACEMENTS AS replacement
JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = replacement.assignment_id
WHERE a.unit_id IN ({{placeholders}})
GROUP BY a.unit_id
ORDER BY a.unit_id
"""


@dataclass(frozen=True)
class RecentFinishedUnit:
    unit_id: int
    main_board_serial: str
    switch_model: str
    wavelength_mode: str
    channel_count: int | None
    station_number: int | None
    finished_at_utc: datetime
    outcome: str
    replaced_channels: int
    failed_channels: int | None
    failed_unknown: bool
    total_ms: int | None
    worst_il_db: Decimal | None
    worst_il_wavelength_nm: int | None
    worst_il_over_limit: bool | None


@dataclass(frozen=True)
class RecentFinishedUnitsMetrics:
    units: tuple[RecentFinishedUnit, ...]
    truncated: bool
    incomplete: bool


def _id_query(
    template: str, unit_ids: Sequence[int], purposes: Sequence[str] = ()
) -> tuple[str, tuple]:
    values = tuple(unit_ids)
    if not values or len(values) > UNIT_STATUS_COHORT_CAP or len(set(values)) != len(values):
        raise ValueError("One to 500 unique bounded unit identifiers are required")
    sql = template.format(placeholders=", ".join("?" for _ in values))
    purpose_values = list(purposes)
    if purpose_values:
        purpose_values.extend([purpose_values[0]] * (_PURPOSE_SLOTS - len(purpose_values)))
    return sql, (*values, *purpose_values)


def build_recent_finished_unit_queries(
    unit_ids: Sequence[int], purposes: Sequence[str]
) -> tuple[tuple[str, tuple], tuple[str, tuple], tuple[str, tuple]]:
    return (
        _id_query(_STATION_SQL, unit_ids, purposes),
        _id_query(_FAILURES_SQL, unit_ids, purposes),
        _id_query(_REPLACEMENTS_SQL, unit_ids),
    )


def _optional_station(value: object) -> int | None:
    return None if value is None else _positive_int(value)


def _counts(rows: Sequence[Sequence[object]], unit_ids: set[int]) -> dict[int, int]:
    result: dict[int, int] = {}
    for row in rows:
        if len(row) != 2:
            raise ReportingError("schema_incompatible")
        unit_id = _positive_int(row[0])
        count = row[1]
        if unit_id not in unit_ids or unit_id in result or type(count) is not int or count <= 0:
            raise ReportingError("schema_incompatible")
        result[unit_id] = count
    return result


def _failure_counts(
    rows: Sequence[Sequence[object]],
    unit_ids: set[int],
    validated_failure_limits: Callable[[list[tuple]], tuple[dict[int, Decimal | None], bool]],
    normalized_sql_limit: Callable[[object], Decimal | None],
) -> tuple[dict[int, int | None], bool]:
    limits_rows: dict[int, tuple] = {}
    parsed: list[tuple[int, int, object, object, int | None, object, object]] = []
    for row in rows:
        if len(row) != 8:
            raise ReportingError("schema_incompatible")
        unit_id = _positive_int(row[0])
        run_id = _positive_int(row[1])
        if unit_id not in unit_ids or row[2] not in {"SM", "MM"}:
            raise ReportingError("schema_incompatible")
        signature = (run_id, row[2], row[3])
        if run_id in limits_rows and limits_rows[run_id] != signature:
            raise ReportingError("schema_incompatible")
        limits_rows[run_id] = signature
        logical = None if row[5] is None else _positive_int(row[5])
        parsed.append((unit_id, run_id, row[4], row[3], logical, row[6], row[7]))
    limits, limit_incomplete = validated_failure_limits(list(limits_rows.values()))
    unknown_units: set[int] = set()
    failures: dict[int, set[int]] = {unit_id: set() for unit_id in unit_ids}
    for unit_id, run_id, raw_sql_limit, _snapshot, logical, loss_1, loss_2 in parsed:
        sql_limit = normalized_sql_limit(raw_sql_limit)
        limit = limits[run_id]
        if limit is None or sql_limit != limit:
            unknown_units.add(unit_id)
            continue
        if logical is None:
            continue
        try:
            values = (Decimal(loss_1), Decimal(loss_2))
        except (TypeError, ValueError):
            raise ReportingError("schema_incompatible") from None
        if any(not value.is_finite() for value in values):
            raise ReportingError("schema_incompatible")
        if any(value > limit for value in values):
            failures[unit_id].add(logical)
    return (
        {
            unit_id: None if unit_id in unknown_units else len(failures[unit_id])
            for unit_id in unit_ids
        },
        limit_incomplete,
    )


def summarize_recent_finished_units(
    records: Sequence[FinishedUnitRecord],
    station_rows: Sequence[Sequence[object]],
    failure_rows: Sequence[Sequence[object]],
    replacement_rows: Sequence[Sequence[object]],
    *,
    incomplete: bool,
    failure_overflow: bool,
    validated_failure_limits: Callable[[list[tuple]], tuple[dict[int, Decimal | None], bool]],
    normalized_sql_limit: Callable[[object], Decimal | None],
) -> RecentFinishedUnitsMetrics:
    eligible = [
        record
        for record in records
        if record.outcome is not None
        and record.exclusion_reason != "run_in_progress"
        and record.finished_at_utc is not None
        and not record.outside_period
    ]
    ordered = sorted(eligible, key=lambda item: (-item.finished_at_utc.timestamp(), item.unit_id))
    truncated = len(ordered) > RECENT_FINISHED_UNIT_CAP
    listed = ordered[:RECENT_FINISHED_UNIT_CAP]
    unit_ids = {record.unit_id for record in listed}
    stations: dict[int, int | None] = {}
    for row in station_rows:
        if len(row) != 2:
            raise ReportingError("schema_incompatible")
        unit_id = _positive_int(row[0])
        if unit_id not in unit_ids or unit_id in stations:
            raise ReportingError("schema_incompatible")
        stations[unit_id] = _optional_station(row[1])
    replacements = _counts(replacement_rows, unit_ids)
    failures, limits_incomplete = _failure_counts(
        failure_rows, unit_ids, validated_failure_limits, normalized_sql_limit
    )
    units: list[RecentFinishedUnit] = []
    for record in listed:
        if record.switch_model is None or record.wavelength_mode not in {"SM", "MM"}:
            raise ReportingError("schema_incompatible")
        worst: tuple[Decimal, int] | None = None
        for reading in record.effective_readings:
            for loss, wavelength in (
                (reading.wavelength_1_il_db, reading.wavelength_1_nm),
                (reading.wavelength_2_il_db, reading.wavelength_2_nm),
            ):
                candidate = (loss, wavelength)
                if (
                    worst is None
                    or candidate[0] > worst[0]
                    or (candidate[0] == worst[0] and candidate[1] < worst[1])
                ):
                    worst = candidate
        replaced = replacements.get(record.unit_id, 0)
        outcome = (
            "unrecoverable"
            if record.outcome == "unrecoverable"
            else ("passed_after_replacement" if replaced else "passed_no_replacement")
        )
        failed = failures[record.unit_id]
        units.append(
            RecentFinishedUnit(
                unit_id=record.unit_id,
                main_board_serial=record.main_board_serial,
                switch_model=record.switch_model,
                wavelength_mode=record.wavelength_mode,
                channel_count=record.channel_count,
                station_number=stations.get(record.unit_id),
                finished_at_utc=record.finished_at_utc,
                outcome=outcome,
                replaced_channels=replaced,
                failed_channels=failed,
                failed_unknown=failed is None,
                total_ms=None if record.missing_duration else record.total_ms,
                worst_il_db=None if worst is None else worst[0],
                worst_il_wavelength_nm=None if worst is None else worst[1],
                worst_il_over_limit=None
                if worst is None or record.fail_limit is None
                else worst[0] > record.fail_limit,
            )
        )
    return RecentFinishedUnitsMetrics(
        units=tuple(units),
        truncated=truncated,
        incomplete=incomplete or failure_overflow or limits_incomplete,
    )


def read_recent_finished_units(
    cursor,
    query: RecentFinishedUnitsQuery,
    window: ActivityWindow,
    *,
    validated_failure_limits: Callable[[list[tuple]], tuple[dict[int, Decimal | None], bool]],
    normalized_sql_limit: Callable[[object], Decimal | None],
) -> RecentFinishedUnitsMetrics:
    cohort = read_finished_unit_cohort(cursor, query, window)
    eligible = [
        record
        for record in cohort.records
        if record.outcome is not None
        and record.exclusion_reason != "run_in_progress"
        and record.finished_at_utc is not None
        and not record.outside_period
    ]
    eligible.sort(key=lambda item: (-item.finished_at_utc.timestamp(), item.unit_id))
    listed = eligible[:RECENT_FINISHED_UNIT_CAP]
    if not listed:
        return RecentFinishedUnitsMetrics((), False, cohort.incomplete)
    unit_ids = tuple(record.unit_id for record in listed)
    station_query, failure_query, replacement_query = build_recent_finished_unit_queries(
        unit_ids, tuple(purpose.value for purpose in query.purposes)
    )
    station_rows = cursor.execute(*station_query).fetchmany(UNIT_STATUS_COHORT_CAP + 1)
    failure_rows = cursor.execute(*failure_query).fetchmany(RECENT_FAILURE_ROW_CAP + 1)
    replacement_rows = cursor.execute(*replacement_query).fetchmany(UNIT_STATUS_COHORT_CAP + 1)
    follow_up_incomplete = (
        len(station_rows) > UNIT_STATUS_COHORT_CAP or len(replacement_rows) > UNIT_STATUS_COHORT_CAP
    )
    return summarize_recent_finished_units(
        cohort.records,
        station_rows[:UNIT_STATUS_COHORT_CAP],
        failure_rows[:RECENT_FAILURE_ROW_CAP],
        replacement_rows[:UNIT_STATUS_COHORT_CAP],
        incomplete=cohort.incomplete or follow_up_incomplete,
        failure_overflow=len(failure_rows) > RECENT_FAILURE_ROW_CAP,
        validated_failure_limits=validated_failure_limits,
        normalized_sql_limit=normalized_sql_limit,
    )
