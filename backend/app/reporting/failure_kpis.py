"""Bounded D17 outcome and V10 retest counts for the Failures KPI tiles."""

from __future__ import annotations

from collections import Counter
from collections.abc import Sequence

from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import ActivityWindow
from app.reporting.first_observations import FIRST_OBSERVATION_CTES
from app.reporting.models import (
    FailureKpiRetestCounts,
    FailureKpisMetrics,
    FailureKpisQuery,
    FailureKpiUnitCounts,
)
from app.reporting.recent_finished_units import (
    build_replacement_query,
    eligible_finished_records,
    replacement_counts,
)
from app.reporting.unit_status import UNIT_STATUS_COHORT_CAP
from app.reporting.unit_test_time import read_finished_unit_cohort

FAILURE_KPI_RUN_CAP = 5000
_PURPOSE_SLOTS = 4


def _candidate_runs_sql(run_cap: int, name: str) -> str:
    return f"""
{name} AS (
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


FAILURE_KPI_RETEST_SQL = f"""
WITH period_bounds(start_utc, end_utc) AS (
    SELECT start_utc, end_utc FROM (VALUES (?, ?)) AS supplied(start_utc, end_utc)
),
{_candidate_runs_sql(FAILURE_KPI_RUN_CAP + 1, "candidate_run_probe").strip()},
candidate_runs AS (
    SELECT TOP ({FAILURE_KPI_RUN_CAP}) run_id, wavelength_mode,
        limit_snapshot_json, front_panel_channel_count
    FROM candidate_run_probe
    ORDER BY run_id
),
{FIRST_OBSERVATION_CTES}channel_activity AS (
    SELECT o.run_id, o.logical_channel,
        MAX(CASE WHEN o.observation_rank > 1 THEN 1 ELSE 0 END) AS retested
    FROM ranked_observations AS o
    CROSS JOIN period_bounds AS w
    WHERE o.written_at_utc >= w.start_utc AND o.written_at_utc < w.end_utc
    GROUP BY o.run_id, o.logical_channel
)
SELECT (SELECT COUNT_BIG(*) FROM candidate_run_probe) AS candidate_runs,
    COUNT_BIG(*) AS active_run_channels,
    COALESCE(SUM(CONVERT(BIGINT, retested)), 0) AS retested_run_channels
FROM channel_activity
"""


def build_failure_kpi_retest_query(
    query: FailureKpisQuery, window: ActivityWindow
) -> tuple[str, tuple]:
    purposes = [purpose.value for purpose in query.purposes]
    purposes.extend([purposes[-1]] * (_PURPOSE_SLOTS - len(purposes)))
    bounds = (window.start_utc.replace(tzinfo=None), window.end_utc.replace(tzinfo=None))
    filters = (*bounds, *purposes, None, None, None, None)
    return FAILURE_KPI_RETEST_SQL, (*bounds, *filters)


def summarize_failure_kpis(
    records,
    replacement_rows: Sequence[Sequence[object]],
    retest_row: Sequence[object],
    *,
    incomplete: bool,
) -> FailureKpisMetrics:
    eligible = eligible_finished_records(records)
    unit_ids = {record.unit_id for record in eligible}
    replacements = replacement_counts(replacement_rows, unit_ids)
    outcomes = Counter()
    replacement_units = 0
    replaced_channels = 0
    for record in eligible:
        replaced = replacements.get(record.unit_id, 0)
        if replaced:
            replacement_units += 1
            replaced_channels += replaced
        outcome = (
            "unrecoverable"
            if record.outcome == "unrecoverable"
            else "passed_after_replacement"
            if replaced
            else "passed_no_replacement"
        )
        outcomes[outcome] += 1

    if len(retest_row) != 3 or any(type(value) is not int or value < 0 for value in retest_row):
        raise ReportingError("schema_incompatible")
    candidate_runs, active, retested = retest_row
    if retested > active or candidate_runs > FAILURE_KPI_RUN_CAP + 1:
        raise ReportingError("schema_incompatible")
    return FailureKpisMetrics(
        units=FailureKpiUnitCounts(
            finished=len(eligible),
            passed_no_replacement=outcomes["passed_no_replacement"],
            passed_after_replacement=outcomes["passed_after_replacement"],
            unrecoverable=outcomes["unrecoverable"],
            replacement_units=replacement_units,
            replaced_channels=replaced_channels,
        ),
        retest=FailureKpiRetestCounts(active_run_channels=active, retested_run_channels=retested),
        incomplete=incomplete or candidate_runs > FAILURE_KPI_RUN_CAP,
    )


def read_failure_kpis(
    cursor, query: FailureKpisQuery, window: ActivityWindow
) -> FailureKpisMetrics:
    cohort = read_finished_unit_cohort(cursor, query, window)
    eligible = eligible_finished_records(cohort.records)
    replacement_rows: Sequence[Sequence[object]] = ()
    if eligible:
        replacement_query = build_replacement_query(tuple(record.unit_id for record in eligible))
        replacement_rows = cursor.execute(*replacement_query).fetchmany(UNIT_STATUS_COHORT_CAP + 1)
    follow_up_overflow = len(replacement_rows) > UNIT_STATUS_COHORT_CAP
    retest_query = build_failure_kpi_retest_query(query, window)
    retest_row = cursor.execute(*retest_query).fetchone()
    if retest_row is None:
        raise ReportingError("schema_incompatible")
    return summarize_failure_kpis(
        cohort.records,
        replacement_rows[:UNIT_STATUS_COHORT_CAP],
        retest_row,
        incomplete=cohort.incomplete or follow_up_overflow,
    )
