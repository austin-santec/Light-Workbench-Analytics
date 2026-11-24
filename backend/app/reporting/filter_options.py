"""Bounded distinct values for the live Overview reporting filters."""

from __future__ import annotations

from dataclasses import dataclass

from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import ActivityWindow
from app.reporting.models import FilterOptionsQuery
from app.schemas import RunPurpose

FILTER_OPTION_CAP = 1000
_PURPOSE_SLOTS = len(RunPurpose)

FILTER_OPTIONS_SQL = f"""
WITH accepted_runs AS (
    SELECT DISTINCT r.run_id, s.switch_model, r.wavelength_mode,
        r.front_panel_channel_count, r.station_number
    FROM dbo.IL_MEASUREMENTS AS m
    JOIN dbo.IL_RUNS AS r ON r.run_id = m.run_id
    JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
    JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
    WHERE m.written_at_utc >= ? AND m.written_at_utc < ?
        AND m.measurement_role = 'logical_channel'
        AND r.front_panel_channel_count IS NOT NULL
        AND r.front_panel_channel_count > 0
        AND m.logical_channel >= 1
        AND m.logical_channel <= r.front_panel_channel_count
        AND r.analysis_status NOT IN ('excluded', 'superseded')
        AND r.superseded_by_run_id IS NULL
        AND r.run_purpose IN ({", ".join("?" for _ in range(_PURPOSE_SLOTS))})
),
switch_options AS (
    SELECT TOP ({FILTER_OPTION_CAP + 1}) switch_model AS option_value
    FROM accepted_runs
    WHERE switch_model IS NOT NULL
    GROUP BY switch_model
    ORDER BY switch_model
),
mode_options AS (
    SELECT TOP ({FILTER_OPTION_CAP + 1}) wavelength_mode AS option_value
    FROM accepted_runs
    WHERE wavelength_mode IS NOT NULL
    GROUP BY wavelength_mode
    ORDER BY wavelength_mode
),
channel_options AS (
    SELECT TOP ({FILTER_OPTION_CAP + 1}) front_panel_channel_count AS option_value
    FROM accepted_runs
    WHERE front_panel_channel_count IS NOT NULL
    GROUP BY front_panel_channel_count
    ORDER BY front_panel_channel_count
),
station_options AS (
    SELECT TOP ({FILTER_OPTION_CAP + 1}) station_number AS option_value
    FROM accepted_runs
    WHERE station_number IS NOT NULL
    GROUP BY station_number
    ORDER BY station_number
)
SELECT 'switch_model' AS option_kind, CONVERT(NVARCHAR(100), option_value) AS option_value
FROM switch_options
UNION ALL
SELECT 'wavelength_mode', CONVERT(NVARCHAR(100), option_value) FROM mode_options
UNION ALL
SELECT 'channel_count', CONVERT(NVARCHAR(100), option_value) FROM channel_options
UNION ALL
SELECT 'station', CONVERT(NVARCHAR(100), option_value) FROM station_options
ORDER BY option_kind, option_value
"""


@dataclass(frozen=True)
class FilterOptionsMetrics:
    switch_models: tuple[str, ...]
    wavelength_modes: tuple[str, ...]
    channel_counts: tuple[int, ...]
    stations: tuple[int, ...]
    incomplete: bool


def build_filter_options_query(
    query: FilterOptionsQuery, window: ActivityWindow
) -> tuple[str, tuple[object, ...]]:
    purposes = [purpose.value for purpose in query.purposes]
    purposes.extend([purposes[-1]] * (_PURPOSE_SLOTS - len(purposes)))
    return FILTER_OPTIONS_SQL, (
        window.start_utc.replace(tzinfo=None),
        window.end_utc.replace(tzinfo=None),
        *purposes,
    )


def summarize_filter_options(rows: list[tuple]) -> FilterOptionsMetrics:
    values: dict[str, list[object]] = {
        "switch_model": [],
        "wavelength_mode": [],
        "channel_count": [],
        "station": [],
    }
    seen: dict[str, set[object]] = {key: set() for key in values}
    for row in rows:
        if len(row) != 2 or row[0] not in values or not isinstance(row[1], str) or not row[1]:
            raise ReportingError("schema_incompatible")
        kind, raw = row
        if kind == "switch_model":
            value: object = raw
            if len(raw) > 30:
                raise ReportingError("schema_incompatible")
        elif kind == "wavelength_mode":
            if raw not in {"MM", "SM"}:
                raise ReportingError("schema_incompatible")
            value = raw
        else:
            try:
                value = int(raw)
            except ValueError:
                raise ReportingError("schema_incompatible") from None
            if str(value) != raw or value < 1 or (kind == "channel_count" and value > 200):
                raise ReportingError("schema_incompatible")
        if value in seen[kind]:
            raise ReportingError("schema_incompatible")
        seen[kind].add(value)
        values[kind].append(value)

    incomplete = any(len(items) > FILTER_OPTION_CAP for items in values.values())
    return FilterOptionsMetrics(
        switch_models=tuple(sorted(values["switch_model"][:FILTER_OPTION_CAP])),
        wavelength_modes=tuple(sorted(values["wavelength_mode"][:FILTER_OPTION_CAP])),
        channel_counts=tuple(sorted(values["channel_count"][:FILTER_OPTION_CAP])),
        stations=tuple(sorted(values["station"][:FILTER_OPTION_CAP])),
        incomplete=incomplete,
    )
