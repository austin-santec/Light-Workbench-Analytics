"""Aggregate R06 saved-recommendation linkage over one Pacific period."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from app.reporting.adapter import ReportingError
from app.reporting.channel_activity import ActivityWindow, ChannelActivityBoundaries
from app.reporting.models import (
    RecommendationUsageAverage,
    RecommendationUsageCounts,
    RecommendationUsageMetrics,
    RecommendationUsageQuery,
)
from app.schemas import RunPurpose

_PURPOSE_SLOTS = len(RunPurpose)
_FOUR_PLACES = Decimal("0.0001")

RECOMMENDATION_USAGE_SQL = """
WITH period_bounds(start_utc, end_utc) AS (
    SELECT ?, ?
),
selected_purposes(run_purpose) AS (
    SELECT run_purpose
    FROM (VALUES (?), (?), (?), (?)) AS supplied(run_purpose)
    GROUP BY run_purpose
),
extraction_bound(extracted_at_utc) AS (
    SELECT ?
),
analysis_population AS (
    SELECT a.analysis_id,
        CASE WHEN r.analysis_status NOT IN ('excluded', 'superseded')
            AND r.superseded_by_run_id IS NULL THEN 1 ELSE 0 END AS is_valid
    FROM dbo.REPLACEMENT_ANALYSES AS a
    JOIN dbo.IL_RUNS AS r ON r.run_id = a.run_id
    JOIN selected_purposes AS p ON p.run_purpose = r.run_purpose
    CROSS JOIN period_bounds AS w
    WHERE a.analyzed_at_utc >= w.start_utc AND a.analyzed_at_utc < w.end_utc
),
valid_analyses AS (
    SELECT DISTINCT analysis_id
    FROM analysis_population
    WHERE is_valid = 1
),
invalid_analyses AS (
    SELECT DISTINCT analysis_id
    FROM analysis_population
    WHERE is_valid = 0
),
analyses_with_recommendations AS (
    SELECT DISTINCT a.analysis_id
    FROM valid_analyses AS a
    JOIN dbo.REPLACEMENT_ANALYSIS_RECOMMENDATIONS AS rr
        ON rr.analysis_id = a.analysis_id
),
recommendation_population AS (
    SELECT DISTINCT rr.recommendation_id, rr.category, rr.improvement_db
    FROM valid_analyses AS a
    JOIN dbo.REPLACEMENT_ANALYSIS_RECOMMENDATIONS AS rr
        ON rr.analysis_id = a.analysis_id
),
linked_recommendations AS (
    SELECT DISTINCT rp.recommendation_id, rp.category, rp.improvement_db
    FROM recommendation_population AS rp
    CROSS JOIN extraction_bound AS t
    WHERE EXISTS (
        SELECT 1
        FROM dbo.CHANNEL_REPLACEMENTS AS x
        WHERE x.source_recommendation_id = rp.recommendation_id
            AND x.replaced_at_utc <= t.extracted_at_utc
    )
),
analysis_counts AS (
    SELECT
        (SELECT COUNT_BIG(*) FROM valid_analyses) AS cohort,
        (SELECT COUNT_BIG(*) FROM analyses_with_recommendations) AS with_recommendations,
        (SELECT COUNT_BIG(*) FROM invalid_analyses) AS on_invalid_runs
),
recommendation_counts AS (
    SELECT COUNT_BIG(*) AS total,
        COUNT_BIG(CASE WHEN category = 'required' THEN 1 END) AS required_count,
        COUNT_BIG(CASE WHEN category = 'optional' THEN 1 END) AS optional_count,
        COUNT_BIG(CASE WHEN category NOT IN ('required', 'optional') THEN 1 END) AS other_count,
        AVG(CAST(improvement_db AS DECIMAL(19,6))) AS avg_improvement
    FROM recommendation_population
),
linked_counts AS (
    SELECT COUNT_BIG(*) AS total,
        COUNT_BIG(CASE WHEN category = 'required' THEN 1 END) AS required_count,
        COUNT_BIG(CASE WHEN category = 'optional' THEN 1 END) AS optional_count,
        COUNT_BIG(CASE WHEN category NOT IN ('required', 'optional') THEN 1 END) AS other_count,
        AVG(CAST(improvement_db AS DECIMAL(19,6))) AS avg_improvement
    FROM linked_recommendations
),
event_population AS (
    SELECT x.replacement_id, x.source_recommendation_id, x.related_run_id,
        CASE WHEN EXISTS (
            SELECT 1 FROM selected_purposes AS p WHERE p.run_purpose = r.run_purpose
        ) THEN 1 ELSE 0 END AS selected_purpose
    FROM dbo.CHANNEL_REPLACEMENTS AS x
    LEFT JOIN dbo.IL_RUNS AS r ON r.run_id = x.related_run_id
    CROSS JOIN period_bounds AS w
    WHERE x.replaced_at_utc >= w.start_utc AND x.replaced_at_utc < w.end_utc
),
event_counts AS (
    SELECT
        COUNT_BIG(CASE WHEN source_recommendation_id IS NULL
            AND selected_purpose = 1 THEN 1 END) AS unlinked_events,
        COUNT_BIG(CASE WHEN source_recommendation_id IS NULL
            AND related_run_id IS NULL THEN 1 END) AS unlinked_unattributed,
        COUNT_BIG(CASE WHEN source_recommendation_id IS NOT NULL
            AND selected_purpose = 1 THEN 1 END) AS linked_events_in_period
    FROM event_population
)
SELECT a.cohort, a.with_recommendations, a.on_invalid_runs,
    rc.total, rc.required_count, rc.optional_count, rc.other_count,
    lc.total, lc.required_count, lc.optional_count, lc.other_count,
    lc.avg_improvement, lc.total,
    rc.avg_improvement, rc.total,
    e.unlinked_events, e.unlinked_unattributed, e.linked_events_in_period
