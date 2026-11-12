"""Reviewed source metadata, not migrations to execute. See REPORTING_DATABASE.md."""

SOURCE_COMMIT = "5d4972830e74cc1b1e718fb577916d132e58faf7"
MIGRATIONS = (
    (1, "initial_schema", "b416e81f6fb7fa2bdce7d0cb66f76bf96ff8ef9128682055d42836cc95ec09f5"),
    (
        2,
        "nonnegative_measurement_losses",
        "1204faf74a26d73e8d081f5f62b7454219d7e9a317e9f7058cf9848b0513ebc6",
    ),
    (3, "station_number", "4886dd6fbfdcadf29fc3a3db28befbcd8ab964826f56ae8addb5fd1430e63a1d"),
    (
        4,
        "replacement_analysis_history",
        "184fff3ade688f4f9526b4b81f5c7a29fa886583a5588260f2730cf0c204f021",
    ),
    (
        5,
        "iterative_replacement_analysis",
        "ec1b91208d6a14595668170b1a47787b4dc061aef8df39652974bd3421dfd589",
    ),
    (
        6,
        "authoritative_channel_roles",
        "04d2a0c207c94fa4901a6b07330b1556f44d97806490f843d7545d2efc9f6c6d",
    ),
    (
        7,
        "run_test_sessions",
        "43f6ec51f25bfd1bfae3da6255d896708add338cb021d96a8dab653f01f14125",
    ),
)

