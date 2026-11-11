# Reporting database foundation — Milestone 3

**Stage A is offline-tested. Stage B is pending by explicit user instruction. No database connection was opened.** The independent React fixtures and three synthetic FastAPI endpoints are unchanged. Reporting is an internal Python repository/local diagnostic only, never an unauthenticated real-record API.

## Reviewed baseline and evidence

Source: separate `austin-santec/Light-Workbench` repository, local checkout `ILM Python Testing`, branch `cleanup`, commit **`5d4972830e74cc1b1e718fb577916d132e58faf7`**. Evidence was read only from committed blobs with `git show`; no source modules/utilities were imported or executed and no source worktree state was used.

Evidence reviewed: `infrastructure/database/sql_migrations/0001`–`0007`, `infrastructure/database/migrations.py`, `infrastructure/database/sql_repositories.py`, `infrastructure/database/run_sessions.py`, `application/database_reporting.py`, `application/run_session_timing.py`, `domain/database_reporting.py`, `domain/database_run_lifecycle.py`, `domain/run_sessions.py`, and `docs/{DATABASE_ARCHITECTURE,DATA_ARCHITECTURE,DATABASE_ROADMAP,PROGRAM_DESIGN}.md`. Migrations/source establish the facts below; documentation describes additional workflow behavior. None establishes the state of an actual database until Stage B.

Supported SQL schema: exactly migrations **1–7**, with ordered names and SHA-256 checksums in `backend/app/reporting/schema.py`. Checksums follow the source runner: UTF-8 text with normalized LF newlines. These are verification metadata, not migration scripts to execute. SQL migration numbering is independent of legacy run/unit JSON schema versions.

Notable implemented changes: 0002 rejects negative accepted losses; 0003 adds nullable `IL_RUNS.station_number`; 0004 adds analysis/recommendation history and replacement provenance; 0005 replaces `analysis_exclusion_reason` with nullable `void_info_json` and expands analysis result vocabulary; 0006 renames the switch count to `last_reported_scpi_channel_count`, makes measurement roles explicit and adds recommendation measurement FKs; 0007 adds prospective run timing sessions and a timing summary view. Do not query the removed/renamed columns. Analytics does not consume the 0007 objects yet.

## Data contract for future review

All tables are under `dbo`. Business IDs/FKs below are `BIGINT`; UUID fields are `UNIQUEIDENTIFIER`; timestamps are UTC `DATETIME2(3)` without an encoded timezone. Losses are `DECIMAL(9,4)` and should retain decimal precision in future DTOs. JSON/notes use `NVARCHAR(MAX)`. `?` marks nullable fields. These are source facts, not final production response schemas.

