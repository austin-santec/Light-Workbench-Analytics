"""Bounded cumulative production-run time for units finished under working rule D17."""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import ActivityWindow
from app.reporting.models import TimingQuality, UnitOutcomesWeeklyQuery, UnitTestTimeQuery
from app.reporting.unit_status import (
    UNIT_STATUS_COHORT_CAP,
    UNIT_STATUS_RUN_CAP,
    CohortAssignment,
    UnitStatusProjection,
    _optional_positive_int,
    _positive_int,
    _utc,
    read_unit_status_projections,
)
from app.schemas import RunPurpose

_PURPOSE_SLOTS = 4
FINISHED_ANALYSIS_RESULTS = {
    "fail_no_viable_recovery",
    "not_applicable_no_extra_ports",
}
EXCLUDED_KEYS = (
    "review_required",
    "not_evaluated",
    "failing_recovery_available",
    "failing_needs_analysis",
    "other_saved_result",
    "run_in_progress",
    "missing_duration",
    "outside_period",
)
FinishedOutcome = Literal["passed", "unrecoverable"]

UNIT_TEST_TIME_COHORT_SQL = f"""
WITH selected_purposes(run_purpose) AS (
    SELECT run_purpose
    FROM (VALUES {", ".join("(?)" for _ in range(_PURPOSE_SLOTS))}) AS values_list(run_purpose)
),
report_window(start_utc, end_utc) AS (
    SELECT CAST(? AS datetime2(3)), CAST(? AS datetime2(3))
),
cohort_activity AS (
    SELECT r.assignment_id, r.run_ended_at_utc AS activity_utc
    FROM dbo.IL_RUNS AS r
    JOIN selected_purposes AS purpose ON purpose.run_purpose = r.run_purpose
    CROSS JOIN report_window AS window
    WHERE r.run_ended_at_utc >= window.start_utc
        AND r.run_ended_at_utc < window.end_utc
        AND r.analysis_status NOT IN ('excluded', 'superseded')
        AND r.superseded_by_run_id IS NULL
    UNION ALL
    SELECT r.assignment_id, analysis.analyzed_at_utc AS activity_utc
    FROM dbo.REPLACEMENT_ANALYSES AS analysis
    JOIN dbo.IL_RUNS AS r ON r.run_id = analysis.run_id
    JOIN selected_purposes AS purpose ON purpose.run_purpose = r.run_purpose
    CROSS JOIN report_window AS window
    WHERE analysis.analyzed_at_utc >= window.start_utc
        AND analysis.analyzed_at_utc < window.end_utc
),
newest_activity AS (
    SELECT assignment_id, MAX(activity_utc) AS newest_cohort_activity_utc
    FROM cohort_activity
    GROUP BY assignment_id
)
SELECT TOP ({UNIT_STATUS_COHORT_CAP + 1}) a.assignment_id, u.unit_id,
    u.main_board_serial, s.switch_serial, s.switch_model,
    activity.newest_cohort_activity_utc
FROM newest_activity AS activity
JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = activity.assignment_id
JOIN dbo.UNITS AS u ON u.unit_id = a.unit_id
JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
WHERE a.removed_at_utc IS NULL
ORDER BY activity.newest_cohort_activity_utc DESC, a.assignment_id DESC
"""

_UNIT_TIMING_PREFIX = f"""
SELECT TOP ({UNIT_STATUS_RUN_CAP + 1}) r.run_id, a.unit_id, r.assignment_id,
    r.run_purpose, r.run_started_at_utc, r.run_ended_at_utc,
    r.analysis_status, r.superseded_by_run_id,
    CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE timing.timing_quality END,
    CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE timing.active_test_ms END,
    CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE timing.elapsed_ms END
FROM dbo.UNIT_SWITCH_ASSIGNMENTS AS a
JOIN dbo.IL_RUNS AS r ON r.assignment_id = a.assignment_id
LEFT JOIN dbo.vw_RunTimingSummary AS timing ON timing.run_id = r.run_id
WHERE a.unit_id IN ({{placeholders}})
ORDER BY a.unit_id, r.run_started_at_utc, r.run_id
"""


