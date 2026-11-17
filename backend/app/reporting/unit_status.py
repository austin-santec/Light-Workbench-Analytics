"""Current unit status from bounded assignment-wide effective projections."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Literal

from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import ActivityWindow
from app.reporting.models import UnitStatusQuery
from app.reporting.unit_lookup import classify_losses, parse_limit_snapshot

UNIT_STATUS_COHORT_CAP = 500
UNIT_STATUS_RUN_CAP = 100_000
UNIT_STATUS_MEASUREMENT_CAP = 100_000
UNIT_STATUS_HARDWARE_CAP = 100_000
UNIT_STATUS_ANALYSIS_CAP = 500
UNIT_STATUS_RECOMMENDATION_CAP = 5_000
STRICT_CLASSIFICATION_RULE = "strict >, run limit snapshot"

UNIT_STATUS_KEYS = (
    "review_required",
    "not_evaluated",
    "passing",
    "failing_recovery_available",
    "failing_needs_analysis",
    "failing_no_measured_recovery",
)
UnitStatus = Literal[
    "review_required",
    "not_evaluated",
    "passing",
    "failing_recovery_available",
    "failing_needs_analysis",
    "failing_no_measured_recovery",
]

_PURPOSE_SLOTS = 4

COHORT_SQL = f"""
SELECT TOP ({UNIT_STATUS_COHORT_CAP + 1}) a.assignment_id, u.unit_id,
    u.main_board_serial, s.switch_serial, s.switch_model,
    MAX(m.written_at_utc) AS newest_cohort_activity_utc
FROM dbo.UNIT_SWITCH_ASSIGNMENTS AS a
JOIN dbo.UNITS AS u ON u.unit_id = a.unit_id
JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
JOIN dbo.IL_RUNS AS r ON r.assignment_id = a.assignment_id
JOIN dbo.IL_MEASUREMENTS AS m ON m.run_id = r.run_id
WHERE a.removed_at_utc IS NULL
    AND m.written_at_utc >= ? AND m.written_at_utc < ?
    AND m.measurement_role = 'logical_channel'
    AND r.front_panel_channel_count IS NOT NULL
    AND r.front_panel_channel_count > 0
    AND m.logical_channel >= 1
    AND m.logical_channel <= r.front_panel_channel_count
    AND r.analysis_status NOT IN ('excluded', 'superseded')
    AND r.superseded_by_run_id IS NULL
    AND r.run_purpose IN ({", ".join("?" for _ in range(_PURPOSE_SLOTS))})
GROUP BY a.assignment_id, u.unit_id, u.main_board_serial,
    s.switch_serial, s.switch_model
ORDER BY newest_cohort_activity_utc DESC, a.assignment_id DESC
"""

_RUNS_PREFIX = f"""
SELECT TOP ({UNIT_STATUS_RUN_CAP + 1}) r.run_id, r.assignment_id,
    r.run_started_at_utc, r.wavelength_mode, r.front_panel_channel_count,
    r.analysis_status, r.superseded_by_run_id, r.limit_snapshot_json
FROM dbo.IL_RUNS AS r
WHERE r.assignment_id IN ({{placeholders}})
ORDER BY r.assignment_id, r.run_started_at_utc, r.run_id
"""

_MEASUREMENTS_PREFIX = f"""
SELECT TOP ({UNIT_STATUS_MEASUREMENT_CAP + 1}) m.measurement_id, r.assignment_id,
    m.run_id, m.logical_channel, m.physical_port, m.attempt_number,
    m.wavelength_1_nm, m.wavelength_1_il_db,
    m.wavelength_2_nm, m.wavelength_2_il_db, m.written_at_utc
FROM dbo.IL_MEASUREMENTS AS m
JOIN dbo.IL_RUNS AS r ON r.run_id = m.run_id
WHERE r.assignment_id IN ({{placeholders}})
    AND m.measurement_role = 'logical_channel'