| Object | Relevant fields/types and ownership |
| --- | --- |
| `UNITS` | PK `unit_id`; unique `main_board_serial NVARCHAR(100)`; `part_number NVARCHAR(100)?`, `front_panel_channel_count INT?`, `unit_model NVARCHAR(50)?`; created/updated timestamps. Current identity metadata is not a historical run snapshot. |
| `SWITCHES` | PK `switch_id`; unique `switch_serial NVARCHAR(100)`; `switch_model NVARCHAR(30)`, `firmware_version NVARCHAR(50)?`, `last_reported_scpi_channel_count INT`. The SCPI count is diagnostic, not physical capacity. |
| `UNIT_SWITCH_ASSIGNMENTS` | PK `assignment_id`; FKs `unit_id → UNITS`, `switch_id → SWITCHES`; installed/removed? timestamps; `initial_channel_map_json`. Filtered unique indexes permit one active assignment per unit/switch. Historical runs retain the original assignment; do not join using the currently active pairing. |
| `IL_RUNS` | PK `run_id`; FK `assignment_id`; `run_number INT`, unique `client_run_uuid`; start/end? timestamps; `station_number INT?`; `wavelength_mode VARCHAR(2)` (`SM`/`MM`), `operating_band VARCHAR(20)`, `application_version NVARCHAR(30)`; completion `VARCHAR(20)`, purpose `VARCHAR(30)`, analysis status `VARCHAR(20)`; self-FK `superseded_by_run_id?`; `part_number_snapshot NVARCHAR(100)?`, `front_panel_channel_count INT?`; hardware/limit JSON snapshots and nullable void JSON. |
| `IL_MEASUREMENTS` | PK `measurement_id`; unique `measurement_uuid`; FK `run_id`; `measurement_role VARCHAR(20)` (`logical_channel`/`extra_candidate`), `logical_channel INT?`, positive `physical_port INT`, `attempt_number INT`; paired `wavelength_1_nm`/`wavelength_2_nm SMALLINT` and corresponding decimal losses; reference JSON and written timestamp. Role-dependent filtered unique indexes distinguish logical-channel versus extra-port attempts. These are accepted whole wavelength pairs, including superseded attempts. |
| `CHANNEL_REPLACEMENTS` | PK `replacement_id`; FK `assignment_id`; `logical_channel`, `previous_physical_port`, `replacement_physical_port INT`; replacement timestamp; `related_run_id? → IL_RUNS`; `source_recommendation_id? → REPLACEMENT_ANALYSIS_RECOMMENDATIONS` (unique when set). Events document work; they are not unique replaced channels or proof of post-replacement verification. |
| `DESIGNATED_SPARES` | PK `spare_event_id`; FK `assignment_id`; `physical_port INT`; `action VARCHAR(20)` (`designated`/`undesignated`); recorded timestamp. Append-only events require a latest-event projection; row count is not active spare count. |
| `REPLACEMENT_ANALYSES` | PK `analysis_id`; unique `analysis_uuid`; context FK `run_id`; analyzed timestamp; `application_version VARCHAR(30)`; FK `source_measurement_high_watermark_id → IL_MEASUREMENTS`; `front_panel_channel_count INT`; wavelengths/criteria/result-details JSON; `result_status VARCHAR(40)`. Source fingerprint/provenance lives in the result snapshot, not a simple scalar freshness column. |
| `REPLACEMENT_ANALYSIS_RECOMMENDATIONS` | PK `recommendation_id`; FK `analysis_id`; `recommendation_rank INT`; `category VARCHAR(20)` (`required`/`optional`); logical/current/candidate ports `INT`; paired current/candidate losses, worst losses and improvement as decimals; nullable current/candidate measurement FKs added in 0006. Unique rank/channel/candidate constraints are scoped to an analysis. |
| `IL_RUN_SESSIONS` (0007; not consumed) | PK `session_id`; FK `run_id`; unique `client_session_uuid`; start/end? and last-checkpoint UTC timestamps; nonnegative `active_duration_ms`; `end_reason? VARCHAR(20)` (`completed`/`stopped`/`failed`/`interrupted`); `timing_quality VARCHAR(30)` (`confirmed`/`checkpoint_estimate`/`partial`). A filtered unique index permits only one open (`ended_at_utc IS NULL`) session per run; a history index orders by run/start/session. Runs created before 0007 have no session rows unless later source behavior creates them; absence is not zero active time. |
| `SCHEMA_MIGRATIONS` | PK `migration_id INT`; `migration_name NVARCHAR(200)`, `script_checksum CHAR(64)`, applied timestamp, `application_version NVARCHAR(30)`. Used for bounded compatibility checks only. |

Existing source FKs do not cascade deletes. Some cross-row rules, such as a replacement's related run sharing its assignment, are enforced by source repositories rather than by FK shape alone. No source writer repository was copied into analytics.

## Views and reporting semantics

- `vw_CurrentILMeasurements` (0006): ranks within run/role/logical-channel-or-extra-port by descending attempt number then measurement ID. It is a per-run current projection, not the assignment-wide effective production/COC result. Raw history remains in `IL_MEASUREMENTS`.
- `vw_CurrentChannelMap`: expands assignment initial-map JSON and overlays the latest replacement per logical channel by event timestamp/ID. It does not verify hardware routing or a post-replacement measurement.
- `vw_ConfirmedExtraPorts`: newest accepted extra candidate per assignment/physical port by written time, attempt and ID; excludes `excluded`/`superseded` source runs, requires a front-panel boundary and a port above it. Pending runs are not automatically excluded here; it is not a production-purpose filter.
- `vw_ReplacementRecommendationUsage`: joins saved analysis/recommendation rows to recorded replacements using recommendation ID. Usage is distinct from current analysis freshness and verified manufacturing work.
- `vw_RunTimingSummary` (0007; not consumed): one row per run. No sessions yields `timing_quality='unavailable'`; otherwise any `partial` session wins, then any `checkpoint_estimate`, then any open session yields `provisional`, and only the remaining fully closed set is `confirmed`. `active_test_ms` sums recorded session active durations. `stopped_ms` is NULL unless quality is `confirmed`, when it is nonnegative elapsed minus active time. For an open run, `elapsed_ms` uses `SYSUTCDATETIME()`, so repeated reads are non-deterministic. Runs predating 0007 have no historical sessions and therefore report unavailable unless a later source workflow records a session.