@dataclass(frozen=True)
class UnitTimingRun:
    run_id: int
    unit_id: int
    assignment_id: int
    run_purpose: RunPurpose
    run_started_at_utc: datetime
    run_ended_at_utc: datetime | None
    analysis_status: str
    superseded_by_run_id: int | None
    timing_quality: TimingQuality | None
    active_test_ms: int | None
    elapsed_ms: int | None


@dataclass(frozen=True)
class UnitTestTimeItem:
    unit_id: int
    main_board_serial: str
    outcome: FinishedOutcome
    finished_at_utc: datetime
    total_ms: int
    run_count: int
    active_run_count: int
    fallback_run_count: int


@dataclass(frozen=True)
class UnitTestTimeMetrics:
    units: tuple[UnitTestTimeItem, ...]
    excluded: dict[str, int]
    incomplete: bool


@dataclass(frozen=True)
class FinishedUnitRecord:
    unit_id: int
    main_board_serial: str
    outcome: FinishedOutcome | None
    exclusion_reason: str | None
    finished_at_utc: datetime | None
    outside_period: bool
    missing_duration: bool
    total_ms: int
    run_count: int
    active_run_count: int
    fallback_run_count: int


@dataclass(frozen=True)
class FinishedUnitCohort:
    records: tuple[FinishedUnitRecord, ...]
    incomplete: bool


def finished_outcome(projection: UnitStatusProjection) -> FinishedOutcome | None:
    """Apply the reusable D17 working finished-unit rule to one D16 projection."""
    if projection.status == "passing":
        return "passed"
    analysis = projection.latest_analysis
    if (
        projection.status == "failing_no_measured_recovery"
        and analysis is not None
        and analysis.current
        and analysis.result_status in FINISHED_ANALYSIS_RESULTS
    ):
        return "unrecoverable"
    return None


def _cohort_params(
    query: UnitTestTimeQuery | UnitOutcomesWeeklyQuery, window: ActivityWindow
) -> tuple:
    purposes = [purpose.value for purpose in query.purposes]
    purposes.extend([purposes[0]] * (_PURPOSE_SLOTS - len(purposes)))
    return *purposes, window.start_utc, window.end_utc


def build_unit_timing_query(unit_ids: Sequence[int]) -> tuple[str, tuple[int, ...]]:
    values = tuple(unit_ids)
    if not values or len(values) > UNIT_STATUS_COHORT_CAP:
        raise ValueError("One to 500 bounded unit identifiers are required")
    return _UNIT_TIMING_PREFIX.format(placeholders=", ".join("?" for _ in values)), values


def _nonnegative_int(value: object) -> int:
    if type(value) is not int or value < 0:
        raise ReportingError("schema_incompatible")
    return value


def _timing_runs(
    rows: Sequence[Sequence[object]], cohort_unit_ids: set[int]
) -> list[UnitTimingRun]:
    parsed: list[UnitTimingRun] = []
    for row in rows:
        if len(row) != 11:
            raise ReportingError("schema_incompatible")
        unit_id = _positive_int(row[1])
        if unit_id not in cohort_unit_ids:
            raise ReportingError("schema_incompatible")
        try:
            purpose = RunPurpose(row[3])
        except (TypeError, ValueError):
            raise ReportingError("schema_incompatible") from None
        started = _utc(row[4])
        ended = None if row[5] is None else _utc(row[5])
        if ended is not None and ended < started:
            raise ReportingError("schema_incompatible")
        if row[6] not in {"pending", "included", "excluded", "superseded"}:
            raise ReportingError("schema_incompatible")
        if ended is None:
            if any(value is not None for value in row[8:11]):
                raise ReportingError("schema_incompatible")
            quality = None
            active = None
            elapsed = None
        else:
            try:
                quality = TimingQuality(row[8])
            except (TypeError, ValueError):
                raise ReportingError("schema_incompatible") from None
            active = None if row[9] is None else _nonnegative_int(row[9])
            elapsed = None if row[10] is None else _nonnegative_int(row[10])
        parsed.append(
            UnitTimingRun(
                run_id=_positive_int(row[0]),
                unit_id=unit_id,
                assignment_id=_positive_int(row[2]),
                run_purpose=purpose,
                run_started_at_utc=started,
                run_ended_at_utc=ended,
                analysis_status=row[6],
                superseded_by_run_id=_optional_positive_int(row[7]),
                timing_quality=quality,
                active_test_ms=active,
                elapsed_ms=elapsed,
            )
        )
    return parsed


