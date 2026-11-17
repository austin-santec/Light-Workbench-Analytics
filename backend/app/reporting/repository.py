import logging
import math
import re
from dataclasses import dataclass
from datetime import UTC, date, datetime
from datetime import time as datetime_time
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from time import perf_counter
from typing import Protocol
from uuid import UUID

from app.reporting.adapter import ReportingError, SqlServerAdapter, _diagnostic, _error_code
from app.reporting.channel_activity import PERIOD_KEYS, ChannelActivityBoundaries
from app.reporting.console_guard import StatementRejected, validate_console_statement
from app.reporting.models import (
    ChannelActivityCounts,
    ChannelActivityMetrics,
    ChannelActivityQuery,
    ChannelFailureCounts,
    ChannelFailuresMetrics,
    ChannelFailuresQuery,
    CompletionStatus,
    ConfigurationTestTime,
    DurationStatistics,
    FailureRateCounts,
    FailureRateMetrics,
    RecommendationUsageMetrics,
    RecommendationUsageQuery,
    ReplacementActivityCounts,
    ReplacementActivityMetrics,
    ReplacementActivityQuery,
    RunActivityMetrics,
    RunMetadata,
    RunPage,
    RunQuery,
    SampleState,
    StationCounts,
    StationRow,
    StationSecondsPerChannel,
    StationSummaryMetrics,
    StationSummaryQuery,
    StoppedStatistics,
    TestTimeByConfigurationMetrics,
    TimingQuality,
    UnitStatusQuery,
)
from app.reporting.recommendation_usage import read_recommendation_usage
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
    parse_limit_snapshot,
    search_units,
)
from app.reporting.unit_status import UnitStatusMetrics, read_unit_status
from app.schemas import RunPurpose

RUN_ACTIVITY_ROW_CAP = 5000
TEST_TIME_BY_CONFIGURATION_ROW_CAP = 5000
FAILURE_RATE_RUN_CAP = 5000
logger = logging.getLogger("lwa.reporting")


@dataclass(frozen=True)
class ConsoleColumn:
    name: str
    type: str


@dataclass(frozen=True)
class ConsoleResult:
    executed_at_utc: datetime
    elapsed_ms: int
    columns: tuple[ConsoleColumn, ...]
    rows: tuple[tuple[object, ...], ...]
    truncated: bool
    multiple_result_sets: bool

    @property
    def row_count(self) -> int:
        return len(self.rows)


class ConsoleQueryError(ReportingError):
    def __init__(self, sql_error_number: int | None, message: str):
        self.sql_error_number = sql_error_number
        self.message = message
        super().__init__("query_failed")


def _sql_error_number(exc: Exception) -> int | None:
    matches = re.findall(r"\((\d{1,6})\)", " ".join(str(arg) for arg in exc.args))
    return int(matches[-1]) if matches else None


def _redacted_sql_message(exc: Exception, settings) -> str:
    arguments = [str(argument) for argument in exc.args]
    message = arguments[1] if len(arguments) > 1 else arguments[0] if arguments else "Query failed."
    message = re.sub(
        r"(?:\[Microsoft\]\[ODBC Driver 18 for SQL Server\]\[SQL Server\]"
        r"|\[ODBC Driver 18 for SQL Server\]\[SQL Server\]|\[SQL Server\])",
        "",
        message,
        flags=re.IGNORECASE,
    ).strip()
    # Drop the leading SQLSTATE and trailing "(native) (SQLExecDirectW)" markers.
    message = re.sub(r"^\[[0-9A-Z]{5}\]\s*", "", message)
    message = re.sub(r"(?:\s*\(\d{1,6}\))?(?:\s*\(SQL\w+\))+\s*$", "", message).strip()
    replacements = (
        (settings.server, "<server>"),
        (settings.approved_server, "<server>"),
        (settings.database, "<database>"),
        (settings.approved_database, "<database>"),
        (
            settings.username.get_secret_value() if settings.username is not None else None,
            "<login>",
        ),
    )
    for value, replacement in sorted(
        ((value, replacement) for value, replacement in replacements if value),
        key=lambda item: len(item[0]),
        reverse=True,
    ):
        message = re.sub(re.escape(value), replacement, message, flags=re.IGNORECASE)
    return message[:500]


def _console_type(type_code: object) -> str:
    if not isinstance(type_code, type):
        return "other"
    if issubclass(type_code, bool):
        return "boolean"
    if issubclass(type_code, int):
        return "integer"
    if issubclass(type_code, Decimal):
        return "decimal"
    if issubclass(type_code, float):
        return "float"
    if issubclass(type_code, str):
        return "string"
    if issubclass(type_code, datetime):
        return "datetime"
    if issubclass(type_code, date):
        return "date"
    if issubclass(type_code, datetime_time):
        return "time"
    if issubclass(type_code, (bytes, bytearray, memoryview)):
        return "binary"
    return "other"


def _console_value(value: object) -> object:
    if value is None or isinstance(value, (str, bool, int)):
        return value[:4000] if isinstance(value, str) else value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.isoformat(timespec="milliseconds") + "Z"
        normalized = value.astimezone(UTC).isoformat(timespec="milliseconds")
        return normalized.replace("+00:00", "Z")
    if isinstance(value, (date, datetime_time)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray, memoryview)):
        raw = bytes(value)
        return "0x" + raw[:64].hex() + ("…" if len(raw) > 64 else "")
    if isinstance(value, UUID):
        return str(value)
    return str(value)[:4000]


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