Source SQL constrains lifecycle to `in_progress`, `complete`, `stopped`, `failed`; purpose to `production`, `engineering`, `training`, `calibration`; analysis status to `pending`, `included`, `excluded`, `superseded`. Lifecycle completion is not passing quality. The richer display statuses in documentation are derived UI/read-model values, not SQL lifecycle enums.

**Inclusion discrepancy requiring M4 review:** `domain/database_run_lifecycle.py:is_normal_production_analysis_eligible` checks production + complete + included. `application/database_reporting.py:_matches` instead checks production + included + no superseding run, without explicitly checking complete. The metadata query's named `normal_report` selection reproduces the report service's three predicates. Add an explicit completion filter when examining complete runs; this is not an approved KPI population definition. `selection="all"` is an explicit diagnostic override; optional filters still intersect. Contradictory filters return no rows.

Source workflow documentation says completed runs become included, stopped/failed remain pending, assignment changes preserve history, and current effective results select newest technically compatible whole pairs. Analysis source-state validation in the source repository checks assignment-wide evidence/fingerprint, beyond the scalar high watermark. Do not infer freshness or final disposition from one saved status. The expanded analysis result set includes `optimized`, `recommendations_available`, `verification_required`, `pass_no_viable_optimization`, `fail_no_viable_recovery`, `incomplete_input`, `review_required` and two retained legacy classifications. None is a confirmed manufacturing disposition.

## Permission and authentication design

An administrator must provision a **new dedicated reporting principal** for the approved non-production target. Windows authentication uses the process's Windows identity: launch under the dedicated approved account, not an interactive writer/admin account. SQL authentication requires separately configured credentials through the local environment/organization secret tooling; never copy source writer credentials. Do not store credentials in shell history, tracked files or command-line arguments.

Use a dedicated database role with object-level SELECT on only these five consumed objects. The source's schema-wide reporting grant is broader than this design; do not reuse it or `db_datareader`, `db_datawriter`, owner/security/DDL/admin roles. No view/measurement/history permissions are needed for the current queries.

Migration 0007 grants `vw_RunTimingSummary` to the source role `lwb_report_reader`; analytics does not use that role or consume the view. Any future analytics use would require a separately reviewed object-level `SELECT` grant to `analytics_reporting_readonly`. That grant is **future/not yet requested** and is not part of the guidance below.

Illustrative **administrator-managed guidance only**, never executed by analytics or tests:

```sql
CREATE ROLE analytics_reporting_readonly AUTHORIZATION dbo;
GRANT SELECT ON OBJECT::dbo.SCHEMA_MIGRATIONS TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.IL_RUNS TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.UNIT_SWITCH_ASSIGNMENTS TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.UNITS TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.SWITCHES TO analytics_reporting_readonly;
-- DBA creates/maps the separately approved user and adds role membership.
```

DBAs must audit inherited Windows groups, server/database roles, `public` grants and explicit object/column/schema/database permissions. No DML, DDL, administrative privileges, impersonation or write-capable procedure execution is appropriate. Revoke unwanted inherited memberships/grants through the approved administration process. No destructive negative-write test is permitted. Inspect effective permission metadata instead.

Preflight rejects known administrative/broad fixed-role memberships, database CONTROL/CREATE TABLE/EXECUTE, dbo schema SELECT/ALTER, missing object SELECT, and object INSERT/UPDATE/DELETE/ALTER/CONTROL on consumed objects. Unknown/NULL permission results fail closed. This is a conservative gate, not an exhaustive privilege auditor: permissions on other objects, column grants and custom server/database roles require independent DBA validation. Object metadata is ordinarily visible through the necessary SELECT grants; no broad VIEW DEFINITION/administrative grant is requested.

