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
    },
    "UNIT_SWITCH_ASSIGNMENTS": {
        "assignment_id": ("bigint", 8, 0, False),
        "unit_id": ("bigint", 8, 0, False),
        "switch_id": ("bigint", 8, 0, False),
    },
    "UNITS": {
        "unit_id": ("bigint", 8, 0, False),
        "main_board_serial": ("nvarchar", 200, 0, False),
    },
    "SWITCHES": {
        "switch_id": ("bigint", 8, 0, False),
        "switch_serial": ("nvarchar", 200, 0, False),
        "switch_model": ("nvarchar", 60, 0, False),
    },
}

MIGRATION_SQL = """
SELECT TOP (8) migration_id, migration_name, script_checksum
FROM dbo.SCHEMA_MIGRATIONS
ORDER BY CASE WHEN migration_id > 7 THEN 0 ELSE 1 END, migration_id
"""

COLUMN_SQL = """
SELECT TOP (128) o.name, c.name, t.name,
    CASE WHEN t.name = 'datetime2' THEN NULL ELSE c.max_length END,
    c.scale, c.is_nullable
FROM sys.objects AS o
JOIN sys.schemas AS s ON s.schema_id = o.schema_id
JOIN sys.columns AS c ON c.object_id = o.object_id
JOIN sys.types AS t ON t.user_type_id = c.user_type_id
WHERE s.name = ? AND o.type = ? AND o.name IN (?, ?, ?, ?, ?)
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

PERMISSION_SQL = """
SELECT p.name,
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'SELECT'),
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'INSERT'),
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'UPDATE'),
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'DELETE'),
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'ALTER'),
    HAS_PERMS_BY_NAME(p.name, 'OBJECT', 'CONTROL')
FROM (VALUES (?), (?), (?), (?), (?)) AS p(name)
"""