def _failure_rate_candidate_runs_sql(run_cap: int) -> str:
    return f"""
candidate_runs AS (
    SELECT TOP ({run_cap}) r.run_id, r.wavelength_mode,
        r.limit_snapshot_json, r.front_panel_channel_count
    FROM dbo.IL_MEASUREMENTS AS seed
    JOIN dbo.IL_RUNS AS r ON r.run_id = seed.run_id
    JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
    JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
    WHERE seed.written_at_utc >= ? AND seed.written_at_utc < ?
        AND seed.measurement_role = 'logical_channel'
        AND r.analysis_status NOT IN ('excluded', 'superseded')
        AND r.superseded_by_run_id IS NULL
        AND r.run_purpose IN (?, ?, ?, ?)
        AND r.front_panel_channel_count IS NOT NULL
        AND r.front_panel_channel_count > 0
        AND (? IS NULL OR r.wavelength_mode = ?)
        AND (? IS NULL OR s.switch_model = ?)
    GROUP BY r.run_id, r.wavelength_mode,
        r.limit_snapshot_json, r.front_panel_channel_count
    ORDER BY r.run_id
)
"""


FIRST_OBSERVATION_CTES = """ranked_observations AS (
    SELECT m.run_id, m.logical_channel, m.measurement_id,
        m.wavelength_1_il_db, m.wavelength_2_il_db, m.written_at_utc,
        ROW_NUMBER() OVER (
            PARTITION BY m.run_id, m.logical_channel
            ORDER BY m.written_at_utc, m.measurement_id
        ) AS observation_rank
    FROM candidate_runs AS r
    JOIN dbo.IL_MEASUREMENTS AS m ON m.run_id = r.run_id
    WHERE m.measurement_role = 'logical_channel'
        AND m.logical_channel >= 1
        AND m.logical_channel <= r.front_panel_channel_count
),
first_observations AS (
    SELECT run_id, logical_channel, measurement_id,
        wavelength_1_il_db, wavelength_2_il_db, written_at_utc
    FROM ranked_observations
    WHERE observation_rank = 1
),
parsed_runs AS (
    SELECT r.run_id,
        TRY_CONVERT(DECIMAL(9,4), JSON_VALUE(
            CASE WHEN ISJSON(r.limit_snapshot_json) = 1
                THEN r.limit_snapshot_json ELSE NULL END,
            '$.fail_above_db'
        )) AS sql_fail_limit
    FROM candidate_runs AS r
),
"""


def _failure_rate_sql(window_count: int) -> str:
    window_values = ", ".join("(?, ?, ?)" for _ in range(window_count))
    candidate_runs = _failure_rate_candidate_runs_sql(FAILURE_RATE_RUN_CAP)
    return f"""
WITH window_bounds(window_ordinal, start_utc, end_utc) AS (
    SELECT window_ordinal, start_utc, end_utc
    FROM (VALUES {window_values}) AS supplied(window_ordinal, start_utc, end_utc)
),
{candidate_runs.strip()},
{FIRST_OBSERVATION_CTES}windowed_observations AS (
    SELECT w.window_ordinal, f.run_id,
        f.wavelength_1_il_db, f.wavelength_2_il_db, p.sql_fail_limit
    FROM window_bounds AS w
    JOIN first_observations AS f
        ON f.written_at_utc >= w.start_utc AND f.written_at_utc < w.end_utc
    JOIN parsed_runs AS p ON p.run_id = f.run_id
)
SELECT window_ordinal, run_id, COUNT_BIG(*) AS observed,
    SUM(CASE WHEN sql_fail_limit IS NOT NULL AND (
            wavelength_1_il_db > sql_fail_limit
            OR wavelength_2_il_db > sql_fail_limit
        ) THEN CONVERT(BIGINT, 1) ELSE CONVERT(BIGINT, 0) END) AS failed_sql,
    sql_fail_limit
FROM windowed_observations
GROUP BY window_ordinal, run_id, sql_fail_limit
ORDER BY window_ordinal, run_id
"""


FAILURE_RATE_PERIOD_SQL = _failure_rate_sql(len(PERIOD_KEYS))
FAILURE_RATE_DAILY_SQL = _failure_rate_sql(31)
FAILURE_RATE_LIMITS_SQL = f"""
WITH {_failure_rate_candidate_runs_sql(FAILURE_RATE_RUN_CAP + 1).strip()}
SELECT run_id, wavelength_mode, limit_snapshot_json
FROM candidate_runs
ORDER BY run_id
"""