Read-only enforcement comes from database permissions. pyodbc `readonly=True` and `ApplicationIntent=ReadOnly` are additional intent hints, not a security boundary. [pyodbc connection options](https://github.com/mkleehammer/pyodbc/wiki/The-pyodbc-Module) and [SQL Server effective-permission checks](https://learn.microsoft.com/en-us/sql/t-sql/functions/has-perms-by-name-transact-sql) describe those mechanisms.

## Configuration and connection boundary

`ReportingSettings` reads **environment variables only**, prefix `LWA_REPORTING_`. It does not read `.env`, DSNs, the related application's files, known development defaults, or an approval from a database-looking name. Leave `LWA_REPORTING_ENABLED` unset/false for Stage A. The HTTP settings class never reads/constructs reporting settings.

| Variable suffix | Requirement / default |
| --- | --- |
| `ENABLED` | false by default; true requires every approval field below |
| `TARGET_KIND`, `IDENTITY_KIND` | Explicit `nonproduction`, `dedicated_readonly` |
| `APPROVAL_REFERENCE` | Nonblank local approval/change reference, maximum 100 characters |
| `SERVER`, `PORT`, `DATABASE` | No server/database defaults; TCP DNS hostname and port (default 1433), restricted database identifier |
| `APPROVED_SERVER`, `APPROVED_PORT`, `APPROVED_DATABASE` | Separately supplied exact approved endpoint/database; port must be explicit. Server comparison ignores case; database comparison is exact. Any mismatch fails before driver loading. |
| `AUTHENTICATION` | `windows` default, or explicit `sql` |
| `USERNAME`, `PASSWORD` | Required nonblank secret values for SQL auth; forbidden for Windows auth |
| `CONNECTION_TIMEOUT_SECONDS` | 5 default, 1–15 inclusive |
| `QUERY_TIMEOUT_SECONDS` | 10 default, 1–30 inclusive |

Supported adapter: conventional 64-bit Python 3.12+ and optional pyodbc 5.4+ with Microsoft ODBC Driver 18. Validated locally: CPython 3.14.7 x64, pyodbc 5.4.0 import and Driver 18 enumeration, **without connecting**. The separate 32-bit hardware runtime is not reused. Driver import/enumeration is lazy; disabled reporting never loads it. No pooling is enabled by this isolated diagnostic adapter.

Connections use explicit TCP endpoints, `Encrypt=yes`, `TrustServerCertificate=no`, ODBC-escaped values, `readonly=True`, and autocommit for short SELECT statements. There is no TLS bypass or arbitrary connection-string setting. The server certificate must chain to a trusted CA and match the approved hostname; fix trust/hostname provisioning instead of disabling verification. See [Microsoft ODBC encryption documentation](https://learn.microsoft.com/en-us/sql/connect/odbc/windows/features-of-the-microsoft-odbc-driver-for-sql-server-on-windows) and [query/login timeout distinction](https://github.com/mkleehammer/pyodbc/wiki/Connection).

Configuration declarations cannot prove that a target is non-production, that DNS aliases resolve as intended, or that an identity is dedicated. Stage B requires external administrator/environment confirmation. Once connected, `DB_NAME()` must exactly match the approved database before schema/record reads. Every operation creates a short-lived connection, sets the query timeout before cursor use, checks compatibility on that same connection and explicitly closes cursor then connection on success/failure. No commit, migration, seed, reset, permission-changing or hardware operation exists.

## Implemented operations and cost bounds

`ReportingRepository` exposes `check_schema()` and `list_runs(RunQuery)`. `SqlServerReportingRepository` implements both through `SqlServerAdapter`. These are internal Python operations; no raw SQL or caller-provided object identifiers are accepted by the repository.

| Operation | Read boundary |
| --- | --- |
| Connection/permissions | One scalar current-database/fixed-role/permission projection, then five object-permission rows; no unit/operator data |
| Schema compatibility | TOP 8 bounded ledger query must yield exactly the seven reviewed IDs/names/checksums; a migration above 7 is ordered into the seven-row fetch boundary so it cannot be hidden by the existing cap. Missing/older/newer/modified histories fail. A TOP 128 catalog query checks consumed dbo user-table column names, system types, lengths, scale and nullability. Temporal storage lengths are normalized away; `datetime2` scale 3 is required. No cache or schema repair. |
| Run/identity page | Explicit 17-column projection from `IL_RUNS → UNIT_SWITCH_ASSIGNMENTS → UNITS/SWITCHES`, preserving historical assignment ownership. Returns run/assignment/unit/switch IDs, main-board/switch serials, switch model, run number, start/end UTC, mode, completion/purpose/analysis status, superseding run ID, run front-panel count and station number. |

Run reads require an aware UTC interval `[started_from, started_before)`, positive and at most 31 days. Optional equality filters: switch model (1–30 characters, bound parameter), wavelength mode, run purpose, completion and analysis status. Defaults use the named normal-report selection above. SQL values, dates, filters, limit and offset use `?` parameters; SQL identifiers/order are fixed in code. Driver-returned naive `DATETIME2` values are interpreted as UTC; aware values normalize to UTC.

Identity labels/model come from the joined unit/switch tables and may be mutable; this metadata page does not claim frozen historical product labels or criteria. Future historical quality reporting must review the run snapshots independently.

`limit` is an integer 1–100 (default 50); `offset` 0–1000 (default 0). Ordering is `(run_started_at_utc DESC, run_id DESC)` for ties. Fetch one extra row (maximum 101) to report `has_more`; return at most `limit` items. There is no COUNT scan, total/KPI calculation, JSON snapshot/history fetch or unbounded `fetchall`. Empty pages are valid. Offset paging across concurrent inserts is not snapshot-consistent; reviewed keyset paging may be a future decision.

Date/result caps limit logical scope, not physical SQL work. The existing assignment/date and status/purpose/analysis indexes do not guarantee an efficient global timestamp seek/order. Stage B must inspect plans/reads on approved small non-production data before any larger deployment; timeouts are a guard, not a proven runtime SLA. Analytics never adds indexes to the source database. Full FK/index/CHECK-constraint verification and live migration history remain Stage B administration checks; consumed-column validation is not a full schema audit.

## Sensitive fields and deferred metrics

Serials, part numbers, operator fields (`tested_by`, `written_by`, `installed_by`, `removed_by`, `replaced_by`, `recorded_by`, `analyzed_by`), notes/reasons, station/equipment identity, UUIDs and JSON snapshots may be confidential. Current internal rows include serials to establish identity joins; they must not be logged, exported or served over unauthenticated HTTP. Rows/settings suppress sensitive repr fields; the diagnostic prints only state and bounded page count/has-more. Do not serialize internal models into HTTP responses.

Driver exceptions become sanitized codes: `driver_unavailable`, `connection_timeout`, `query_timeout`, `authentication_failed`, `permission_denied`, `connection_unavailable`, `schema_incompatible`, `target_mismatch`, `read_failed`, `cleanup_failed`, or `disabled`. Logs retain only code/phase, never raw exception arguments, SQL parameters, records, target details or credentials. Cleanup attempts both resources and preserves a primary failure. CLI configuration failures print only `configuration_invalid`.

Questions before M4: reconcile the two inclusion rules; distinguish unique units/runs, channels/attempts and front-panel/extra-only/partial runs; define timezone/period boundaries; validate prospective 0007 active-time coverage and quality while retaining elapsed fallback or labels for pre-0007, partial and estimated timing; distinguish elapsed lifecycle time from active time; define technical validity/voiding and late retests; define replacement events versus unique channels, verified work and current map; validate saved analysis fingerprints and stale status; distinguish no viable recovery from final disposition. No final KPI formulas, quality outcomes or disposition fields are fabricated here.

## Tests, local diagnostic and Stage B acceptance

From `backend/`:

```powershell
.venv\Scripts\python.exe -m pip install -e ".[dev,reporting]" -c requirements-dev.lock
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe -m ruff check .
.venv\Scripts\python.exe -m ruff format --check .
.venv\Scripts\python.exe -m pip check
.venv\Scripts\python.exe -m app.reporting
# {"reporting": "disabled"} by default; no driver load or connection.
```

After **separate Stage B authorization and local administrator-supplied configuration only**:

```powershell
# Without --verify: configured_not_verified; no connection.
.venv\Scripts\python.exe -m app.reporting
# These commands DO connect; do not run during Stage A.
.venv\Scripts\python.exe -m app.reporting --verify
.venv\Scripts\python.exe -m app.reporting --verify --runs --started-from 2026-11-01T00:00:00Z --started-before 2026-11-02T00:00:00Z
```

Diagnostic states distinguish `disabled`, `configured_not_verified`, `compatible` (only after checks), `incompatible` and `unavailable` with sanitized error codes. Success exits 0; sanitized configuration/read failures exit 2. A compatible connection does not establish full Stage B acceptance or production readiness. Process liveness remains a separate existing HTTP endpoint. There are no automatic startup probes, retry loops or background connections.

Stage B checklist (all pending):

- Explicit authorization of exact non-production host/port/database and separate identity; verify environment and DNS independently. Never infer approval from source documentation.
- DBA provisioning/review of effective read-only privileges, inherited groups/roles and metadata visibility, without analytics executing grants or write tests.
- Confirm 64-bit runtime/driver, login/query timeouts, certificate chain/hostname validation and no TLS bypass against the actual server.
- Verify exact migration history/checksums, consumed columns and separately inspect relationships, constraints, indexes and database settings.
- Run bounded schema/run reads; validate assignment/UTC/filter/order behavior and query plans/cost. Keep evidence private and sanitized.
- Verify negative permission metadata and sanitized failure/cleanup behavior without DML/DDL attempts, destructive setup or production access. Record outcome in `STATUS.md` only after evidence exists.

Offline tests validate generated SQL/binding and fake-driver behavior; they do not execute T-SQL or prove real schema, TLS, effective privileges, query plans or driver timeout behavior against SQL Server. Production access still requires explicit authorization, a reviewed deployment/access boundary and final metric/data-disclosure decisions.