def summarize_finished_unit_cohort(
    cohorts: Sequence[CohortAssignment],
    projections: Sequence[UnitStatusProjection],
    run_rows: Sequence[Sequence[object]],
    query: UnitTestTimeQuery | UnitOutcomesWeeklyQuery,
    window: ActivityWindow,
) -> tuple[FinishedUnitRecord, ...]:
    cohort_by_unit = {item.unit_id: item for item in cohorts}
    if len(cohort_by_unit) != len(cohorts):
        raise ReportingError("schema_incompatible")
    projection_by_unit = {item.unit_id: item for item in projections}
    if set(projection_by_unit) != set(cohort_by_unit):
        raise ReportingError("schema_incompatible")
    runs_by_unit: dict[int, list[UnitTimingRun]] = defaultdict(list)
    for run in _timing_runs(run_rows, set(cohort_by_unit)):
        runs_by_unit[run.unit_id].append(run)

    selected_purposes = set(query.purposes)
    records: list[FinishedUnitRecord] = []
    for unit_id, cohort in cohort_by_unit.items():
        projection = projection_by_unit[unit_id]
        outcome = finished_outcome(projection)
        if outcome is None:
            reason = (
                "other_saved_result"
                if projection.status == "failing_no_measured_recovery"
                else projection.status
            )
            records.append(
                FinishedUnitRecord(
                    unit_id, cohort.main_board_serial, None, reason, None, False, False, 0, 0, 0, 0
                )
            )
            continue
        qualifying = [
            run
            for run in runs_by_unit[unit_id]
            if run.run_purpose in selected_purposes
            and run.analysis_status not in {"excluded", "superseded"}
            and run.superseded_by_run_id is None
        ]
        if any(run.run_ended_at_utc is None for run in qualifying):
            records.append(
                FinishedUnitRecord(
                    unit_id,
                    cohort.main_board_serial,
                    outcome,
                    "run_in_progress",
                    None,
                    False,
                    False,
                    0,
                    len(qualifying),
                    0,
                    0,
                )
            )
            continue
        if not qualifying:
            records.append(
                FinishedUnitRecord(
                    unit_id, cohort.main_board_serial, outcome, None, None, False, True, 0, 0, 0, 0
                )
            )
            continue
        total_ms = 0
        active_count = 0
        fallback_count = 0
        missing_duration = False
        for run in qualifying:
            if run.timing_quality is TimingQuality.CONFIRMED and run.active_test_ms is not None:
                total_ms += run.active_test_ms
                active_count += 1
            elif run.elapsed_ms is not None and run.elapsed_ms > 0:
                total_ms += run.elapsed_ms
                fallback_count += 1
            else:
                missing_duration = True
                break
        finished_at = max(
            run.run_ended_at_utc for run in qualifying if run.run_ended_at_utc is not None
        )
        if outcome == "unrecoverable" and projection.latest_analysis is not None:
            finished_at = max(finished_at, projection.latest_analysis.analyzed_at_utc)
        records.append(
            FinishedUnitRecord(
                unit_id=unit_id,
                main_board_serial=cohort.main_board_serial,
                outcome=outcome,
                exclusion_reason=None,
                finished_at_utc=finished_at,
                outside_period=not window.start_utc <= finished_at < window.end_utc,
                missing_duration=missing_duration,
                total_ms=total_ms,
                run_count=len(qualifying),
                active_run_count=active_count,
                fallback_run_count=fallback_count,
            )
        )
    return tuple(records)


