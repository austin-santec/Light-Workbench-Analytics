"""Bounded, read-only unit/run explorer queries and row adapters."""

import json
import math
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from app.reporting.adapter import ReportingError

UNIT_SEARCH_LIMIT = 20
UNIT_ASSIGNMENT_CAP = 500
UNIT_RUN_CAP = 200
RUN_CHANNEL_ROW_CAP = 5000
HARDWARE_LIST_CAP = 500
HARDWARE_ANALYSIS_CAP = 200
HARDWARE_RECOMMENDATION_CAP = 2000
STRICT_CLASSIFICATION_RULE = "strict >, run limit snapshot"

SEARCH_UNITS_SQL = """
SELECT TOP (21) u.unit_id, u.main_board_serial, u.part_number, u.unit_model,
    current_switch.switch_serial, current_switch.switch_model,
    last_run.run_started_at_utc, run_totals.run_count
FROM dbo.UNITS AS u
OUTER APPLY (
    SELECT TOP (1) s.switch_serial, s.switch_model
    FROM dbo.UNIT_SWITCH_ASSIGNMENTS AS a
    JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
    WHERE a.unit_id = u.unit_id AND a.removed_at_utc IS NULL
    ORDER BY a.installed_at_utc DESC, a.assignment_id DESC
) AS current_switch
OUTER APPLY (
    SELECT TOP (1) r.run_started_at_utc
    FROM dbo.IL_RUNS AS r
    JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
    WHERE a.unit_id = u.unit_id
    ORDER BY r.run_started_at_utc DESC, r.run_id DESC
) AS last_run
CROSS APPLY (
    SELECT COUNT_BIG(*) AS run_count
    FROM dbo.IL_RUNS AS r
    JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
    WHERE a.unit_id = u.unit_id
) AS run_totals
WHERE UPPER(u.main_board_serial) LIKE UPPER(?) ESCAPE '~'
    OR EXISTS (
        SELECT 1
        FROM dbo.UNIT_SWITCH_ASSIGNMENTS AS matching_assignment
        JOIN dbo.SWITCHES AS matching_switch
            ON matching_switch.switch_id = matching_assignment.switch_id
        WHERE matching_assignment.unit_id = u.unit_id
            AND UPPER(matching_switch.switch_serial) LIKE UPPER(?) ESCAPE '~'
    )
ORDER BY CASE WHEN last_run.run_started_at_utc IS NULL THEN 1 ELSE 0 END,
    last_run.run_started_at_utc DESC, u.unit_id DESC
"""

UNIT_SQL = """
SELECT TOP (1) u.unit_id, u.main_board_serial, u.part_number, u.unit_model,
    u.front_panel_channel_count, u.created_at_utc, u.updated_at_utc
FROM dbo.UNITS AS u
WHERE u.unit_id = ?
"""

UNIT_ASSIGNMENTS_SQL = """
SELECT TOP (501) a.assignment_id, s.switch_serial, s.switch_model,
    s.firmware_version, a.installed_at_utc, a.installed_by,
    a.removed_at_utc, a.removed_by, a.removal_reason
FROM dbo.UNIT_SWITCH_ASSIGNMENTS AS a
JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
WHERE a.unit_id = ?
ORDER BY a.installed_at_utc DESC, a.assignment_id DESC
"""

