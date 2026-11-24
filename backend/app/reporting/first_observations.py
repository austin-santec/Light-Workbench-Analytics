"""Shared SQL CTEs for each run/channel's first logical-channel observation."""

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