# Required column -> (SQL system type, byte length, scale, nullable).
# Temporal lengths are normalized to None: the type and scale specify precision.
# This checks consumed columns only, not every FK/index or future analytics field.
COLUMNS = {
    "SCHEMA_MIGRATIONS": {
        "migration_id": ("int", 4, 0, False),
        "migration_name": ("nvarchar", 400, 0, False),
        "script_checksum": ("char", 64, 0, False),
    },
    "IL_RUNS": {
        "run_id": ("bigint", 8, 0, False),
        "assignment_id": ("bigint", 8, 0, False),
        "run_number": ("int", 4, 0, False),
        "run_started_at_utc": ("datetime2", None, 3, False),
        "run_ended_at_utc": ("datetime2", None, 3, True),
        "wavelength_mode": ("varchar", 2, 0, False),
        "completion_status": ("varchar", 20, 0, False),
        "run_purpose": ("varchar", 30, 0, False),
        "analysis_status": ("varchar", 20, 0, False),
        "superseded_by_run_id": ("bigint", 8, 0, True),
        "front_panel_channel_count": ("int", 4, 0, True),
        "station_number": ("int", 4, 0, True),
        "tested_by": ("nvarchar", 200, 0, False),
        "operating_band": ("varchar", 20, 0, False),
        "application_version": ("nvarchar", 60, 0, False),
        "part_number_snapshot": ("nvarchar", 200, 0, True),
        "limit_snapshot_json": ("nvarchar", -1, 0, False),
        "void_info_json": ("nvarchar", -1, 0, True),
    },
    "UNIT_SWITCH_ASSIGNMENTS": {
        "assignment_id": ("bigint", 8, 0, False),
        "unit_id": ("bigint", 8, 0, False),
        "switch_id": ("bigint", 8, 0, False),
        "installed_at_utc": ("datetime2", None, 3, False),
        "removed_at_utc": ("datetime2", None, 3, True),
        "installed_by": ("nvarchar", 200, 0, False),
        "removed_by": ("nvarchar", 200, 0, True),
        "removal_reason": ("nvarchar", 1000, 0, True),
    },
    "UNITS": {
        "unit_id": ("bigint", 8, 0, False),
        "main_board_serial": ("nvarchar", 200, 0, False),
        "part_number": ("nvarchar", 200, 0, True),
        "front_panel_channel_count": ("int", 4, 0, True),
        "unit_model": ("nvarchar", 100, 0, True),
        "created_at_utc": ("datetime2", None, 3, False),
        "updated_at_utc": ("datetime2", None, 3, False),
    },
    "SWITCHES": {
        "switch_id": ("bigint", 8, 0, False),
        "switch_serial": ("nvarchar", 200, 0, False),
        "switch_model": ("nvarchar", 60, 0, False),
        "firmware_version": ("nvarchar", 100, 0, True),
    },
    "vw_RunTimingSummary": {
        "run_id": ("bigint", 8, 0, False),
        "active_test_ms": ("bigint", 8, 0, True),
        "elapsed_ms": ("bigint", 8, 0, True),
        "stopped_ms": ("bigint", 8, 0, True),
        # Verified against the Stage B test database 2026-11-12: nullable despite COALESCE.
        "timing_session_count": ("bigint", 8, 0, True),
        # Verified against the Stage B test database 2026-11-11: CASE of literals, NOT NULL.
        "timing_quality": ("varchar", 19, 0, False),
    },
    "IL_MEASUREMENTS": {
        "measurement_id": ("bigint", 8, 0, False),
        "run_id": ("bigint", 8, 0, False),
        "logical_channel": ("int", 4, 0, True),
        "physical_port": ("int", 4, 0, False),
        "measurement_role": ("varchar", 20, 0, False),
        "attempt_number": ("int", 4, 0, False),
        "wavelength_1_nm": ("smallint", 2, 0, False),
        "wavelength_1_il_db": ("decimal", 5, 4, False),
        "wavelength_2_nm": ("smallint", 2, 0, False),
        "wavelength_2_il_db": ("decimal", 5, 4, False),
        "written_at_utc": ("datetime2", None, 3, False),
        "written_by": ("nvarchar", 200, 0, False),
    },
    "vw_CurrentILMeasurements": {
        "measurement_id": ("bigint", 8, 0, False),
        "run_id": ("bigint", 8, 0, False),
        "logical_channel": ("int", 4, 0, True),
        "physical_port": ("int", 4, 0, False),
        "measurement_role": ("varchar", 20, 0, False),
        "attempt_number": ("int", 4, 0, False),
        "wavelength_1_nm": ("smallint", 2, 0, False),
        "wavelength_1_il_db": ("decimal", 5, 4, False),
        "wavelength_2_nm": ("smallint", 2, 0, False),
        "wavelength_2_il_db": ("decimal", 5, 4, False),
        "written_at_utc": ("datetime2", None, 3, False),
        "written_by": ("nvarchar", 200, 0, False),
    },
    "CHANNEL_REPLACEMENTS": {
        "replacement_id": ("bigint", 8, 0, False),
        "assignment_id": ("bigint", 8, 0, False),
        "logical_channel": ("int", 4, 0, False),
        "previous_physical_port": ("int", 4, 0, False),
        "replacement_physical_port": ("int", 4, 0, False),
        "reason": ("nvarchar", 1000, 0, False),
        "replaced_by": ("nvarchar", 200, 0, False),
        "replaced_at_utc": ("datetime2", None, 3, False),
        "related_run_id": ("bigint", 8, 0, True),
        "notes": ("nvarchar", -1, 0, True),
        "source_recommendation_id": ("bigint", 8, 0, True),
    },
    "vw_CurrentChannelMap": {
        "assignment_id": ("bigint", 8, 0, False),
        "logical_channel": ("int", 4, 0, True),
        "initial_physical_port": ("int", 4, 0, True),
        "effective_physical_port": ("int", 4, 0, True),
        "is_replaced": ("bit", 1, 0, True),
        "latest_replaced_at_utc": ("datetime2", None, 3, True),
    },
    "vw_ConfirmedExtraPorts": {
        "assignment_id": ("bigint", 8, 0, False),
        "run_id": ("bigint", 8, 0, False),
        "measurement_id": ("bigint", 8, 0, False),
        "physical_port": ("int", 4, 0, False),
        "attempt_number": ("int", 4, 0, False),
        "wavelength_1_nm": ("smallint", 2, 0, False),
        "wavelength_1_il_db": ("decimal", 5, 4, False),
        "wavelength_2_nm": ("smallint", 2, 0, False),
        "wavelength_2_il_db": ("decimal", 5, 4, False),
        "written_at_utc": ("datetime2", None, 3, False),
        "analysis_status": ("varchar", 20, 0, False),
    },
    "DESIGNATED_SPARES": {
        "spare_event_id": ("bigint", 8, 0, False),
        "assignment_id": ("bigint", 8, 0, False),
        "physical_port": ("int", 4, 0, False),
        "action": ("varchar", 20, 0, False),
        "recorded_by": ("nvarchar", 200, 0, False),
        "recorded_at_utc": ("datetime2", None, 3, False),
    },
    "REPLACEMENT_ANALYSES": {
        "analysis_id": ("bigint", 8, 0, False),
        "run_id": ("bigint", 8, 0, False),
        "analyzed_at_utc": ("datetime2", None, 3, False),
        "analyzed_by": ("nvarchar", 200, 0, False),
        "result_status": ("varchar", 40, 0, False),
    },
    "REPLACEMENT_ANALYSIS_RECOMMENDATIONS": {
        "recommendation_id": ("bigint", 8, 0, False),
        "analysis_id": ("bigint", 8, 0, False),
        "recommendation_rank": ("int", 4, 0, False),
        "category": ("varchar", 20, 0, False),
        "logical_channel": ("int", 4, 0, False),
        "current_physical_port": ("int", 4, 0, False),
        "candidate_physical_port": ("int", 4, 0, False),
        "current_wavelength_1_il_db": ("decimal", 5, 4, False),
        "current_wavelength_2_il_db": ("decimal", 5, 4, False),
        "candidate_wavelength_1_il_db": ("decimal", 5, 4, False),
        "candidate_wavelength_2_il_db": ("decimal", 5, 4, False),
        "current_worst_loss_db": ("decimal", 5, 4, False),
        "candidate_worst_loss_db": ("decimal", 5, 4, False),
        "improvement_db": ("decimal", 5, 4, False),
    },
}