UNIT_RUNS_SQL = """
SELECT TOP (201) r.run_id, r.assignment_id, r.run_number,
    r.run_started_at_utc, r.run_ended_at_utc, r.tested_by, r.station_number,
    r.wavelength_mode, r.operating_band, r.front_panel_channel_count,
    r.part_number_snapshot, r.application_version, r.completion_status,
    r.run_purpose, r.analysis_status, r.superseded_by_run_id,
    r.void_info_json, r.limit_snapshot_json,
    timing.timing_quality, timing.active_test_ms, timing.elapsed_ms,
    timing.stopped_ms, timing.timing_session_count,
    measurement_counts.logical_channels_measured,
    measurement_counts.failing_channels,
    measurement_counts.warning_channels,
    measurement_counts.extra_candidates_measured
FROM dbo.IL_RUNS AS r
JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
JOIN dbo.vw_RunTimingSummary AS timing ON timing.run_id = r.run_id
-- JSON_VALUE raises on malformed JSON, so guard with ISJSON; Python then reports
-- limits/counts as null for that run instead of failing the whole unit.
CROSS APPLY (
    SELECT
        TRY_CONVERT(DECIMAL(9,4), CASE WHEN ISJSON(r.limit_snapshot_json) = 1
            THEN JSON_VALUE(r.limit_snapshot_json, '$.fail_above_db') END) AS fail_db,
        TRY_CONVERT(DECIMAL(9,4), CASE WHEN ISJSON(r.limit_snapshot_json) = 1
            THEN JSON_VALUE(r.limit_snapshot_json, '$.too_good_below_db') END) AS too_good_db,
        TRY_CONVERT(DECIMAL(9,4), CASE WHEN ISJSON(r.limit_snapshot_json) = 1
            THEN JSON_VALUE(r.limit_snapshot_json, '$.warning_above_db') END) AS warning_db,
        CASE WHEN ISJSON(r.limit_snapshot_json) = 1
            AND LOWER(JSON_VALUE(r.limit_snapshot_json, '$.warning_enabled'))
                IN ('1', 'true', 'yes', 'on')
            THEN 1 ELSE 0 END AS warning_enabled
) AS limits
-- SQL Server rejects aggregates that mix outer (run) and inner columns (error 8124),
-- so classify each current measurement in a derived table and aggregate only flags.
OUTER APPLY (
    SELECT
        COUNT_BIG(CASE WHEN flags.is_logical = 1 THEN 1 END) AS logical_channels_measured,
        COALESCE(SUM(flags.is_fail), CONVERT(BIGINT, 0)) AS failing_channels,
        COALESCE(SUM(flags.is_warning), CONVERT(BIGINT, 0)) AS warning_channels,
        COUNT_BIG(CASE WHEN flags.is_extra = 1 THEN 1 END) AS extra_candidates_measured
    FROM (
        SELECT
            CASE WHEN m.measurement_role = 'logical_channel' THEN 1 ELSE 0 END AS is_logical,
            CASE WHEN m.measurement_role = 'extra_candidate' THEN 1 ELSE 0 END AS is_extra,
            CASE WHEN m.measurement_role = 'logical_channel'
                AND (m.wavelength_1_il_db > limits.fail_db
                    OR m.wavelength_2_il_db > limits.fail_db)
                THEN CONVERT(BIGINT, 1) ELSE CONVERT(BIGINT, 0) END AS is_fail,
            CASE WHEN m.measurement_role = 'logical_channel'
                AND limits.warning_enabled = 1
                AND m.wavelength_1_il_db <= limits.fail_db
                AND m.wavelength_2_il_db <= limits.fail_db
                AND m.wavelength_1_il_db >= limits.too_good_db
                AND m.wavelength_2_il_db >= limits.too_good_db
                AND (m.wavelength_1_il_db > limits.warning_db
                    OR m.wavelength_2_il_db > limits.warning_db)
                THEN CONVERT(BIGINT, 1) ELSE CONVERT(BIGINT, 0) END AS is_warning
        FROM dbo.vw_CurrentILMeasurements AS m
        WHERE m.run_id = r.run_id
    ) AS flags
) AS measurement_counts
WHERE a.unit_id = ?
ORDER BY r.run_started_at_utc DESC, r.run_id DESC
"""

RUN_SQL = """
SELECT TOP (1) r.run_id, r.wavelength_mode, r.limit_snapshot_json
FROM dbo.IL_RUNS AS r
WHERE r.run_id = ?
"""

