"""Bounded D17 finished-unit outcomes over eight Pacific weeks."""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime

from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import ActivityWindow, WeeklyOutcomeBoundaries
from app.reporting.models import UnitOutcomesWeeklyQuery
from app.reporting.unit_status import UNIT_STATUS_COHORT_CAP, _positive_int
from app.reporting.unit_test_time import FinishedUnitRecord, read_finished_unit_cohort

EXCLUDED_KEYS = (
    "review_required",
    "not_evaluated",
    "failing_recovery_available",
    "failing_needs_analysis",
    "other_saved_result",
    "run_in_progress",
    "outside_period",
)


@dataclass(frozen=True)
class UnitOutcomeWeek:
    start_utc: datetime
    end_utc: datetime
    local_start_date: date
    partial: bool
    passed_no_replacement: int
    passed_after_replacement: int
    unrecoverable: int


@dataclass(frozen=True)
class UnitOutcomeItem:
    unit_id: int
    main_board_serial: str
    outcome: str
    replaced: bool
    finished_at_utc: datetime
    week_start_date: date


@dataclass(frozen=True)
class UnitOutcomesWeeklyMetrics:
    weeks: tuple[UnitOutcomeWeek, ...]
    units: tuple[UnitOutcomeItem, ...]
    excluded: dict[str, int]
    incomplete: bool


def build_replacement_count_query(unit_ids: Sequence[int]) -> tuple[str, tuple[int, ...]]:
    values = tuple(unit_ids)
    if not values or len(values) > UNIT_STATUS_COHORT_CAP or len(set(values)) != len(values):
        raise ValueError("One to 500 unique bounded unit identifiers are required")
    placeholders = ", ".join("?" for _ in values)
    sql = f"""
SELECT TOP ({UNIT_STATUS_COHORT_CAP + 1}) a.unit_id, COUNT_BIG(*) AS replacement_count
FROM dbo.CHANNEL_REPLACEMENTS AS replacement
JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = replacement.assignment_id
WHERE a.unit_id IN ({placeholders})
GROUP BY a.unit_id
ORDER BY a.unit_id
"""
    return sql, values


def _replacement_units(rows: Sequence[Sequence[object]], passed_unit_ids: set[int]) -> set[int]:
    if len(rows) > UNIT_STATUS_COHORT_CAP or len(rows) > len(passed_unit_ids):
        raise ReportingError("schema_incompatible")
    replaced: set[int] = set()
    for row in rows:
        if len(row) != 2:
            raise ReportingError("schema_incompatible")
        unit_id = _positive_int(row[0])
        _positive_int(row[1])
        if unit_id not in passed_unit_ids or unit_id in replaced:
            raise ReportingError("schema_incompatible")
        replaced.add(unit_id)
    return replaced


def _eligible_records(
    records: Sequence[FinishedUnitRecord],
) -> tuple[list[FinishedUnitRecord], Counter[str]]:
    eligible: list[FinishedUnitRecord] = []
    excluded: Counter[str] = Counter()
    for record in records:
        if record.exclusion_reason is not None:
            excluded[record.exclusion_reason] += 1
        elif record.outside_period or record.finished_at_utc is None:
            excluded["outside_period"] += 1
        elif record.outcome is not None:
            # Duration completeness is deliberately irrelevant to this panel.
            eligible.append(record)
    return eligible, excluded


def summarize_unit_outcomes_weekly(
    records: Sequence[FinishedUnitRecord],
    boundaries: WeeklyOutcomeBoundaries,
    replacement_rows: Sequence[Sequence[object]],
    *,
    incomplete: bool,
) -> UnitOutcomesWeeklyMetrics:
    if len(boundaries.weeks) != 8:
        raise ReportingError("schema_incompatible")
    eligible, excluded = _eligible_records(records)
    passed_ids = {record.unit_id for record in eligible if record.outcome == "passed"}
    replaced_ids = _replacement_units(replacement_rows, passed_ids)
    counts = [Counter() for _ in boundaries.weeks]
    units: list[UnitOutcomeItem] = []
    for record in eligible:
        if record.outcome is None or record.finished_at_utc is None:
            raise ReportingError("schema_incompatible")
        week_index = next(
            (
                index
                for index, week in enumerate(boundaries.weeks)
                if week.start_utc <= record.finished_at_utc < week.end_utc
            ),
            None,
        )
        if week_index is None:
            raise ReportingError("schema_incompatible")
        replaced = record.outcome == "passed" and record.unit_id in replaced_ids
        bucket = (
            "unrecoverable"
            if record.outcome == "unrecoverable"
            else "passed_after_replacement"
            if replaced
            else "passed_no_replacement"
        )
        counts[week_index][bucket] += 1
        units.append(
            UnitOutcomeItem(
                unit_id=record.unit_id,
                main_board_serial=record.main_board_serial,
                outcome=record.outcome,
                replaced=replaced,
                finished_at_utc=record.finished_at_utc,
                week_start_date=boundaries.weeks[week_index].local_date,
            )
        )
    weeks = tuple(
        UnitOutcomeWeek(
            start_utc=window.start_utc,
            end_utc=window.end_utc,
            local_start_date=window.local_date,
            partial=window.partial,
            passed_no_replacement=counts[index]["passed_no_replacement"],
            passed_after_replacement=counts[index]["passed_after_replacement"],
            unrecoverable=counts[index]["unrecoverable"],
        )
        for index, window in enumerate(boundaries.weeks)
    )
    return UnitOutcomesWeeklyMetrics(
        weeks=weeks,
        units=tuple(
            sorted(units, key=lambda item: (-item.finished_at_utc.timestamp(), item.unit_id))
        ),
        excluded={key: excluded[key] for key in EXCLUDED_KEYS},
        incomplete=incomplete,
    )


def read_unit_outcomes_weekly(
    cursor, query: UnitOutcomesWeeklyQuery, boundaries: WeeklyOutcomeBoundaries
) -> UnitOutcomesWeeklyMetrics:
    overall = ActivityWindow(
        start_utc=boundaries.weeks[0].start_utc,
        end_utc=boundaries.extracted_at_utc,
        partial=True,
    )
    cohort = read_finished_unit_cohort(cursor, query, overall)
    eligible, _ = _eligible_records(cohort.records)
    passed_ids = tuple(record.unit_id for record in eligible if record.outcome == "passed")
    replacement_rows: Sequence[Sequence[object]] = ()
    if passed_ids:
        replacement_rows = cursor.execute(*build_replacement_count_query(passed_ids)).fetchmany(
            UNIT_STATUS_COHORT_CAP + 1
        )
    return summarize_unit_outcomes_weekly(
        cohort.records,
        boundaries,
        replacement_rows,
        incomplete=cohort.incomplete,
    )