OBJECT_TYPES = {name: "V" if name.startswith("vw_") else "U" for name in COLUMNS}
EXPECTED_COLUMN_COUNT = sum(len(columns) for columns in COLUMNS.values())
# sys catalog rows include unconsumed columns on the same reviewed objects.
CATALOG_ROW_CAP = EXPECTED_COLUMN_COUNT + 64
_OBJECT_PLACEHOLDERS = ", ".join("?" for _ in COLUMNS)

MIGRATION_SQL = f"""
SELECT TOP ({len(MIGRATIONS) + 1}) migration_id, migration_name, script_checksum
FROM dbo.SCHEMA_MIGRATIONS
ORDER BY migration_id
"""

COLUMN_SQL = f"""
SELECT TOP ({CATALOG_ROW_CAP}) o.name, o.type, c.name, t.name,
    CASE WHEN t.name = 'datetime2' THEN NULL ELSE c.max_length END,
    c.scale, c.is_nullable
FROM sys.objects AS o
JOIN sys.schemas AS s ON s.schema_id = o.schema_id
JOIN sys.columns AS c ON c.object_id = o.object_id
JOIN sys.types AS t ON t.user_type_id = c.user_type_id
WHERE s.name = ? AND o.type IN (?, ?) AND o.name IN ({_OBJECT_PLACEHOLDERS})
ORDER BY o.name, c.column_id
"""

# Flags are conservative gates; an administrator still audits all effective grants.
IDENTITY_SQL = """
SELECT DB_NAME(),
    IS_SRVROLEMEMBER('sysadmin'), IS_SRVROLEMEMBER('serveradmin'),
    IS_SRVROLEMEMBER('securityadmin'), IS_SRVROLEMEMBER('dbcreator'),
    IS_SRVROLEMEMBER('setupadmin'), IS_SRVROLEMEMBER('processadmin'),
    IS_SRVROLEMEMBER('diskadmin'), IS_SRVROLEMEMBER('bulkadmin'),
    IS_MEMBER('db_owner'), IS_MEMBER('db_securityadmin'), IS_MEMBER('db_accessadmin'),
    IS_MEMBER('db_ddladmin'), IS_MEMBER('db_datawriter'), IS_MEMBER('db_datareader'),
    IS_MEMBER('db_backupoperator'),
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL'),
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE'),
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'EXECUTE'),
    HAS_PERMS_BY_NAME('dbo', 'SCHEMA', 'SELECT'),
    HAS_PERMS_BY_NAME('dbo', 'SCHEMA', 'ALTER')
"""

PERMISSION_SQL = f"""
SELECT p.name,
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'SELECT'),
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'INSERT'),
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'UPDATE'),
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'DELETE'),
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'ALTER'),
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'CONTROL')
FROM (VALUES {", ".join("(?)" for _ in COLUMNS)}) AS p(name)
"""