ORDER BY m.written_at_utc DESC, m.attempt_number DESC, m.measurement_id DESC
"""

_CHANNEL_MAP_PREFIX = f"""
SELECT TOP ({UNIT_STATUS_HARDWARE_CAP + 1}) channel_map.assignment_id,
    channel_map.logical_channel, channel_map.effective_physical_port
FROM dbo.vw_CurrentChannelMap AS channel_map
WHERE channel_map.assignment_id IN ({{placeholders}})
ORDER BY channel_map.assignment_id, channel_map.logical_channel
"""

_REPLACEMENTS_PREFIX = f"""
SELECT TOP ({UNIT_STATUS_HARDWARE_CAP + 1}) replacement.replacement_id,
    replacement.assignment_id, replacement.logical_channel,
    replacement.replacement_physical_port, replacement.replaced_at_utc,
    replacement.related_run_id
FROM dbo.CHANNEL_REPLACEMENTS AS replacement
WHERE replacement.assignment_id IN ({{placeholders}})
ORDER BY replacement.assignment_id, replacement.replaced_at_utc,
    replacement.replacement_id
"""

_ANALYSES_PREFIX = f"""
WITH ranked_analyses AS (
    SELECT analysis.analysis_id, run.assignment_id, analysis.result_status,
        analysis.analyzed_at_utc,
        ROW_NUMBER() OVER (
            PARTITION BY run.assignment_id
            ORDER BY analysis.analyzed_at_utc DESC, analysis.analysis_id DESC
        ) AS analysis_rank
    FROM dbo.REPLACEMENT_ANALYSES AS analysis
    JOIN dbo.IL_RUNS AS run ON run.run_id = analysis.run_id
    WHERE run.assignment_id IN ({{placeholders}})
)
SELECT TOP ({UNIT_STATUS_ANALYSIS_CAP + 1}) analysis_id, assignment_id,
    result_status, analyzed_at_utc
FROM ranked_analyses
WHERE analysis_rank = 1
ORDER BY assignment_id
"""

_RECOMMENDATIONS_PREFIX = f"""
SELECT TOP ({UNIT_STATUS_RECOMMENDATION_CAP + 1})
    recommendation.recommendation_id, recommendation.analysis_id,
    CASE WHEN EXISTS (
        SELECT 1
        FROM dbo.CHANNEL_REPLACEMENTS AS replacement
        WHERE replacement.source_recommendation_id = recommendation.recommendation_id
    ) THEN CONVERT(BIT, 1) ELSE CONVERT(BIT, 0) END AS used
FROM dbo.REPLACEMENT_ANALYSIS_RECOMMENDATIONS AS recommendation
WHERE recommendation.analysis_id IN ({{placeholders}})
ORDER BY recommendation.analysis_id, recommendation.recommendation_rank,
    recommendation.recommendation_id