RUN_CHANNELS_SQL = """
SELECT TOP (5001) measurement.measurement_id, measurement.logical_channel,
    measurement.physical_port, measurement.attempt_number,
    measurement.wavelength_1_nm, measurement.wavelength_1_il_db,
    measurement.wavelength_2_nm, measurement.wavelength_2_il_db,
    measurement.written_at_utc, measurement.written_by,
    CASE WHEN current_measurement.measurement_id IS NULL
        THEN CONVERT(BIT, 0) ELSE CONVERT(BIT, 1) END AS is_current,
    measurement.measurement_role
FROM dbo.IL_MEASUREMENTS AS measurement
LEFT JOIN dbo.vw_CurrentILMeasurements AS current_measurement
    ON current_measurement.measurement_id = measurement.measurement_id
WHERE measurement.run_id = ?
    AND measurement.measurement_role IN (?, ?)
ORDER BY CASE WHEN measurement.measurement_role = 'logical_channel' THEN 0 ELSE 1 END,
    CASE WHEN measurement.measurement_role = 'logical_channel'
        THEN measurement.logical_channel ELSE measurement.physical_port END,
    measurement.attempt_number, measurement.measurement_id
"""

ASSIGNMENT_SQL = """
SELECT TOP (1) a.assignment_id
FROM dbo.UNIT_SWITCH_ASSIGNMENTS AS a
WHERE a.assignment_id = ?
"""

CHANNEL_MAP_SQL = """
SELECT TOP (501) channel_map.logical_channel, channel_map.initial_physical_port,
    channel_map.effective_physical_port, channel_map.is_replaced,
    channel_map.latest_replaced_at_utc
FROM dbo.vw_CurrentChannelMap AS channel_map
WHERE channel_map.assignment_id = ?
ORDER BY channel_map.logical_channel
"""

REPLACEMENTS_SQL = """
SELECT TOP (501) replacement.replacement_id, replacement.logical_channel,
    replacement.previous_physical_port, replacement.replacement_physical_port,
    replacement.reason, replacement.replaced_by, replacement.replaced_at_utc,
    replacement.related_run_id, replacement.source_recommendation_id,
    replacement.notes
FROM dbo.CHANNEL_REPLACEMENTS AS replacement
WHERE replacement.assignment_id = ?
ORDER BY replacement.replaced_at_utc, replacement.replacement_id
"""

EXTRA_PORTS_SQL = """
SELECT TOP (501) extra.physical_port, extra.wavelength_1_nm,
    extra.wavelength_1_il_db, extra.wavelength_2_nm,
    extra.wavelength_2_il_db, extra.attempt_number, extra.run_id,
    extra.written_at_utc, extra.analysis_status
FROM dbo.vw_ConfirmedExtraPorts AS extra
WHERE extra.assignment_id = ?
ORDER BY extra.physical_port
"""

SPARES_SQL = """
SELECT TOP (501) latest.spare_event_id, latest.physical_port, latest.action,
    latest.recorded_by, latest.recorded_at_utc
FROM (
    SELECT spare.spare_event_id, spare.physical_port, spare.action,
        spare.recorded_by, spare.recorded_at_utc,
        ROW_NUMBER() OVER (
            PARTITION BY spare.physical_port
            ORDER BY spare.recorded_at_utc DESC, spare.spare_event_id DESC
        ) AS event_rank
    FROM dbo.DESIGNATED_SPARES AS spare
    WHERE spare.assignment_id = ?
) AS latest
WHERE latest.event_rank = 1
ORDER BY latest.physical_port
"""

ANALYSES_SQL = """
SELECT TOP (201) analysis.analysis_id, analysis.run_id,
    analysis.analyzed_at_utc, analysis.analyzed_by, analysis.result_status
FROM dbo.REPLACEMENT_ANALYSES AS analysis
JOIN dbo.IL_RUNS AS run ON run.run_id = analysis.run_id
WHERE run.assignment_id = ?
ORDER BY analysis.analyzed_at_utc DESC, analysis.analysis_id DESC
"""