CHANNEL_FAILURES_ROW_CAP = FAILURE_RATE_RUN_CAP * 64
CHANNEL_FAILURES_SQL = f"""
WITH {_failure_rate_candidate_runs_sql(FAILURE_RATE_RUN_CAP).strip()},
{FIRST_OBSERVATION_CTES}windowed_observations AS (
    SELECT f.logical_channel, f.run_id, c.front_panel_channel_count,
        f.wavelength_1_il_db, f.wavelength_2_il_db, p.sql_fail_limit
    FROM first_observations AS f
    JOIN parsed_runs AS p ON p.run_id = f.run_id
    JOIN candidate_runs AS c ON c.run_id = f.run_id
    WHERE f.written_at_utc >= ? AND f.written_at_utc < ?
)
SELECT logical_channel, run_id, front_panel_channel_count, COUNT_BIG(*) AS observed,
    SUM(CASE WHEN sql_fail_limit IS NOT NULL AND (
            wavelength_1_il_db > sql_fail_limit
            OR wavelength_2_il_db > sql_fail_limit
        ) THEN CONVERT(BIGINT, 1) ELSE CONVERT(BIGINT, 0) END) AS failed_sql,
    sql_fail_limit
FROM windowed_observations
GROUP BY logical_channel, run_id, front_panel_channel_count, sql_fail_limit
ORDER BY logical_channel, run_id
"""

STATION_SUMMARY_SQL = f"""
WITH period_bounds(start_utc, end_utc) AS (
    SELECT start_utc, end_utc FROM (VALUES (?, ?)) AS supplied(start_utc, end_utc)
),
{_failure_rate_candidate_runs_sql(FAILURE_RATE_RUN_CAP).strip()},
{FIRST_OBSERVATION_CTES}run_context AS (
    SELECT c.run_id, r.station_number, a.unit_id, c.front_panel_channel_count,
        p.sql_fail_limit,
        CASE WHEN r.run_ended_at_utc IS NULL THEN NULL ELSE t.elapsed_ms END AS elapsed_ms
    FROM candidate_runs AS c
    JOIN parsed_runs AS p ON p.run_id = c.run_id
    JOIN dbo.IL_RUNS AS r ON r.run_id = c.run_id
    JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
    LEFT JOIN dbo.vw_RunTimingSummary AS t ON t.run_id = c.run_id
),
first_counts AS (
    SELECT f.run_id, COUNT_BIG(*) AS observed,
        SUM(CASE WHEN p.sql_fail_limit IS NOT NULL AND (
                f.wavelength_1_il_db > p.sql_fail_limit
                OR f.wavelength_2_il_db > p.sql_fail_limit
            ) THEN CONVERT(BIGINT, 1) ELSE CONVERT(BIGINT, 0) END) AS failed_sql
    FROM first_observations AS f
    JOIN parsed_runs AS p ON p.run_id = f.run_id
    CROSS JOIN period_bounds AS w
    WHERE f.written_at_utc >= w.start_utc AND f.written_at_utc < w.end_utc
    GROUP BY f.run_id
),
channel_activity AS (
    SELECT o.run_id, o.logical_channel,
        MAX(CASE WHEN o.observation_rank > 1 THEN 1 ELSE 0 END) AS retested
    FROM ranked_observations AS o
    CROSS JOIN period_bounds AS w
    WHERE o.written_at_utc >= w.start_utc AND o.written_at_utc < w.end_utc
    GROUP BY o.run_id, o.logical_channel
),
retest_counts AS (
    SELECT run_id, COUNT_BIG(*) AS active_run_channels,
        SUM(CONVERT(BIGINT, retested)) AS retested_run_channels
    FROM channel_activity
    GROUP BY run_id
)
SELECT rc.run_id, rc.station_number, rc.unit_id, rc.front_panel_channel_count,
    rc.sql_fail_limit, COALESCE(fc.observed, 0), COALESCE(fc.failed_sql, 0),
    x.active_run_channels, x.retested_run_channels, rc.elapsed_ms
FROM run_context AS rc
JOIN retest_counts AS x ON x.run_id = rc.run_id
LEFT JOIN first_counts AS fc ON fc.run_id = rc.run_id
ORDER BY rc.run_id
"""

ATTRIBUTION_KEYS = (
    "all",
    "production",
    "engineering",
    "training",
    "calibration",
    "unattributed",
)