FROM analysis_counts AS a
CROSS JOIN recommendation_counts AS rc
CROSS JOIN linked_counts AS lc
CROSS JOIN event_counts AS e
"""


def recommendation_usage_parameters(
    query: RecommendationUsageQuery,
    window: ActivityWindow,
    boundaries: ChannelActivityBoundaries,
) -> tuple:
    query = RecommendationUsageQuery.model_validate(query.model_dump())
    purposes = tuple(str(purpose) for purpose in query.purposes)
    padded = purposes + (purposes[-1],) * (_PURPOSE_SLOTS - len(purposes))
    return (
        window.start_utc.replace(tzinfo=None),
        window.end_utc.replace(tzinfo=None),
        *padded,
        boundaries.extracted_at_utc.replace(tzinfo=None),
    )


def build_recommendation_usage_query(
    query: RecommendationUsageQuery, boundaries: ChannelActivityBoundaries
) -> tuple[str, tuple]:
    query = RecommendationUsageQuery.model_validate(query.model_dump())
    return (
        RECOMMENDATION_USAGE_SQL,
        recommendation_usage_parameters(query, boundaries.periods[query.period], boundaries),
    )


def _four_place_string(value: object, *, n: int) -> str | None:
    if n == 0:
        if value is not None:
            raise ReportingError("schema_incompatible")
        return None
    if value is None or isinstance(value, bool):
        raise ReportingError("schema_incompatible")
    try:
        decimal = Decimal(str(value)).quantize(_FOUR_PLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError, ValueError):
        raise ReportingError("schema_incompatible") from None
    if not decimal.is_finite():
        raise ReportingError("schema_incompatible")
    return format(decimal, ".4f")


def summarize_recommendation_usage(row: tuple | None) -> RecommendationUsageMetrics:
    if row is None or len(row) != 18:
        raise ReportingError("schema_incompatible")
    count_indexes = (*range(0, 11), 12, 14, 15, 16, 17)
    if any(type(row[index]) is not int or row[index] < 0 for index in count_indexes):
        raise ReportingError("schema_incompatible")

    cohort, with_recommendations, invalid = row[:3]
    recommendations = RecommendationUsageCounts(
        total=row[3], required=row[4], optional=row[5], other=row[6]
    )
    linked = RecommendationUsageCounts(
        total=row[7], required=row[8], optional=row[9], other=row[10]
    )
    if (
        with_recommendations > cohort
        or recommendations.required + recommendations.optional + recommendations.other
        != recommendations.total
        or linked.required + linked.optional + linked.other != linked.total
        or linked.total > recommendations.total
        or row[12] != linked.total
        or row[14] != recommendations.total
    ):
        raise ReportingError("schema_incompatible")

    linked_share = None
    if recommendations.total:
        linked_share = format(
            (Decimal(linked.total) / Decimal(recommendations.total)).quantize(
                _FOUR_PLACES, rounding=ROUND_HALF_UP
            ),
            ".4f",
        )
    return RecommendationUsageMetrics(
        analyses_cohort=cohort,
        analyses_with_recommendations=with_recommendations,
        analyses_on_invalid_runs=invalid,
        recommendations=recommendations,
        linked=linked,
        linked_share=linked_share,
        avg_improvement_linked_db=RecommendationUsageAverage(
            value=_four_place_string(row[11], n=row[12]), n=row[12]
        ),
        avg_improvement_all_db=RecommendationUsageAverage(
            value=_four_place_string(row[13], n=row[14]), n=row[14]
        ),
        unlinked_events=row[15],
        unlinked_unattributed=row[16],
        linked_events_in_period=row[17],
    )


def read_recommendation_usage(
    cursor,
    query: RecommendationUsageQuery,
    boundaries: ChannelActivityBoundaries,
) -> RecommendationUsageMetrics:
    sql, params = build_recommendation_usage_query(query, boundaries)
    return summarize_recommendation_usage(cursor.execute(sql, params).fetchone())