_RECOMMENDATION_SQL_PREFIX = """
SELECT TOP (2001) recommendation.recommendation_id,
    recommendation.analysis_id, recommendation.recommendation_rank,
    recommendation.category, recommendation.logical_channel,
    recommendation.current_physical_port,
    recommendation.candidate_physical_port,
    recommendation.current_wavelength_1_il_db,
    recommendation.current_wavelength_2_il_db,
    recommendation.candidate_wavelength_1_il_db,
    recommendation.candidate_wavelength_2_il_db,
    recommendation.current_worst_loss_db,
    recommendation.candidate_worst_loss_db,
    recommendation.improvement_db,
    CASE WHEN replacement.replacement_id IS NULL
        THEN CONVERT(BIT, 0) ELSE CONVERT(BIT, 1) END AS used
FROM dbo.REPLACEMENT_ANALYSIS_RECOMMENDATIONS AS recommendation
JOIN dbo.REPLACEMENT_ANALYSES AS analysis
    ON analysis.analysis_id = recommendation.analysis_id
LEFT JOIN dbo.CHANNEL_REPLACEMENTS AS replacement
    ON replacement.source_recommendation_id = recommendation.recommendation_id
"""


def build_recommendations_query(analysis_ids: tuple[int, ...]) -> tuple[str, tuple[int, ...]]:
    placeholders = ", ".join("?" for _ in analysis_ids)
    sql = (
        _RECOMMENDATION_SQL_PREFIX
        + f" WHERE recommendation.analysis_id IN ({placeholders})"
        + " ORDER BY analysis.analyzed_at_utc DESC, analysis.analysis_id DESC,"
        + " recommendation.recommendation_rank,"
        + " recommendation.recommendation_id"
    )
    return sql, analysis_ids


def escape_like(value: str) -> str:
    escaped = value.replace("~", "~~").replace("%", "~%").replace("_", "~_")
    escaped = escaped.replace("[", "~[")
    return f"%{escaped}%"


def _utc(value) -> datetime:
    if not isinstance(value, datetime):
        raise ReportingError("schema_incompatible")
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _utc_or_none(value) -> datetime | None:
    return None if value is None else _utc(value)


def _nonnegative_int(value) -> int:
    if type(value) is not int or value < 0:
        raise ReportingError("schema_incompatible")
    return value


def _positive_int(value) -> int:
    value = _nonnegative_int(value)
    if value == 0:
        raise ReportingError("schema_incompatible")
    return value


def _optional_positive_int(value) -> int | None:
    return None if value is None else _positive_int(value)


def _enum(value, allowed: set[str]) -> str:
    if value not in allowed:
        raise ReportingError("schema_incompatible")
    return value


def _bit(value) -> bool:
    if type(value) not in {int, bool} or int(value) not in {0, 1}:
        raise ReportingError("schema_incompatible")
    return bool(value)


def _decimal(value) -> Decimal:
    try:
        decimal = Decimal(value).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        raise ReportingError("schema_incompatible") from None
    if not decimal.is_finite():
        raise ReportingError("schema_incompatible")
    return decimal


def _normalize_model(value: object) -> str:
    text = str(value or "").strip().upper().replace("_", "-")
    compact = text.replace(" ", "")
    if compact in {"OSX100", "OSX-100"} or "OSX-100" in text or "OSX100" in compact:
        return "OSX-100"
    if compact in {"OSX150", "OSX-150"} or "OSX-150" in text or "OSX150" in compact:
        return "OSX-150"
    return text


def _normalize_mode(value: object) -> str:
    text = str(value or "SM").strip().upper().replace("-", " ")
    return "MM" if text in {"MM", "MULTIMODE", "MULTI MODE"} else "SM"