def _replacement_activity_sql(window_count: int) -> str:
    window_values = ", ".join("(?, ?, ?)" for _ in range(window_count))
    attribution_values = ", ".join(f"('{key}')" for key in ATTRIBUTION_KEYS)
    return f"""
WITH window_bounds(window_ordinal, start_utc, end_utc) AS (
    SELECT window_ordinal, start_utc, end_utc
    FROM (VALUES {window_values}) AS supplied(window_ordinal, start_utc, end_utc)
),
attribution_bounds(attribution) AS (
    SELECT attribution FROM (VALUES {attribution_values}) AS supplied(attribution)
),
replacement_population AS (
    SELECT w.window_ordinal, x.replacement_id, x.assignment_id,
        x.logical_channel, a.unit_id,
        CASE WHEN x.related_run_id IS NULL
            THEN 'unattributed' ELSE r.run_purpose END AS attribution,
        CASE WHEN x.source_recommendation_id IS NULL THEN 0 ELSE 1 END AS from_recommendation,
        CASE WHEN x.related_run_id IS NOT NULL AND (
            r.void_info_json IS NOT NULL
            OR r.analysis_status IN ('excluded', 'superseded')
            OR r.superseded_by_run_id IS NOT NULL
        ) THEN 1 ELSE 0 END AS related_run_not_current
    FROM window_bounds AS w
    JOIN dbo.CHANNEL_REPLACEMENTS AS x
        ON x.replaced_at_utc >= w.start_utc AND x.replaced_at_utc < w.end_utc
    JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = x.assignment_id
    JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
    LEFT JOIN dbo.IL_RUNS AS r ON r.run_id = x.related_run_id
    WHERE x.replaced_at_utc >= ? AND x.replaced_at_utc < ?
        AND (? IS NULL OR s.switch_model = ?)
),
bucketed_population AS (
    SELECT window_ordinal, 'all' AS attribution, replacement_id, assignment_id,
        logical_channel, unit_id, from_recommendation, related_run_not_current
    FROM replacement_population
    UNION ALL
    SELECT window_ordinal, attribution, replacement_id, assignment_id,
        logical_channel, unit_id, from_recommendation, related_run_not_current
    FROM replacement_population
),
event_counts AS (
    SELECT window_ordinal, attribution, COUNT_BIG(*) AS events
    FROM (
        SELECT DISTINCT window_ordinal, attribution, replacement_id
        FROM bucketed_population
    ) AS distinct_events
    GROUP BY window_ordinal, attribution
),
recommendation_counts AS (
    SELECT window_ordinal, attribution, COUNT_BIG(*) AS from_recommendation
    FROM (
        SELECT DISTINCT window_ordinal, attribution, replacement_id
        FROM bucketed_population
        WHERE from_recommendation = 1
    ) AS distinct_recommendation_events
    GROUP BY window_ordinal, attribution
),
not_current_counts AS (
    SELECT window_ordinal, attribution, COUNT_BIG(*) AS related_run_not_current
    FROM (
        SELECT DISTINCT window_ordinal, attribution, replacement_id
        FROM bucketed_population
        WHERE related_run_not_current = 1
    ) AS distinct_not_current_events
    GROUP BY window_ordinal, attribution
),
channel_counts AS (
    SELECT window_ordinal, attribution, COUNT_BIG(*) AS channels_replaced
    FROM (
        SELECT DISTINCT window_ordinal, attribution, assignment_id, logical_channel
        FROM bucketed_population
    ) AS distinct_channels
    GROUP BY window_ordinal, attribution
),
unit_counts AS (
    SELECT window_ordinal, attribution, COUNT_BIG(*) AS units
    FROM (
        SELECT DISTINCT window_ordinal, attribution, unit_id
        FROM bucketed_population
    ) AS distinct_units
    GROUP BY window_ordinal, attribution
)
SELECT w.window_ordinal, b.attribution,
    COALESCE(e.events, 0), COALESCE(c.channels_replaced, 0), COALESCE(u.units, 0),
    COALESCE(rc.from_recommendation, 0), COALESCE(nc.related_run_not_current, 0)
FROM window_bounds AS w
CROSS JOIN attribution_bounds AS b
LEFT JOIN event_counts AS e
    ON e.window_ordinal = w.window_ordinal AND e.attribution = b.attribution
LEFT JOIN channel_counts AS c
    ON c.window_ordinal = w.window_ordinal AND c.attribution = b.attribution
LEFT JOIN unit_counts AS u
    ON u.window_ordinal = w.window_ordinal AND u.attribution = b.attribution
LEFT JOIN recommendation_counts AS rc
    ON rc.window_ordinal = w.window_ordinal AND rc.attribution = b.attribution
LEFT JOIN not_current_counts AS nc
    ON nc.window_ordinal = w.window_ordinal AND nc.attribution = b.attribution
ORDER BY w.window_ordinal, CASE b.attribution
    WHEN 'all' THEN 0 WHEN 'production' THEN 1 WHEN 'engineering' THEN 2
    WHEN 'training' THEN 3 WHEN 'calibration' THEN 4 ELSE 5 END
"""


REPLACEMENT_ACTIVITY_PERIOD_SQL = _replacement_activity_sql(len(PERIOD_KEYS))
REPLACEMENT_ACTIVITY_DAILY_SQL = _replacement_activity_sql(31)

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


def _candidate_run_parameters(
    query: ChannelActivityQuery | ChannelFailuresQuery, seed_start: datetime, seed_end: datetime
) -> tuple:
    purposes = tuple(str(purpose) for purpose in query.purposes)
    padded_purposes = purposes + (purposes[-1],) * (len(RunPurpose) - len(purposes))
    return (
        seed_start.replace(tzinfo=None),
        seed_end.replace(tzinfo=None),
        *padded_purposes,
        query.wavelength_mode,
        query.wavelength_mode,
        query.switch_model,
        query.switch_model,
    )


def _failure_rate_filter_parameters(
    query: ChannelActivityQuery, boundaries: ChannelActivityBoundaries
) -> tuple:
    return _candidate_run_parameters(
        query, boundaries.periods["last_30_days"].start_utc, boundaries.extracted_at_utc
    )