"""


@dataclass(frozen=True)
class CohortAssignment:
    assignment_id: int
    unit_id: int
    main_board_serial: str
    switch_serial: str
    switch_model: str


@dataclass(frozen=True)
class ProjectionRun:
    run_id: int
    assignment_id: int
    run_started_at_utc: datetime
    wavelength_mode: str
    front_panel_channel_count: int | None
    analysis_status: str
    superseded_by_run_id: int | None
    limits: dict | None


@dataclass(frozen=True)
class ProjectionMeasurement:
    measurement_id: int
    assignment_id: int
    run_id: int
    logical_channel: int | None
    physical_port: int
    attempt_number: int
    wavelength_1_nm: int
    wavelength_1_il_db: Decimal
    wavelength_2_nm: int
    wavelength_2_il_db: Decimal
    written_at_utc: datetime


@dataclass(frozen=True)
class ProjectionReplacement:
    replacement_id: int
    assignment_id: int
    logical_channel: int
    replacement_physical_port: int
    replaced_at_utc: datetime
    related_run_id: int | None


@dataclass(frozen=True)
class LatestAnalysis:
    analysis_id: int
    result_status: str
    analyzed_at_utc: datetime
    unused_recommendations: int = 0


@dataclass(frozen=True)
class FailingChannel:
    logical_channel: int
    effective_port: int
    wavelength_1_il_db: Decimal
    wavelength_2_il_db: Decimal


@dataclass(frozen=True)
class AnalysisSummary:
    analysis_id: int
    result_status: str
    analyzed_at_utc: datetime
    current: bool
    unused_recommendations: int


@dataclass(frozen=True)
class UnitStatusProjection:
    unit_id: int
    main_board_serial: str
    assignment_id: int
    switch_serial: str
    switch_model: str
    context_run_id: int | None
    channel_count: int | None
    status: UnitStatus
    failing_channels: tuple[FailingChannel, ...]
    latest_analysis: AnalysisSummary | None
    review_reasons: tuple[str, ...]


@dataclass(frozen=True)
class UnitStatusMetrics:
    counts: dict[str, int]
    units: tuple[UnitStatusProjection, ...]
    incomplete: bool


def _id_query(template: str, identifiers: Sequence[int]) -> tuple[str, tuple[int, ...]]:
    values = tuple(identifiers)
    if not values or len(values) > UNIT_STATUS_COHORT_CAP:
        raise ValueError("One to 500 bounded identifiers are required")
    placeholders = ", ".join("?" for _ in values)
    return template.format(placeholders=placeholders), values


def build_unit_status_queries(
    assignment_ids: Sequence[int], analysis_ids: Sequence[int] = ()
) -> tuple[tuple[str, tuple[int, ...]], ...]:
    queries = tuple(
        _id_query(template, assignment_ids)
        for template in (
            _RUNS_PREFIX,
            _MEASUREMENTS_PREFIX,
            _CHANNEL_MAP_PREFIX,
            _REPLACEMENTS_PREFIX,
            _ANALYSES_PREFIX,
        )
    )
    if analysis_ids:
        queries += (_id_query(_RECOMMENDATIONS_PREFIX, analysis_ids),)
    return queries


def _utc(value: object) -> datetime:
    if not isinstance(value, datetime):
        raise ReportingError("schema_incompatible")
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _positive_int(value: object) -> int:
    if type(value) is not int or value <= 0:
        raise ReportingError("schema_incompatible")
    return value


def _optional_positive_int(value: object) -> int | None:
    return None if value is None else _positive_int(value)


def _decimal(value: object) -> Decimal:
    try:
        result = Decimal(value).quantize(Decimal("0.0001"))
    except (InvalidOperation, TypeError, ValueError):
        raise ReportingError("schema_incompatible") from None
    if not result.is_finite():
        raise ReportingError("schema_incompatible")
    return result


def _bit(value: object) -> bool:
    if type(value) not in {bool, int} or int(value) not in {0, 1}:
        raise ReportingError("schema_incompatible")
    return bool(value)


def _unit_status_limits(raw: object, mode: str) -> dict | None:
    limits = parse_limit_snapshot(raw, mode)
    if limits is None:
        return None
    try:
        values = json.loads(raw)
        minimum = Decimal(str(values.get("minimum_replacement_improvement_db", 0.2)))
    except (AttributeError, InvalidOperation, TypeError, ValueError, json.JSONDecodeError):
        return None
    if not minimum.is_finite() or not Decimal("0") <= minimum <= Decimal("100"):
        return None
    return limits | {"minimum_replacement_improvement_db": minimum}


def _run_key(run: ProjectionRun) -> tuple[datetime, int]:
    return run.run_started_at_utc, run.run_id


def _measurement_key(item: ProjectionMeasurement) -> tuple[datetime, int, int]:
    return item.written_at_utc, item.attempt_number, item.measurement_id


def _criteria_signature(run: ProjectionRun) -> tuple | None:
    if run.limits is None:
        return None
    return tuple(
        run.limits.get(key)
        for key in (
            "model",
            "wavelength_mode",
            "too_good_below_db",
            "warning_enabled",
            "warning_above_db",
            "fail_above_db",
            "minimum_replacement_improvement_db",
        )
    )


def _compatible_run(context: ProjectionRun, candidate: ProjectionRun) -> str | None:
    if candidate.assignment_id != context.assignment_id:
        return "different assignment"
    if _run_key(candidate) > _run_key(context):
        return "later than context run"
    if candidate.analysis_status == "excluded":
        return "voided"
    if candidate.analysis_status == "superseded" or candidate.superseded_by_run_id:
        return "superseded"
    if candidate.wavelength_mode != context.wavelength_mode:
        return "different wavelength mode"
    if candidate.front_panel_channel_count != context.front_panel_channel_count:
        return "different front-panel channel count"
    if _criteria_signature(candidate) != _criteria_signature(context):
        return "incompatible criteria"
    candidate_model = str((candidate.limits or {}).get("model") or "")
    context_model = str((context.limits or {}).get("model") or "")
    if candidate_model != context_model:
        return "different switch model"
    return None


def _analysis_summary(
    analysis: LatestAnalysis | None,
    readings: Sequence[ProjectionMeasurement],
    replacements: Sequence[ProjectionReplacement],
) -> AnalysisSummary | None:
    if analysis is None:
        return None
    newest_evidence = [item.written_at_utc for item in readings]
    newest_evidence.extend(item.replaced_at_utc for item in replacements)
    current = not newest_evidence or analysis.analyzed_at_utc >= max(newest_evidence)
    return AnalysisSummary(
        analysis_id=analysis.analysis_id,
        result_status=analysis.result_status,
        analyzed_at_utc=analysis.analyzed_at_utc,
        current=current,
        unused_recommendations=analysis.unused_recommendations,
    )


def project_unit_status(
    assignment: CohortAssignment,
    runs: Sequence[ProjectionRun],
    measurements: Sequence[ProjectionMeasurement],
    channel_map: dict[int, int],
    replacements: Sequence[ProjectionReplacement],
    latest_analysis: LatestAnalysis | None,
) -> UnitStatusProjection:
    """Mirror the source effective projection and classify one active assignment."""
    eligible_contexts = [
        run
        for run in runs
        if run.assignment_id == assignment.assignment_id
        and run.analysis_status not in {"excluded", "superseded"}
        and run.superseded_by_run_id is None
    ]
    context = max(eligible_contexts, key=_run_key, default=None)
    if context is None:
        return UnitStatusProjection(
            unit_id=assignment.unit_id,
            main_board_serial=assignment.main_board_serial,
            assignment_id=assignment.assignment_id,
            switch_serial=assignment.switch_serial,
            switch_model=assignment.switch_model,
            context_run_id=None,
            channel_count=None,
            status="review_required",
            failing_channels=(),
            latest_analysis=_analysis_summary(latest_analysis, (), replacements),
            review_reasons=("No eligible context run is available.",),
        )

    review: list[str] = []
    if context.front_panel_channel_count is None or context.front_panel_channel_count <= 0:
        review.append("The context run has no valid front-panel channel count.")
        context_channel_count = None
        channel_count = 0
    else:
        context_channel_count = context.front_panel_channel_count
        channel_count = context_channel_count
    if context.limits is None:
        review.append("The context run has invalid or missing saved limits.")

    included = tuple(run for run in runs if _compatible_run(context, run) is None)
    included_ids = {run.run_id for run in included}
    expected_pair = (1310, 1550) if context.wavelength_mode == "SM" else (850, 1300)
    candidates: list[ProjectionMeasurement] = []
    for item in measurements:
        if item.run_id not in included_ids:
            continue
        if (item.wavelength_1_nm, item.wavelength_2_nm) != expected_pair:
            review.append(f"Measurement {item.measurement_id} uses incompatible wavelengths.")
            continue
        candidates.append(item)

    eligible_replacements = [
        item
        for item in replacements
        if item.assignment_id == assignment.assignment_id
        and (item.related_run_id is None or item.related_run_id in included_ids)
    ]
    effective_map = {int(logical): int(port) for logical, port in channel_map.items()}
    latest_replacement_by_channel: dict[int, ProjectionReplacement] = {}
    for item in sorted(
        eligible_replacements, key=lambda value: (value.replaced_at_utc, value.replacement_id)
    ):
        latest_replacement_by_channel[item.logical_channel] = item
        effective_map[item.logical_channel] = item.replacement_physical_port

    latest_by_channel: dict[int, ProjectionMeasurement] = {}
    for item in candidates:
        channel = item.logical_channel
        if channel is None or not 1 <= channel <= channel_count:
            continue
        prior = latest_by_channel.get(channel)
        if prior is None or _measurement_key(item) > _measurement_key(prior):
            latest_by_channel[channel] = item

    effective_readings: list[ProjectionMeasurement] = []
    effective_ports: dict[int, int] = {}
    used_ports: dict[int, int] = {}
    for channel in range(1, channel_count + 1):
        item = latest_by_channel.get(channel)
        if item is None:
            continue
        expected_port = effective_map.get(channel, channel)
        if item.physical_port != expected_port:
            replacement_row = latest_replacement_by_channel.get(channel)
            before_latest_change = (
                replacement_row is not None
                and replacement_row.replacement_physical_port == expected_port
                and item.written_at_utc <= replacement_row.replaced_at_utc
            )
            if not before_latest_change:
                review.append(
                    f"Logical channel {channel} newest measurement uses physical port "
                    f"{item.physical_port}; expected {expected_port}."
                )
            continue
        other = used_ports.get(expected_port)
        if other is not None and other != channel:
            review.append(
                f"Physical port {expected_port} is mapped to logical channels "
                f"{other} and {channel}."
            )
            continue
        used_ports[expected_port] = channel
        effective_ports[channel] = expected_port
        effective_readings.append(item)

    selected_channels = {item.logical_channel for item in effective_readings}
    missing = [
        channel for channel in range(1, channel_count + 1) if channel not in selected_channels
    ]
    failing_channels: list[FailingChannel] = []
    if context.limits is not None:
        for item in effective_readings:
            classification = classify_losses(
                item.wavelength_1_il_db, item.wavelength_2_il_db, context.limits
            )
            if classification == "too_good":
                review.append(f"Logical channel {item.logical_channel} has a too-good reading.")
            elif classification == "unknown":
                review.append(f"Logical channel {item.logical_channel} could not be classified.")
            elif classification == "fail":
                failing_channels.append(
                    FailingChannel(
                        logical_channel=int(item.logical_channel),
                        effective_port=effective_ports[int(item.logical_channel)],
                        wavelength_1_il_db=item.wavelength_1_il_db,
                        wavelength_2_il_db=item.wavelength_2_il_db,
                    )
                )

    analysis = _analysis_summary(latest_analysis, effective_readings, replacements)
    if review:
        status: UnitStatus = "review_required"
    elif missing:
        status = "not_evaluated"
    elif not failing_channels:
        status = "passing"
    elif analysis is None or not analysis.current:
        status = "failing_needs_analysis"
    elif analysis.unused_recommendations:
        status = "failing_recovery_available"
    else:
        status = "failing_no_measured_recovery"

    return UnitStatusProjection(
        unit_id=assignment.unit_id,
        main_board_serial=assignment.main_board_serial,
        assignment_id=assignment.assignment_id,
        switch_serial=assignment.switch_serial,
        switch_model=assignment.switch_model,
        context_run_id=context.run_id,
        channel_count=context_channel_count,
        status=status,
        failing_channels=tuple(sorted(failing_channels, key=lambda item: item.logical_channel)),
        latest_analysis=analysis,
        review_reasons=tuple(dict.fromkeys(review)),
    )


def _cohort_params(query: UnitStatusQuery, window: ActivityWindow) -> tuple:
    purposes = [purpose.value for purpose in query.purposes]
    purposes.extend([purposes[0]] * (_PURPOSE_SLOTS - len(purposes)))
    return window.start_utc, window.end_utc, *purposes


def _bounded(cursor, query: tuple[str, tuple], cap: int) -> tuple[list, bool]:
    rows = cursor.execute(*query).fetchmany(cap + 1)
    return list(rows[:cap]), len(rows) > cap


def read_unit_status_projections(
    cursor, cohorts: Sequence[CohortAssignment]
) -> tuple[tuple[UnitStatusProjection, ...], bool]:
    """Read and project the shared D16 evidence for an already bounded cohort."""
    if not cohorts:
        return (), False
    assignment_ids = tuple(item.assignment_id for item in cohorts)
    run_query, measurement_query, map_query, replacement_query, analysis_query = (
        build_unit_status_queries(assignment_ids)
    )
    run_rows, run_incomplete = _bounded(cursor, run_query, UNIT_STATUS_RUN_CAP)
    measurement_rows, measurement_incomplete = _bounded(
        cursor, measurement_query, UNIT_STATUS_MEASUREMENT_CAP
    )
    map_rows, map_incomplete = _bounded(cursor, map_query, UNIT_STATUS_HARDWARE_CAP)
    replacement_rows, replacement_incomplete = _bounded(
        cursor, replacement_query, UNIT_STATUS_HARDWARE_CAP
    )
    analysis_rows, analysis_incomplete = _bounded(cursor, analysis_query, UNIT_STATUS_ANALYSIS_CAP)
    incomplete = any(
        (
            run_incomplete,
            measurement_incomplete,
            map_incomplete,
            replacement_incomplete,
            analysis_incomplete,
        )
    )

    runs_by_assignment: dict[int, list[ProjectionRun]] = defaultdict(list)
    for row in run_rows:
        if (
            len(row) != 8
            or row[3] not in {"SM", "MM"}
            or row[5]
            not in {
                "pending",
                "included",
                "excluded",
                "superseded",
            }
        ):
            raise ReportingError("schema_incompatible")
        assignment_id = _positive_int(row[1])
        runs_by_assignment[assignment_id].append(
            ProjectionRun(
                run_id=_positive_int(row[0]),
                assignment_id=assignment_id,
                run_started_at_utc=_utc(row[2]),
                wavelength_mode=row[3],
                front_panel_channel_count=_optional_positive_int(row[4]),
                analysis_status=row[5],
                superseded_by_run_id=_optional_positive_int(row[6]),
                limits=_unit_status_limits(row[7], row[3]),
            )
        )

    measurements_by_assignment: dict[int, list[ProjectionMeasurement]] = defaultdict(list)
    for row in measurement_rows:
        if len(row) != 11:
            raise ReportingError("schema_incompatible")
        assignment_id = _positive_int(row[1])
        measurements_by_assignment[assignment_id].append(
            ProjectionMeasurement(
                measurement_id=_positive_int(row[0]),
                assignment_id=assignment_id,
                run_id=_positive_int(row[2]),
                logical_channel=_optional_positive_int(row[3]),
                physical_port=_positive_int(row[4]),
                attempt_number=_positive_int(row[5]),
                wavelength_1_nm=_positive_int(row[6]),
                wavelength_1_il_db=_decimal(row[7]),
                wavelength_2_nm=_positive_int(row[8]),
                wavelength_2_il_db=_decimal(row[9]),
                written_at_utc=_utc(row[10]),
            )
        )

    maps_by_assignment: dict[int, dict[int, int]] = defaultdict(dict)
    for row in map_rows:
        if len(row) != 3:
            raise ReportingError("schema_incompatible")
        assignment_id = _positive_int(row[0])
        logical = _optional_positive_int(row[1])
        physical = _optional_positive_int(row[2])
        if logical is not None and physical is not None:
            maps_by_assignment[assignment_id][logical] = physical

    replacements_by_assignment: dict[int, list[ProjectionReplacement]] = defaultdict(list)
    for row in replacement_rows:
        if len(row) != 6:
            raise ReportingError("schema_incompatible")
        assignment_id = _positive_int(row[1])
        replacements_by_assignment[assignment_id].append(
            ProjectionReplacement(
                replacement_id=_positive_int(row[0]),
                assignment_id=assignment_id,
                logical_channel=_positive_int(row[2]),
                replacement_physical_port=_positive_int(row[3]),
                replaced_at_utc=_utc(row[4]),
                related_run_id=_optional_positive_int(row[5]),
            )
        )

    analyses_by_assignment: dict[int, LatestAnalysis] = {}
    analyses_by_id: dict[int, int] = {}
    for row in analysis_rows:
        if len(row) != 4:
            raise ReportingError("schema_incompatible")
        analysis_id = _positive_int(row[0])
        assignment_id = _positive_int(row[1])
        analyses_by_assignment[assignment_id] = LatestAnalysis(
            analysis_id=analysis_id,
            result_status=str(row[2]),
            analyzed_at_utc=_utc(row[3]),
        )
        analyses_by_id[analysis_id] = assignment_id

    if analyses_by_id:
        recommendation_query = build_unit_status_queries(assignment_ids, tuple(analyses_by_id))[-1]
        recommendation_rows, recommendations_incomplete = _bounded(
            cursor, recommendation_query, UNIT_STATUS_RECOMMENDATION_CAP
        )
        incomplete = incomplete or recommendations_incomplete
        unused = Counter()
        for row in recommendation_rows:
            if len(row) != 3 or _positive_int(row[1]) not in analyses_by_id:
                raise ReportingError("schema_incompatible")
            _positive_int(row[0])
            if not _bit(row[2]):
                unused[_positive_int(row[1])] += 1
        for assignment_id, analysis in tuple(analyses_by_assignment.items()):
            analyses_by_assignment[assignment_id] = replace(
                analysis, unused_recommendations=unused[analysis.analysis_id]
            )

    projections = tuple(
        project_unit_status(
            cohort,
            runs_by_assignment[cohort.assignment_id],
            measurements_by_assignment[cohort.assignment_id],
            maps_by_assignment[cohort.assignment_id],
            replacements_by_assignment[cohort.assignment_id],
            analyses_by_assignment.get(cohort.assignment_id),
        )
        for cohort in cohorts
    )
    return projections, incomplete


def read_unit_status(cursor, query: UnitStatusQuery, window: ActivityWindow) -> UnitStatusMetrics:
    cohort_rows = cursor.execute(COHORT_SQL, _cohort_params(query, window)).fetchmany(
        UNIT_STATUS_COHORT_CAP + 1
    )
    incomplete = len(cohort_rows) > UNIT_STATUS_COHORT_CAP
    cohorts: list[CohortAssignment] = []
    for row in cohort_rows[:UNIT_STATUS_COHORT_CAP]:
        if len(row) != 6:
            raise ReportingError("schema_incompatible")
        _utc(row[5])
        cohorts.append(
            CohortAssignment(
                _positive_int(row[0]),
                _positive_int(row[1]),
                str(row[2]),
                str(row[3]),
                str(row[4]),
            )
        )
    projections, projection_incomplete = read_unit_status_projections(cursor, cohorts)
    incomplete = incomplete or projection_incomplete
    counts = Counter(item.status for item in projections)
    response_counts = {"cohort_units": len(projections)}
    response_counts.update({key: counts[key] for key in UNIT_STATUS_KEYS})
    priority = {
        "failing_no_measured_recovery": 0,
        "failing_needs_analysis": 1,
        "failing_recovery_available": 2,
        "review_required": 3,
        "not_evaluated": 4,
        "passing": 5,
    }
    ordered = tuple(sorted(projections, key=lambda item: (priority[item.status], item.unit_id)))
    return UnitStatusMetrics(response_counts, ordered, incomplete)