def parse_limit_snapshot(raw: object, expected_mode: str) -> dict | None:
    try:
        values = json.loads(raw)
        if not isinstance(values, dict):
            return None
        model = _normalize_model(values.get("model", ""))
        mode = _normalize_mode(values.get("wavelength_mode", values.get("mode", "SM")))
        profile_name = str(values.get("profile_name", "")).strip()
        revision = str(values.get("revision", "")).strip()
        too_good = float(values["too_good_below_db"])
        fail = float(values["fail_above_db"])
        minimum_improvement = float(values.get("minimum_replacement_improvement_db", 0.2))
        warning_enabled = values.get("warning_enabled", True)
        if isinstance(warning_enabled, str):
            warning_enabled = warning_enabled.strip().lower() in {"1", "true", "yes", "on"}
        warning_raw = values.get("warning_above_db")
        warning = None if warning_raw in (None, "", "none") else float(warning_raw)
        if model not in {"OSX-100", "OSX-150", "LEGACY"}:
            return None
        if not profile_name or not revision or mode != expected_mode:
            return None
        numeric = [too_good, fail, minimum_improvement]
        if any(not math.isfinite(item) for item in numeric):
            return None
        if not -100 <= too_good <= 100 or not -100 <= fail <= 100:
            return None
        if not 0 <= minimum_improvement <= 100:
            return None
        if model != "LEGACY" and too_good >= fail:
            return None
        if bool(warning_enabled):
            if model == "OSX-100" or warning is None or not math.isfinite(warning):
                return None
            if not -100 <= warning <= 100:
                return None
            if model != "LEGACY" and warning >= fail:
                return None
        elif model == "OSX-150":
            return None
        return {
            "model": model,
            "wavelength_mode": mode,
            "too_good_below_db": _decimal(str(too_good)),
            "warning_enabled": bool(warning_enabled),
            "warning_above_db": None if warning is None else _decimal(str(warning)),
            "fail_above_db": _decimal(str(fail)),
        }
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def parse_void_info(raw: object) -> dict | None:
    if raw is None:
        return None
    try:
        values = json.loads(raw)
        if not isinstance(values, dict):
            return None
        timestamp = datetime.fromisoformat(str(values["voided_at_utc"]).replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            return None
        voided_by = str(values["voided_by"]).strip()
        reason = str(values["reason"]).strip()
        if not voided_by or not reason:
            return None
        return {
            "voided_at_utc": timestamp.astimezone(UTC),
            "voided_by": voided_by,
            "reason": reason,
        }
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        return None


def classify_losses(first, second, limits: dict | None) -> str:
    if limits is None:
        return "unknown"
    first_value = float(first)
    second_value = float(second)
    losses = (first_value, second_value)
    fail = float(limits["fail_above_db"])
    too_good = float(limits["too_good_below_db"])
    warning = limits["warning_above_db"]
    if any(loss > fail for loss in losses):
        return "fail"
    if any(loss < too_good for loss in losses):
        return "too_good"
    if (
        limits["warning_enabled"]
        and warning is not None
        and any(loss > float(warning) and loss <= fail for loss in losses)
    ):
        return "warning"
    return "pass"


def search_units(cursor, text: str) -> dict:
    pattern = escape_like(text)
    rows = cursor.execute(SEARCH_UNITS_SQL, (pattern, pattern)).fetchmany(UNIT_SEARCH_LIMIT + 1)
    items = []
    for row in rows[:UNIT_SEARCH_LIMIT]:
        if len(row) != 8:
            raise ReportingError("schema_incompatible")
        items.append(
            {
                "unit_id": _positive_int(row[0]),
                "main_board_serial": row[1],
                "part_number": row[2],
                "unit_model": row[3],
                "current_switch_serial": row[4],
                "current_switch_model": row[5],
                "last_run_started_at_utc": _utc_or_none(row[6]),
                "run_count": _nonnegative_int(row[7]),
            }
        )
    return {"items": items, "has_more": len(rows) > UNIT_SEARCH_LIMIT}


def _unit_run(row: tuple) -> dict:
    if len(row) != 27:
        raise ReportingError("schema_incompatible")
    limits = parse_limit_snapshot(row[17], row[7])
    quality = row[18]
    if quality not in {
        "confirmed",
        "checkpoint_estimate",
        "partial",
        "provisional",
        "unavailable",
    }:
        raise ReportingError("schema_incompatible")
    elapsed_ms = _nonnegative_int(row[20])
    active_ms = None if row[19] is None else _nonnegative_int(row[19])
    stopped_ms = None if row[21] is None else _nonnegative_int(row[21])
    logical_count = _nonnegative_int(row[23])
    extra_count = _nonnegative_int(row[26])
    if limits is None:
        failing_count = warning_count = None
    else:
        failing_count = _nonnegative_int(row[24])
        warning_count = 0 if not limits["warning_enabled"] else _nonnegative_int(row[25])
    return {
        "run_id": _positive_int(row[0]),
        "assignment_id": _positive_int(row[1]),
        "run_number": _positive_int(row[2]),
        "run_started_at_utc": _utc(row[3]),
        "run_ended_at_utc": _utc_or_none(row[4]),
        "tested_by": row[5],
        "station_number": _optional_positive_int(row[6]),
        "wavelength_mode": _enum(row[7], {"SM", "MM"}),
        "operating_band": row[8],
        "front_panel_channel_count": _optional_positive_int(row[9]),
        "part_number_snapshot": row[10],
        "application_version": row[11],
        "completion_status": _enum(row[12], {"in_progress", "complete", "stopped", "failed"}),
        "run_purpose": _enum(row[13], {"production", "engineering", "training", "calibration"}),
        "analysis_status": _enum(row[14], {"pending", "included", "excluded", "superseded"}),
        "superseded_by_run_id": _optional_positive_int(row[15]),
        "void_info": parse_void_info(row[16]),
        "limits": limits,
        "timing": {
            "quality": quality,
            "active_seconds": None if active_ms is None else active_ms / 1000,
            "elapsed_seconds": elapsed_ms / 1000,
            "stopped_seconds": None if stopped_ms is None else stopped_ms / 1000,
            "session_count": _nonnegative_int(row[22]),
        },
        "counts": {
            "logical_channels_measured": logical_count,
            "failing_channels": failing_count,
            "warning_channels": warning_count,
            "extra_candidates_measured": extra_count,
        },
    }


def get_unit_detail(cursor, unit_id: int) -> dict | None:
    unit_row = cursor.execute(UNIT_SQL, (unit_id,)).fetchone()
    if unit_row is None:
        return None
    if len(unit_row) != 7:
        raise ReportingError("schema_incompatible")
    unit = {
        "unit_id": _positive_int(unit_row[0]),
        "main_board_serial": unit_row[1],
        "part_number": unit_row[2],
        "unit_model": unit_row[3],
        "front_panel_channel_count": _optional_positive_int(unit_row[4]),
        "created_at_utc": _utc(unit_row[5]),
        "updated_at_utc": _utc(unit_row[6]),
    }
    assignment_rows = cursor.execute(UNIT_ASSIGNMENTS_SQL, (unit_id,)).fetchmany(
        UNIT_ASSIGNMENT_CAP + 1
    )
    assignments = []
    for row in assignment_rows[:UNIT_ASSIGNMENT_CAP]:
        if len(row) != 9:
            raise ReportingError("schema_incompatible")
        assignments.append(
            {
                "assignment_id": _positive_int(row[0]),
                "switch_serial": row[1],
                "switch_model": row[2],
                "firmware_version": row[3],
                "installed_at_utc": _utc(row[4]),
                "installed_by": row[5],
                "removed_at_utc": _utc_or_none(row[6]),
                "removed_by": row[7],
                "removal_reason": row[8],
            }
        )
    run_rows = cursor.execute(UNIT_RUNS_SQL, (unit_id,)).fetchmany(UNIT_RUN_CAP + 1)
    return {
        "unit": unit,
        "assignments": assignments,
        "assignments_incomplete": len(assignment_rows) > UNIT_ASSIGNMENT_CAP,
        "runs": [_unit_run(tuple(row)) for row in run_rows[:UNIT_RUN_CAP]],
        "has_more": len(run_rows) > UNIT_RUN_CAP,
    }


def get_run_channels(cursor, run_id: int) -> dict | None:
    run = cursor.execute(RUN_SQL, (run_id,)).fetchone()
    if run is None:
        return None
    if len(run) != 3 or _positive_int(run[0]) != run_id:
        raise ReportingError("schema_incompatible")
    run_mode = _enum(run[1], {"SM", "MM"})
    limits = parse_limit_snapshot(run[2], run_mode)
    rows = cursor.execute(
        RUN_CHANNELS_SQL,
        (run_id, "logical_channel", "extra_candidate"),
    ).fetchmany(RUN_CHANNEL_ROW_CAP + 1)
    logical_channels = []
    extra_candidates = []
    for row in rows[:RUN_CHANNEL_ROW_CAP]:
        if len(row) != 12 or row[11] not in {"logical_channel", "extra_candidate"}:
            raise ReportingError("schema_incompatible")
        role = row[11]
        logical_channel = _optional_positive_int(row[1])
        if (role == "logical_channel" and logical_channel is None) or (
            role == "extra_candidate" and logical_channel is not None
        ):
            raise ReportingError("schema_incompatible")
        is_current = _bit(row[10])
        classification = classify_losses(row[5], row[7], limits) if is_current else None
        item = {
            "measurement_id": _positive_int(row[0]),
            "logical_channel": logical_channel,
            "physical_port": _positive_int(row[2]),
            "attempt_number": _positive_int(row[3]),
            "wavelength_1_nm": _positive_int(row[4]),
            "wavelength_1_il_db": _decimal(row[5]),
            "wavelength_2_nm": _positive_int(row[6]),
            "wavelength_2_il_db": _decimal(row[7]),
            "written_at_utc": _utc(row[8]),
            "written_by": row[9],
            "is_current": is_current,
            "classification": classification,
            "classification_rule": (
                STRICT_CLASSIFICATION_RULE
                if is_current and limits is not None
                else "unknown, invalid or missing run limit snapshot"
                if is_current
                else None
            ),
        }
        (logical_channels if role == "logical_channel" else extra_candidates).append(item)
    return {
        "run_id": run_id,
        "logical_channels": logical_channels,
        "extra_candidates": extra_candidates,
        "incomplete": len(rows) > RUN_CHANNEL_ROW_CAP,
    }


def _bounded_rows(cursor, sql: str, assignment_id: int, cap: int) -> tuple[list, bool]:
    rows = cursor.execute(sql, (assignment_id,)).fetchmany(cap + 1)
    return rows[:cap], len(rows) > cap


def get_assignment_hardware(cursor, assignment_id: int) -> dict | None:
    exists = cursor.execute(ASSIGNMENT_SQL, (assignment_id,)).fetchone()
    if exists is None:
        return None
    if len(exists) != 1 or _positive_int(exists[0]) != assignment_id:
        raise ReportingError("schema_incompatible")
    channel_rows, channel_incomplete = _bounded_rows(
        cursor, CHANNEL_MAP_SQL, assignment_id, HARDWARE_LIST_CAP
    )
    replacement_rows, replacement_incomplete = _bounded_rows(
        cursor, REPLACEMENTS_SQL, assignment_id, HARDWARE_LIST_CAP
    )
    extra_rows, extra_incomplete = _bounded_rows(
        cursor, EXTRA_PORTS_SQL, assignment_id, HARDWARE_LIST_CAP
    )
    spare_rows, spare_incomplete = _bounded_rows(
        cursor, SPARES_SQL, assignment_id, HARDWARE_LIST_CAP
    )
    analysis_rows, analysis_incomplete = _bounded_rows(
        cursor, ANALYSES_SQL, assignment_id, HARDWARE_ANALYSIS_CAP
    )
    analysis_ids = tuple(_positive_int(row[0]) for row in analysis_rows)
    recommendation_rows = []
    recommendation_incomplete = False
    if analysis_ids:
        sql, params = build_recommendations_query(analysis_ids)
        rows = cursor.execute(sql, params).fetchmany(HARDWARE_RECOMMENDATION_CAP + 1)
        recommendation_rows = rows[:HARDWARE_RECOMMENDATION_CAP]
        recommendation_incomplete = len(rows) > HARDWARE_RECOMMENDATION_CAP

    recommendations_by_analysis = {analysis_id: [] for analysis_id in analysis_ids}
    for row in recommendation_rows:
        if len(row) != 15 or row[1] not in recommendations_by_analysis:
            raise ReportingError("schema_incompatible")
        recommendations_by_analysis[row[1]].append(
            {
                "recommendation_id": _positive_int(row[0]),
                "recommendation_rank": _positive_int(row[2]),
                "category": _enum(row[3], {"required", "optional"}),
                "logical_channel": _positive_int(row[4]),
                "current_physical_port": _positive_int(row[5]),
                "candidate_physical_port": _positive_int(row[6]),
                "current_wavelength_1_il_db": _decimal(row[7]),
                "current_wavelength_2_il_db": _decimal(row[8]),
                "candidate_wavelength_1_il_db": _decimal(row[9]),
                "candidate_wavelength_2_il_db": _decimal(row[10]),
                "current_worst_loss_db": _decimal(row[11]),
                "candidate_worst_loss_db": _decimal(row[12]),
                "improvement_db": _decimal(row[13]),
                "used": _bit(row[14]),
            }
        )

    channel_map = []
    for row in channel_rows:
        if len(row) != 5:
            raise ReportingError("schema_incompatible")
        channel_map.append(
            {
                "logical_channel": _positive_int(row[0]),
                "initial_physical_port": _positive_int(row[1]),
                "effective_physical_port": _positive_int(row[2]),
                "is_replaced": _bit(row[3]),
                "latest_replaced_at_utc": _utc_or_none(row[4]),
            }
        )
    replacements = []
    for row in replacement_rows:
        if len(row) != 10:
            raise ReportingError("schema_incompatible")
        replacements.append(
            {
                "replacement_id": _positive_int(row[0]),
                "logical_channel": _positive_int(row[1]),
                "previous_physical_port": _positive_int(row[2]),
                "replacement_physical_port": _positive_int(row[3]),
                "reason": row[4],
                "replaced_by": row[5],
                "replaced_at_utc": _utc(row[6]),
                "related_run_id": _optional_positive_int(row[7]),
                "source_recommendation_id": _optional_positive_int(row[8]),
                "notes": row[9],
            }
        )
    extra_ports = []
    for row in extra_rows:
        if len(row) != 9:
            raise ReportingError("schema_incompatible")
        extra_ports.append(
            {
                "physical_port": _positive_int(row[0]),
                "wavelength_1_nm": _positive_int(row[1]),
                "wavelength_1_il_db": _decimal(row[2]),
                "wavelength_2_nm": _positive_int(row[3]),
                "wavelength_2_il_db": _decimal(row[4]),
                "attempt_number": _positive_int(row[5]),
                "run_id": _positive_int(row[6]),
                "written_at_utc": _utc(row[7]),
                "analysis_status": _enum(row[8], {"pending", "included", "excluded", "superseded"}),
            }
        )
    spares = []
    for row in spare_rows:
        if len(row) != 5:
            raise ReportingError("schema_incompatible")
        spares.append(
            {
                "spare_event_id": _positive_int(row[0]),
                "physical_port": _positive_int(row[1]),
                "action": _enum(row[2], {"designated", "undesignated"}),
                "recorded_by": row[3],
                "recorded_at_utc": _utc(row[4]),
            }
        )
    analyses = []
    for row in analysis_rows:
        if len(row) != 5:
            raise ReportingError("schema_incompatible")
        analysis_id = _positive_int(row[0])
        analyses.append(
            {
                "analysis_id": analysis_id,
                "run_id": _positive_int(row[1]),
                "analyzed_at_utc": _utc(row[2]),
                "analyzed_by": row[3],
                "result_status": row[4],
                "recommendations": recommendations_by_analysis[analysis_id],
            }
        )
    return {
        "assignment_id": assignment_id,
        "channel_map": channel_map,
        "replacements": replacements,
        "extra_ports": extra_ports,
        "spares": spares,
        "analyses": analyses,
        "incomplete": any(
            (
                channel_incomplete,
                replacement_incomplete,
                extra_incomplete,
                spare_incomplete,
                analysis_incomplete,
                recommendation_incomplete,
            )
        ),
    }