def build_failure_rate_queries(
    query: ChannelActivityQuery, boundaries: ChannelActivityBoundaries
) -> tuple[tuple[str, tuple], tuple[str, tuple], tuple[str, tuple]]:
    query = ChannelActivityQuery.model_validate(query.model_dump())
    filters = _failure_rate_filter_parameters(query, boundaries)
    period_windows = tuple(boundaries.periods[key] for key in PERIOD_KEYS)
    return (
        (
            FAILURE_RATE_PERIOD_SQL,
            (*_window_parameters(period_windows), *filters),
        ),
        (
            FAILURE_RATE_DAILY_SQL,
            (*_window_parameters(boundaries.daily), *filters),
        ),
        (FAILURE_RATE_LIMITS_SQL, filters),
    )


def _normalized_sql_limit(value: object) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ReportingError("schema_incompatible")
    try:
        result = Decimal(str(value)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        raise ReportingError("schema_incompatible") from None
    if not result.is_finite():
        raise ReportingError("schema_incompatible")
    return result


def _validated_failure_limits(limit_rows: list[tuple]) -> tuple[dict[int, Decimal | None], bool]:
    incomplete = len(limit_rows) > FAILURE_RATE_RUN_CAP
    limits: dict[int, Decimal | None] = {}
    for row in limit_rows[:FAILURE_RATE_RUN_CAP]:
        if len(row) != 3 or type(row[0]) is not int or row[0] <= 0:
            raise ReportingError("schema_incompatible")
        run_id, mode, snapshot = row
        if run_id in limits or mode not in {"SM", "MM"}:
            raise ReportingError("schema_incompatible")
        parsed = parse_limit_snapshot(snapshot, mode)
        limits[run_id] = None if parsed is None else parsed["fail_above_db"]
    return limits, incomplete


def _summarize_failure_rows(
    rows: list[tuple], expected_windows: int, validated_limits: dict[int, Decimal | None]
) -> tuple[FailureRateCounts, ...]:
    totals = [{"failed": 0, "observed": 0, "unknown_criteria": 0} for _ in range(expected_windows)]
    seen: set[tuple[int, int]] = set()
    for row in rows:
        if len(row) != 5:
            raise ReportingError("schema_incompatible")
        ordinal, run_id, observed, failed_sql, raw_sql_limit = row
        if (
            type(ordinal) is not int
            or not 0 <= ordinal < expected_windows
            or type(run_id) is not int
            or run_id <= 0
            or type(observed) is not int
            or observed <= 0
            or type(failed_sql) is not int
            or not 0 <= failed_sql <= observed
            or (ordinal, run_id) in seen
            or run_id not in validated_limits
        ):
            raise ReportingError("schema_incompatible")
        seen.add((ordinal, run_id))
        sql_limit = _normalized_sql_limit(raw_sql_limit)
        python_limit = validated_limits[run_id]
        if python_limit is None or sql_limit != python_limit:
            totals[ordinal]["unknown_criteria"] += observed
            continue
        totals[ordinal]["failed"] += failed_sql
        totals[ordinal]["observed"] += observed
    return tuple(
        FailureRateCounts(
            failed=total["failed"],
            observed=total["observed"],
            rate=(total["failed"] / total["observed"] if total["observed"] else None),
            unknown_criteria=total["unknown_criteria"],
        )
        for total in totals
    )


def summarize_failure_rate(
    period_rows: list[tuple], daily_rows: list[tuple], limit_rows: list[tuple]
) -> FailureRateMetrics:
    validated_limits, incomplete = _validated_failure_limits(limit_rows)
    period_counts = _summarize_failure_rows(period_rows, len(PERIOD_KEYS), validated_limits)
    daily_counts = _summarize_failure_rows(daily_rows, 31, validated_limits)
    return FailureRateMetrics(
        periods=dict(zip(PERIOD_KEYS, period_counts, strict=True)),
        daily=daily_counts,
        incomplete=incomplete,
    )


def build_channel_failures_queries(
    query: ChannelFailuresQuery, boundaries: ChannelActivityBoundaries
) -> tuple[tuple[str, tuple], tuple[str, tuple]]:
    query = ChannelFailuresQuery.model_validate(query.model_dump())
    window = boundaries.periods[query.period]
    filters = _candidate_run_parameters(query, window.start_utc, window.end_utc)
    return (
        (
            CHANNEL_FAILURES_SQL,
            (*filters, window.start_utc.replace(tzinfo=None), window.end_utc.replace(tzinfo=None)),
        ),
        (FAILURE_RATE_LIMITS_SQL, filters),
    )


def summarize_channel_failures(
    rows: list[tuple], limit_rows: list[tuple]
) -> ChannelFailuresMetrics:
    """Q02 first observations in one period, grouped by logical channel.

    Uses the same per-run SQL/Python limit agreement as the failure-rate summary, so the
    per-channel sums equal the failure-rate period totals for the same candidate runs.
    """
    validated_limits, incomplete = _validated_failure_limits(limit_rows)
    channels: dict[int, dict[str, int]] = {}
    runs: set[int] = set()
    max_channel: int | None = None
    seen: set[tuple[int, int]] = set()
    for row in rows:
        if len(row) != 6:
            raise ReportingError("schema_incompatible")
        channel, run_id, front_panel, observed, failed_sql, raw_sql_limit = row
        if (
            type(channel) is not int
            or type(run_id) is not int
            or type(front_panel) is not int
            or not 1 <= channel <= front_panel
            or run_id <= 0
            or type(observed) is not int
            or observed <= 0
            or type(failed_sql) is not int
            or not 0 <= failed_sql <= observed
            or (channel, run_id) in seen
            or run_id not in validated_limits
        ):
            raise ReportingError("schema_incompatible")
        seen.add((channel, run_id))
        runs.add(run_id)
        max_channel = front_panel if max_channel is None else max(max_channel, front_panel)
        total = channels.setdefault(channel, {"failed": 0, "observed": 0, "unknown_criteria": 0})
        sql_limit = _normalized_sql_limit(raw_sql_limit)
        python_limit = validated_limits[run_id]
        if python_limit is None or sql_limit != python_limit:
            total["unknown_criteria"] += observed
            continue
        total["failed"] += failed_sql
        total["observed"] += observed

    def counts(failed: int, observed: int, unknown: int) -> FailureRateCounts:
        return FailureRateCounts(
            failed=failed,
            observed=observed,
            rate=failed / observed if observed else None,
            unknown_criteria=unknown,
        )

    per_channel = tuple(
        ChannelFailureCounts(
            logical_channel=channel,
            **counts(t["failed"], t["observed"], t["unknown_criteria"]).model_dump(),
        )
        for channel, t in sorted(channels.items())
    )
    return ChannelFailuresMetrics(
        totals=counts(
            sum(c.failed for c in per_channel),
            sum(c.observed for c in per_channel),
            sum(c.unknown_criteria for c in per_channel),
        ),
        runs=len(runs),
        max_channel=max_channel,
        channels=per_channel,
        incomplete=incomplete,
    )


def build_station_summary_queries(
    query: StationSummaryQuery, boundaries: ChannelActivityBoundaries
) -> tuple[tuple[str, tuple], tuple[str, tuple]]:
    query = StationSummaryQuery.model_validate(query.model_dump())
    window = boundaries.periods["last_30_days"]
    filters = _candidate_run_parameters(query, window.start_utc, window.end_utc)
    bounds = (window.start_utc.replace(tzinfo=None), window.end_utc.replace(tzinfo=None))
    return (STATION_SUMMARY_SQL, (*bounds, *filters)), (FAILURE_RATE_LIMITS_SQL, filters)


_FOUR_PLACES = Decimal("0.0001")


def _median_string(values: list[Decimal]) -> str | None:
    if not values:
        return None
    ordered = sorted(values)
    middle = len(ordered) // 2
    median = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    return str(median.quantize(_FOUR_PLACES, rounding=ROUND_HALF_UP))


def summarize_station_summary(rows: list[tuple], limit_rows: list[tuple]) -> StationSummaryMetrics:
    """Q02 first observations, V08/V10 retests and elapsed seconds per channel, by station."""
    validated_limits, incomplete = _validated_failure_limits(limit_rows)
    groups: dict[int | None, dict] = {}
    seen: set[int] = set()

    def new_group() -> dict:
        return {
            "runs": 0,
            "units": set(),
            "failed": 0,
            "observed": 0,
            "unknown_criteria": 0,
            "active": 0,
            "retested": 0,
            "seconds": [],
        }

    for row in rows:
        if len(row) != 10:
            raise ReportingError("schema_incompatible")
        (
            run_id,
            station,
            unit_id,
            front_panel,
            raw_sql_limit,
            observed,
            failed_sql,
            active,
            retested,
            elapsed_ms,
        ) = row
        if (
            type(run_id) is not int
            or run_id <= 0
            or run_id in seen
            or run_id not in validated_limits
            or not (station is None or (type(station) is int and station > 0))
            or type(unit_id) is not int
            or unit_id <= 0
            or type(front_panel) is not int
            or front_panel <= 0
            or type(observed) is not int
            or type(failed_sql) is not int
            or not 0 <= failed_sql <= observed
            or type(active) is not int
            or active <= 0
            or not observed <= active
            or type(retested) is not int
            or not 0 <= retested <= active
            or not (elapsed_ms is None or (type(elapsed_ms) is int and elapsed_ms >= 0))
        ):
            raise ReportingError("schema_incompatible")
        seen.add(run_id)
        for key in (station, "__totals__"):
            group = groups.setdefault(key, new_group())
            group["runs"] += 1
            group["units"].add(unit_id)
            group["active"] += active
            group["retested"] += retested
            if elapsed_ms is not None:
                group["seconds"].append(Decimal(elapsed_ms) / 1000 / front_panel)
        sql_limit = _normalized_sql_limit(raw_sql_limit)
        python_limit = validated_limits[run_id]
        for key in (station, "__totals__"):
            group = groups[key]
            if python_limit is None or sql_limit != python_limit:
                group["unknown_criteria"] += observed
            else:
                group["failed"] += failed_sql
                group["observed"] += observed

    def counts(group: dict) -> dict:
        return {
            "runs": group["runs"],
            "units": len(group["units"]),
            "failed": group["failed"],
            "observed": group["observed"],
            "rate": group["failed"] / group["observed"] if group["observed"] else None,
            "unknown_criteria": group["unknown_criteria"],
            "active_run_channels": group["active"],
            "retested_run_channels": group["retested"],
            "retest_share": group["retested"] / group["active"] if group["active"] else None,
            "seconds_per_channel": StationSecondsPerChannel(
                median=_median_string(group["seconds"]), n=len(group["seconds"])
            ),
        }

    totals = groups.pop("__totals__", new_group())
    station_keys = sorted(groups, key=lambda key: (key is None, key or 0))
    return StationSummaryMetrics(
        stations=tuple(
            StationRow(station_number=key, **counts(groups[key])) for key in station_keys
        ),
        totals=StationCounts(**counts(totals)),
        incomplete=incomplete,
    )


def build_replacement_activity_queries(
    query: ReplacementActivityQuery, boundaries: ChannelActivityBoundaries
) -> tuple[tuple[str, tuple], tuple[str, tuple]]:
    query = ReplacementActivityQuery.model_validate(query.model_dump())
    filters = (
        boundaries.periods["last_30_days"].start_utc.replace(tzinfo=None),
        boundaries.extracted_at_utc.replace(tzinfo=None),
        query.switch_model,
        query.switch_model,
    )
    period_windows = tuple(boundaries.periods[key] for key in PERIOD_KEYS)
    return (
        (REPLACEMENT_ACTIVITY_PERIOD_SQL, (*_window_parameters(period_windows), *filters)),
        (REPLACEMENT_ACTIVITY_DAILY_SQL, (*_window_parameters(boundaries.daily), *filters)),
    )


def _replacement_activity_counts(
    rows: list[tuple], expected_windows: int
) -> tuple[dict[str, ReplacementActivityCounts], ...]:
    if len(rows) != expected_windows * len(ATTRIBUTION_KEYS):
        raise ReportingError("schema_incompatible")
    results = []
    for ordinal in range(expected_windows):
        buckets = {}
        for bucket_index, key in enumerate(ATTRIBUTION_KEYS):
            row = rows[ordinal * len(ATTRIBUTION_KEYS) + bucket_index]
            if len(row) != 7 or row[0] != ordinal or row[1] != key:
                raise ReportingError("schema_incompatible")
            values = row[2:]
            if any(type(value) is not int or value < 0 for value in values):
                raise ReportingError("schema_incompatible")
            events, channels, units, linked, not_current = values
            buckets[key] = ReplacementActivityCounts(
                events=events,
                channels_replaced=channels,
                units=units,
                events_per_unit=None if units == 0 else events / units,
                from_recommendation=linked,
                related_run_not_current=not_current,
            )
        results.append(buckets)
    return tuple(results)


def summarize_replacement_activity(
    period_rows: list[tuple], daily_rows: list[tuple]
) -> ReplacementActivityMetrics:
    periods = _replacement_activity_counts(period_rows, len(PERIOD_KEYS))
    daily = _replacement_activity_counts(daily_rows, 31)
    return ReplacementActivityMetrics(
        periods=dict(zip(PERIOD_KEYS, periods, strict=True)), daily=daily
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
    def get_failure_rate(
        self, query: ChannelActivityQuery, boundaries: ChannelActivityBoundaries
    ) -> FailureRateMetrics: ...
    def get_channel_failures(
        self, query: ChannelFailuresQuery, boundaries: ChannelActivityBoundaries
    ) -> ChannelFailuresMetrics: ...
    def get_station_summary(
        self, query: StationSummaryQuery, boundaries: ChannelActivityBoundaries
    ) -> StationSummaryMetrics: ...
    def get_replacement_activity(
        self, query: ReplacementActivityQuery, boundaries: ChannelActivityBoundaries
    ) -> ReplacementActivityMetrics: ...
    def get_unit_status(
        self, query: UnitStatusQuery, boundaries: ChannelActivityBoundaries
    ) -> UnitStatusMetrics: ...
    def get_recommendation_usage(
        self, query: RecommendationUsageQuery, boundaries: ChannelActivityBoundaries
    ) -> RecommendationUsageMetrics: ...
    def search_units(self, text: str) -> dict: ...
    def get_unit_detail(self, unit_id: int) -> dict | None: ...
    def get_run_channels(self, run_id: int) -> dict | None: ...
    def get_assignment_hardware(self, assignment_id: int) -> dict | None: ...
    def execute_console_query(self, sql: str) -> ConsoleResult: ...


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

    def get_failure_rate(
        self, query: ChannelActivityQuery, boundaries: ChannelActivityBoundaries
    ) -> FailureRateMetrics:
        query = ChannelActivityQuery.model_validate(query.model_dump())
        period_query, daily_query, limits_query = build_failure_rate_queries(query, boundaries)
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            period_rows = cursor.execute(*period_query).fetchmany(
                len(PERIOD_KEYS) * FAILURE_RATE_RUN_CAP + 1
            )
            daily_rows = cursor.execute(*daily_query).fetchmany(31 * FAILURE_RATE_RUN_CAP + 1)
            limit_rows = cursor.execute(*limits_query).fetchmany(FAILURE_RATE_RUN_CAP + 1)
            if (
                len(period_rows) > len(PERIOD_KEYS) * FAILURE_RATE_RUN_CAP
                or len(daily_rows) > 31 * FAILURE_RATE_RUN_CAP
            ):
                raise ReportingError("schema_incompatible")
            return summarize_failure_rate(period_rows, daily_rows, limit_rows)

    def get_channel_failures(
        self, query: ChannelFailuresQuery, boundaries: ChannelActivityBoundaries
    ) -> ChannelFailuresMetrics:
        query = ChannelFailuresQuery.model_validate(query.model_dump())
        channel_query, limits_query = build_channel_failures_queries(query, boundaries)
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            rows = cursor.execute(*channel_query).fetchmany(CHANNEL_FAILURES_ROW_CAP + 1)
            limit_rows = cursor.execute(*limits_query).fetchmany(FAILURE_RATE_RUN_CAP + 1)
            if len(rows) > CHANNEL_FAILURES_ROW_CAP:
                raise ReportingError("schema_incompatible")
            return summarize_channel_failures(rows, limit_rows)

    def get_station_summary(
        self, query: StationSummaryQuery, boundaries: ChannelActivityBoundaries
    ) -> StationSummaryMetrics:
        query = StationSummaryQuery.model_validate(query.model_dump())
        station_query, limits_query = build_station_summary_queries(query, boundaries)
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            rows = cursor.execute(*station_query).fetchmany(FAILURE_RATE_RUN_CAP + 1)
            limit_rows = cursor.execute(*limits_query).fetchmany(FAILURE_RATE_RUN_CAP + 1)
            if len(rows) > FAILURE_RATE_RUN_CAP:
                raise ReportingError("schema_incompatible")
            return summarize_station_summary(rows, limit_rows)

    def get_replacement_activity(
        self, query: ReplacementActivityQuery, boundaries: ChannelActivityBoundaries
    ) -> ReplacementActivityMetrics:
        period_query, daily_query = build_replacement_activity_queries(query, boundaries)
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            period_rows = cursor.execute(*period_query).fetchmany(
                len(PERIOD_KEYS) * len(ATTRIBUTION_KEYS) + 1
            )
            daily_rows = cursor.execute(*daily_query).fetchmany(31 * len(ATTRIBUTION_KEYS) + 1)
            return summarize_replacement_activity(period_rows, daily_rows)

    def get_unit_status(
        self, query: UnitStatusQuery, boundaries: ChannelActivityBoundaries
    ) -> UnitStatusMetrics:
        query = UnitStatusQuery.model_validate(query.model_dump())
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            return read_unit_status(cursor, query, boundaries.periods[query.period])

    def get_recommendation_usage(
        self, query: RecommendationUsageQuery, boundaries: ChannelActivityBoundaries
    ) -> RecommendationUsageMetrics:
        query = RecommendationUsageQuery.model_validate(query.model_dump())
        with self._adapter.cursor() as cursor:
            self._preflight(cursor)
            return read_recommendation_usage(cursor, query, boundaries)

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

    def execute_console_query(self, sql: str) -> ConsoleResult:
        statement = validate_console_statement(sql)
        settings = self._adapter.settings
        no_result_set = False
        result: ConsoleResult | None = None
        with self._adapter.cursor(query_timeout_seconds=settings.console_timeout_seconds) as cursor:
            self._preflight(cursor)
            cursor.execute("SET LOCK_TIMEOUT 5000;")
            cursor.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED;")
            started = perf_counter()
            try:
                cursor.execute(statement)
                description = cursor.description
                if description is None:
                    no_result_set = True
                else:
                    rows = cursor.fetchmany(settings.console_row_cap + 1)
                    truncated = len(rows) > settings.console_row_cap
                    returned_rows = rows[: settings.console_row_cap]
                    if truncated:
                        # Draining the rest of a capped result can take as long as the
                        # whole query; cancel it instead and skip nextset().
                        multiple_result_sets = False
                        try:
                            cursor.cancel()
                        except Exception:
                            logger.warning("Reporting failure code=console_cancel_failed")
                    else:
                        multiple_result_sets = bool(cursor.nextset())
                    elapsed_ms = round((perf_counter() - started) * 1000)
                    columns = tuple(
                        ConsoleColumn(name=str(column[0]), type=_console_type(column[1]))
                        for column in description
                    )
                    result = ConsoleResult(
                        executed_at_utc=datetime.now(UTC),
                        elapsed_ms=elapsed_ms,
                        columns=columns,
                        rows=tuple(
                            tuple(_console_value(value) for value in row) for row in returned_rows
                        ),
                        truncated=truncated,
                        multiple_result_sets=multiple_result_sets,
                    )
            except ReportingError:
                raise
            except Exception as exc:
                elapsed_ms = round((perf_counter() - started) * 1000)
                code = _error_code(exc, "query")
                if code == "query_timeout":
                    logger.warning(
                        "Reporting failure code=query_timeout elapsed_ms=%s %s",
                        elapsed_ms,
                        _diagnostic(exc),
                    )
                    raise ReportingError("query_timeout") from None
                number = _sql_error_number(exc)
                logger.warning(
                    "Reporting failure code=query_failed native=%s elapsed_ms=%s %s",
                    number if number is not None else "-",
                    elapsed_ms,
                    _diagnostic(exc),
                )
                raise ConsoleQueryError(number, _redacted_sql_message(exc, settings)) from None
        if no_result_set:
            raise StatementRejected("not_select")
        if result is None:
            raise ReportingError("read_failed")
        return result