def summarize_unit_test_time(
    cohorts: Sequence[CohortAssignment],
    projections: Sequence[UnitStatusProjection],
    run_rows: Sequence[Sequence[object]],
    query: UnitTestTimeQuery,
    window: ActivityWindow,
    *,
    incomplete: bool,
) -> UnitTestTimeMetrics:
    records = summarize_finished_unit_cohort(cohorts, projections, run_rows, query, window)
    excluded = Counter()
    units: list[UnitTestTimeItem] = []
    for record in records:
        if record.exclusion_reason is not None:
            excluded[record.exclusion_reason] += 1
        elif record.missing_duration:
            excluded["missing_duration"] += 1
        elif record.outside_period:
            excluded["outside_period"] += 1
        elif record.outcome is not None and record.finished_at_utc is not None:
            units.append(
                UnitTestTimeItem(
                    unit_id=record.unit_id,
                    main_board_serial=record.main_board_serial,
                    outcome=record.outcome,
                    finished_at_utc=record.finished_at_utc,
                    total_ms=record.total_ms,
                    run_count=record.run_count,
                    active_run_count=record.active_run_count,
                    fallback_run_count=record.fallback_run_count,
                )
            )
    ordered = tuple(
        sorted(units, key=lambda item: (-item.finished_at_utc.timestamp(), item.unit_id))
    )
    return UnitTestTimeMetrics(
        units=ordered,
        excluded={key: excluded[key] for key in EXCLUDED_KEYS},
        incomplete=incomplete,
    )


def read_finished_unit_cohort(
    cursor,
    query: UnitTestTimeQuery | UnitOutcomesWeeklyQuery,
    window: ActivityWindow,
) -> FinishedUnitCohort:
    cohort_rows = cursor.execute(
        UNIT_TEST_TIME_COHORT_SQL, _cohort_params(query, window)
    ).fetchmany(UNIT_STATUS_COHORT_CAP + 1)
    incomplete = len(cohort_rows) > UNIT_STATUS_COHORT_CAP
    cohorts: list[CohortAssignment] = []
    for row in cohort_rows[:UNIT_STATUS_COHORT_CAP]:
        if (
            len(row) != 6
            or not isinstance(row[2], str)
            or not row[2]
            or not isinstance(row[3], str)
            or not row[3]
            or not isinstance(row[4], str)
            or not row[4]
        ):
            raise ReportingError("schema_incompatible")
        _utc(row[5])
        cohorts.append(
            CohortAssignment(
                assignment_id=_positive_int(row[0]),
                unit_id=_positive_int(row[1]),
                main_board_serial=row[2],
                switch_serial=row[3],
                switch_model=row[4],
            )
        )
    if not cohorts:
        return FinishedUnitCohort(records=(), incomplete=incomplete)
    projections, projection_incomplete = read_unit_status_projections(cursor, cohorts)
    timing_query = build_unit_timing_query(tuple(item.unit_id for item in cohorts))
    timing_rows = cursor.execute(*timing_query).fetchmany(UNIT_STATUS_RUN_CAP + 1)
    timing_incomplete = len(timing_rows) > UNIT_STATUS_RUN_CAP
    records = summarize_finished_unit_cohort(
        cohorts, projections, timing_rows[:UNIT_STATUS_RUN_CAP], query, window
    )
    return FinishedUnitCohort(
        records=records,
        incomplete=incomplete or projection_incomplete or timing_incomplete,
    )


def read_unit_test_time(
    cursor, query: UnitTestTimeQuery, window: ActivityWindow
) -> UnitTestTimeMetrics:
    cohort = read_finished_unit_cohort(cursor, query, window)
    if not cohort.records:
        return UnitTestTimeMetrics(
            units=(), excluded=dict.fromkeys(EXCLUDED_KEYS, 0), incomplete=cohort.incomplete
        )
    excluded = Counter()
    units: list[UnitTestTimeItem] = []
    for record in cohort.records:
        if record.exclusion_reason is not None:
            excluded[record.exclusion_reason] += 1
        elif record.missing_duration:
            excluded["missing_duration"] += 1
        elif record.outside_period:
            excluded["outside_period"] += 1
        elif record.outcome is not None and record.finished_at_utc is not None:
            units.append(
                UnitTestTimeItem(
                    record.unit_id,
                    record.main_board_serial,
                    record.outcome,
                    record.finished_at_utc,
                    record.total_ms,
                    record.run_count,
                    record.active_run_count,
                    record.fallback_run_count,
                )
            )
    return UnitTestTimeMetrics(
        units=tuple(
            sorted(units, key=lambda item: (-item.finished_at_utc.timestamp(), item.unit_id))
        ),
        excluded={key: excluded[key] for key in EXCLUDED_KEYS},
        incomplete=cohort.incomplete,
    )
