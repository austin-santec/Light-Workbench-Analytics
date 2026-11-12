# Reporting database foundation — Milestone 3

**Stage A is offline-tested and the owner has authorized Stage B for one locally configured non-production target and dedicated read-only identity.** The owner, not Codex, performed the first compatible connection and bounded run read recorded in `STATUS.md`. Two aggregate-only run diagnostics feed the separate Overview live card. The November 11 unit-lookup approval additionally permits row-level unit, run, channel and hardware evidence—including real serials and operators—over the loopback API. Real values remain forbidden in logs, tests, docs and repository artifacts. Every established frontend KPI, chart, table and fixture remains synthetic pending separate Unit-screen work.

## Reviewed baseline and evidence

Source: separate `austin-santec/Light-Workbench` repository, local checkout `ILM Python Testing`, branch `cleanup`, commit **`5d4972830e74cc1b1e718fb577916d132e58faf7`**. Evidence was read only from committed blobs with `git show`; no source modules/utilities were imported or executed and no source worktree state was used.

Evidence reviewed: `infrastructure/database/sql_migrations/0001`–`0007`, `infrastructure/database/migrations.py`, `infrastructure/database/sql_repositories.py`, `infrastructure/database/run_sessions.py`, `application/database_reporting.py`, `application/run_session_timing.py`, `domain/database_reporting.py`, `domain/database_run_lifecycle.py`, `domain/run_sessions.py`, and `docs/{DATABASE_ARCHITECTURE,DATA_ARCHITECTURE,DATABASE_ROADMAP,PROGRAM_DESIGN}.md`. Migrations/source establish the facts below; documentation describes additional workflow behavior. None establishes the state of an actual database until Stage B.

Supported SQL schema: exactly migrations **1–7**, with ordered names and SHA-256 checksums in `backend/app/reporting/schema.py`. Checksums follow the source runner: UTF-8 text with normalized LF newlines. These are verification metadata, not migration scripts to execute. SQL migration numbering is independent of legacy run/unit JSON schema versions.

Notable implemented changes: 0002 rejects negative accepted losses; 0003 adds nullable `IL_RUNS.station_number`; 0004 adds analysis/recommendation history and replacement provenance; 0005 replaces `analysis_exclusion_reason` with nullable `void_info_json` and expands analysis result vocabulary; 0006 renames the switch count to `last_reported_scpi_channel_count`, makes measurement roles explicit and adds recommendation measurement FKs; 0007 adds prospective run timing sessions and a timing summary view. Do not query the removed/renamed columns. Analytics now consumes only the aggregate timing view from 0007, not session rows.

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
- `vw_RunTimingSummary` (0007; aggregate consumption authorized): one row per run. No sessions yields `timing_quality='unavailable'`; otherwise any `partial` session wins, then any `checkpoint_estimate`, then any open session yields `provisional`, and only the remaining fully closed set is `confirmed`. `active_test_ms` sums recorded session active durations. `stopped_ms` is NULL unless quality is `confirmed`, when it is nonnegative elapsed minus active time. For an open run, `elapsed_ms` uses `SYSUTCDATETIME()`, so repeated reads are non-deterministic. Runs predating 0007 have no historical sessions and therefore report unavailable unless a later source workflow records a session. The HTTP query reads only `active_test_ms`, `elapsed_ms`, `stopped_ms` and `timing_quality` for ended runs; it never projects `run_id`.

Source SQL constrains lifecycle to `in_progress`, `complete`, `stopped`, `failed`; purpose to `production`, `engineering`, `training`, `calibration`; analysis status to `pending`, `included`, `excluded`, `superseded`. Lifecycle completion is not passing quality. The richer display statuses in documentation are derived UI/read-model values, not SQL lifecycle enums.

**Inclusion discrepancy requiring M4 review:** `domain/database_run_lifecycle.py:is_normal_production_analysis_eligible` checks production + complete + included. `application/database_reporting.py:_matches` instead checks production + included + no superseding run, without explicitly checking complete. The metadata query's named `normal_report` selection reproduces the report service's three predicates. Add an explicit completion filter when examining complete runs; this is not an approved KPI population definition. `selection="all"` is an explicit diagnostic override; optional filters still intersect. Contradictory filters return no rows.

Source workflow documentation says completed runs become included, stopped/failed remain pending, assignment changes preserve history, and current effective results select newest technically compatible whole pairs. Analysis source-state validation in the source repository checks assignment-wide evidence/fingerprint, beyond the scalar high watermark. Do not infer freshness or final disposition from one saved status. The expanded analysis result set includes `optimized`, `recommendations_available`, `verification_required`, `pass_no_viable_optimization`, `fail_no_viable_recovery`, `incomplete_input`, `review_required` and two retained legacy classifications. None is a confirmed manufacturing disposition.

## Permission and authentication design

An administrator must provision a **new dedicated reporting principal** for the approved non-production target. Windows authentication uses the process's Windows identity: launch under the dedicated approved account, not an interactive writer/admin account. SQL authentication requires separately configured credentials through the local environment/organization secret tooling; never copy source writer credentials. Do not store credentials in shell history, tracked files or command-line arguments.

Use a dedicated database role with object-level SELECT on only the 14 objects consumed by current endpoints: the original five tables and `vw_RunTimingSummary`, plus `IL_MEASUREMENTS`, `vw_CurrentILMeasurements`, `CHANNEL_REPLACEMENTS`, `vw_CurrentChannelMap`, `vw_ConfirmedExtraPorts`, `DESIGNATED_SPARES`, `REPLACEMENT_ANALYSES` and `REPLACEMENT_ANALYSIS_RECOMMENDATIONS`. The source's schema-wide reporting grant is broader than this design; do not reuse it or `db_datareader`, `db_datawriter`, owner/security/DDL/admin roles.

The owner-provided role-update script lists object-level SELECT for those eight new consumed objects and also `IL_RUN_SESSIONS`. The current API does **not** read `IL_RUN_SESSIONS`, so analytics does not add that table to `COLUMNS`, object-type validation or permission preflight; timing remains through `vw_RunTimingSummary`. The extra administrator-managed grant does not authorize analytics to query session rows. Target and identity values in the local access process remain outside this public documentation.

Migration 0007 grants `vw_RunTimingSummary` to the source role `lwb_report_reader`; analytics does not use that source role. The owner separately provisioned and reviewed object-level `SELECT` for the dedicated analytics identity as recorded in `STATUS.md`.

Illustrative **administrator-managed guidance only**, never executed by analytics or tests:

```sql
CREATE ROLE analytics_reporting_readonly AUTHORIZATION dbo;
GRANT SELECT ON OBJECT::dbo.SCHEMA_MIGRATIONS TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.IL_RUNS TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.UNIT_SWITCH_ASSIGNMENTS TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.UNITS TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.SWITCHES TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.vw_RunTimingSummary TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.IL_MEASUREMENTS TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.vw_CurrentILMeasurements TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.CHANNEL_REPLACEMENTS TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.vw_CurrentChannelMap TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.vw_ConfirmedExtraPorts TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.DESIGNATED_SPARES TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.REPLACEMENT_ANALYSES TO analytics_reporting_readonly;
GRANT SELECT ON OBJECT::dbo.REPLACEMENT_ANALYSIS_RECOMMENDATIONS TO analytics_reporting_readonly;
-- DBA creates/maps the separately approved user and adds role membership.
```

DBAs must audit inherited Windows groups, server/database roles, `public` grants and explicit object/column/schema/database permissions. No DML, DDL, administrative privileges, impersonation or write-capable procedure execution is appropriate. Revoke unwanted inherited memberships/grants through the approved administration process. No destructive negative-write test is permitted. Inspect effective permission metadata instead.

Preflight rejects known administrative/broad fixed-role memberships, database CONTROL/CREATE TABLE/EXECUTE, dbo schema SELECT/ALTER, missing object SELECT, and object INSERT/UPDATE/DELETE/ALTER/CONTROL on consumed objects. Unknown/NULL permission results fail closed. This is a conservative gate, not an exhaustive privilege auditor: permissions on other objects, column grants and custom server/database roles require independent DBA validation. Object metadata is ordinarily visible through the necessary SELECT grants; no broad VIEW DEFINITION/administrative grant is requested.

Read-only enforcement comes from database permissions. pyodbc `readonly=True` and `ApplicationIntent=ReadOnly` are additional intent hints, not a security boundary. [pyodbc connection options](https://github.com/mkleehammer/pyodbc/wiki/The-pyodbc-Module) and [SQL Server effective-permission checks](https://learn.microsoft.com/en-us/sql/t-sql/functions/has-perms-by-name-transact-sql) describe those mechanisms.

## Configuration and connection boundary

`ReportingSettings` reads **environment variables only**, prefix `LWA_REPORTING_`. It does not read `.env`, DSNs, the related application's files, known development defaults, or an approval from a database-looking name. Leave `LWA_REPORTING_ENABLED` unset/false unless intentionally using the authorized target. FastAPI constructs reporting settings only in the new request dependency; application creation/startup does not construct the adapter, load pyodbc or connect.

| Variable suffix | Requirement / default |
| --- | --- |
| `ENABLED` | false by default; true requires every approval field below |
| `TARGET_KIND`, `IDENTITY_KIND` | Explicit `nonproduction`, `dedicated_readonly` |
| `APPROVAL_REFERENCE` | Nonblank local approval/change reference, maximum 100 characters |
| `SERVER`, `PORT`, `DATABASE` | No server/database defaults; TCP DNS hostname and port (default 1433), restricted database identifier |
| `APPROVED_SERVER`, `APPROVED_PORT`, `APPROVED_DATABASE` | Separately supplied exact approved endpoint/database; port must be explicit. Server comparison ignores case; database comparison is exact. Any mismatch fails before driver loading. |
| `AUTHENTICATION` | `windows` default, or explicit `sql`; SQL authentication is the owner's preferred method for the approved local test target |
| `USERNAME`, `PASSWORD` | Required nonblank secret values for SQL auth; forbidden for Windows auth |
| `TRUST_SERVER_CERTIFICATE` | false by default; true may skip certificate validation only for a declared `nonproduction` target |
| `CONNECTION_TIMEOUT_SECONDS` | 5 default, 1–15 inclusive |
| `QUERY_TIMEOUT_SECONDS` | 10 default, 1–30 inclusive |

Supported adapter: conventional 64-bit Python 3.12+ and optional pyodbc 5.4+ with Microsoft ODBC Driver 18. Validated locally: CPython 3.14.7 x64, pyodbc 5.4.0 import and Driver 18 enumeration, **without connecting**. The separate 32-bit hardware runtime is not reused. Driver import/enumeration is lazy; disabled reporting never loads it. No pooling is enabled by this isolated diagnostic adapter.

Connections use explicit TCP endpoints, mandatory `Encrypt=yes`, ODBC-escaped values, `readonly=True`, and autocommit for short SELECT statements. Certificate validation is the default (`TrustServerCertificate=no`): the server certificate must chain to a trusted CA and match the approved hostname. The owner-approved, default-off `LWA_REPORTING_TRUST_SERVER_CERTIFICATE=true` opt-in may set `TrustServerCertificate=yes` only for a declared non-production target and must never be used for production. This weaker mode encrypts the connection but does not verify the server's identity, so a machine in the middle could impersonate the server. No arbitrary connection-string setting can disable encryption. See [Microsoft ODBC encryption documentation](https://learn.microsoft.com/en-us/sql/connect/odbc/windows/features-of-the-microsoft-odbc-driver-for-sql-server-on-windows) and [query/login timeout distinction](https://github.com/mkleehammer/pyodbc/wiki/Connection).

Configuration declarations cannot prove that a target is non-production, that DNS aliases resolve as intended, or that an identity is dedicated. Stage B requires external administrator/environment confirmation. Once connected, `DB_NAME()` must exactly match the approved database before schema/record reads. Every operation creates a short-lived connection, sets the query timeout before cursor use, checks compatibility on that same connection and explicitly closes cursor then connection on success/failure. No commit, migration, seed, reset, permission-changing or hardware operation exists.

## Implemented operations and cost bounds

`ReportingRepository` exposes the existing schema/run/aggregate operations plus `search_units`, `get_unit_detail`, `get_run_channels` and `get_assignment_hardware`. `SqlServerReportingRepository` implements them through `SqlServerAdapter`. No raw SQL or caller-provided object identifiers are accepted by the repository. Every unit lookup uses fixed projections and bound values; only the recommendation `IN` placeholder count is generated, from the bounded analysis IDs just read on the same connection.

| Operation | Read boundary |
| --- | --- |
| Connection/permissions | One scalar current-database/fixed-role/permission projection, then 14 object-permission rows; no unit/operator data |
| Schema compatibility | TOP 8 bounded ledger query ordered by migration ID must yield exactly the seven reviewed IDs/names/checksums. Python reads `len(MIGRATIONS) + 1`, so missing/older/newer/gapped/modified histories fail without a special ordering case. The catalog TOP is derived from the consumed-column count plus bounded slack for other columns on the same reviewed objects; reaching the cap fails closed. Generated `IN`/`VALUES` placeholders track the object list. Consumed dbo table/view (`U`/`V`) column names, system types, lengths, scale and nullability must match. Temporal storage lengths are normalized away; `datetime2` scale 3 is required. No cache or schema repair. |
| Run/identity page | Explicit 17-column projection from `IL_RUNS → UNIT_SWITCH_ASSIGNMENTS → UNITS/SWITCHES`, preserving historical assignment ownership. Returns run/assignment/unit/switch IDs, main-board/switch serials, switch model, run number, start/end UTC, mode, completion/purpose/analysis status, superseding run ID, run front-panel count and station number. |
| Aggregate run activity | On one connection after preflight, one `COUNT_BIG`/`GROUP BY` statement counts runs by purpose/completion and open state; a second statement fetches at most 5001 ended-run rows containing only three numeric duration columns and timing quality. Optional filters are bound. Python computes exact median and nearest-rank P90 over at most 5000 rows and marks larger samples incomplete. |
| Test time by configuration | On one connection after preflight, one parameterized TOP 5001 read returns historical run model/mode/channel-count group keys, active/elapsed duration columns and timing quality only. Python groups at most 5000 rows, retains null channel count as a group, excludes open runs from statistics, and marks overflow incomplete. |
| Unit search | One TOP 21 read; contains matching escapes SQL LIKE metacharacters and binds the same pattern for main-board and historical switch serial matching. Returns 20 rows plus `has_more`. |
| Unit detail | TOP 1 unit, TOP 501 assignment history and TOP 201 run history. Run rows use bounded correlated current-measurement aggregates and the timing view. Python strictly parses limit/void JSON; malformed limits become null. |
| Run channels | TOP 1 run criteria read and TOP 5001 attempt read, capped to 5000 with `incomplete`. Raw and current-measurement views determine every attempt and `is_current`; Python applies the source strict classifier. |
| Assignment hardware | TOP 1 existence; TOP 501 each for current map, replacements, confirmed extras and latest-per-port spares; TOP 201 analyses and TOP 2001 recommendations. Any overflow sets one `incomplete` flag. |

The newly consumed view columns are validated fail-closed offline. On 2026-11-12 the owner's catalog check of the Stage B test database confirmed every gated column of `vw_RunTimingSummary`, `vw_CurrentILMeasurements`, `vw_CurrentChannelMap` and `vw_ConfirmedExtraPorts`. That includes `timing_session_count` as nullable despite its `COALESCE`, and every `vw_CurrentChannelMap` column except `assignment_id` as nullable. The same check confirmed SELECT on all nine new objects and no INSERT/UPDATE/DELETE for the read-only login.

Run reads require an aware UTC interval `[started_from, started_before)`, positive and at most 31 days. Optional equality filters: switch model (1–30 characters, bound parameter), wavelength mode, run purpose, completion and analysis status. Defaults use the named normal-report selection above. SQL values, dates, filters, limit and offset use `?` parameters; SQL identifiers/order are fixed in code. Driver-returned naive `DATETIME2` values are interpreted as UTC; aware values normalize to UTC.

Identity labels/model come from the joined unit/switch tables and may be mutable; this metadata page does not claim frozen historical product labels or criteria. Future historical quality reporting must review the run snapshots independently.

`limit` is an integer 1–100 (default 50); `offset` 0–1000 (default 0). Ordering is `(run_started_at_utc DESC, run_id DESC)` for ties. Fetch one extra row (maximum 101) to report `has_more`; return at most `limit` items. There is no COUNT scan, total/KPI calculation, JSON snapshot/history fetch or unbounded `fetchall`. Empty pages are valid. Offset paging across concurrent inserts is not snapshot-consistent; reviewed keyset paging may be a future decision.

Date/result caps limit logical scope, not physical SQL work. The existing assignment/date and status/purpose/analysis indexes do not guarantee an efficient global timestamp seek/order. Stage B must inspect plans/reads on approved small non-production data before any larger deployment; timeouts are a guard, not a proven runtime SLA. Analytics never adds indexes to the source database. Full FK/index/CHECK-constraint verification and live migration history remain Stage B administration checks; consumed-column validation is not a full schema audit.

The aggregate endpoint uses the same aware UTC `[started_from, started_before)` guard and 31-day maximum. Purpose is optional and defaults to all four purposes; optional mode and switch-model filters also intersect. Run totals count starts in the window and must be labeled as runs, never units. Open runs are counted separately and excluded from duration statistics. Timing-quality counts cover ended runs. Active/stopped statistics use only `confirmed` timing histories; elapsed statistics use every ended run. Values remain at millisecond precision until conversion to seconds. Median is exact; nearest-rank P90 selects one-based `ceil(0.90*n)`. Valid elapsed observations strictly greater than 5,400 seconds are flagged and remain included. Samples report `no_data` with null numbers at n=0, `small_sample` for n 1–9 and `ok` otherwise.

The 5000-row cap bounds only the numeric duration sample. The query requests TOP 5001 to detect overflow; when overflow exists the response sets `incomplete: true` and statistics describe only the bounded sample. Counts remain SQL aggregates. This is an explicit incomplete diagnostic, not a production KPI or a substitute for T12 per-finished-unit cumulative timing.

The configuration endpoint uses the same UTC window and optional purpose/mode filters, without a switch-model filter. It groups using the switch from the run's historical assignment, the run's wavelength mode and the run's saved front-panel channel count. Ended-run elapsed statistics include all timing qualities; active statistics include only `confirmed` timing. It also reports open runs, confirmed/unavailable coverage, strict over-90-minute flags and median elapsed divided by channel count. Null channel count or no elapsed sample yields null seconds per channel. Output ordering is model, mode, then channels descending with null last. This remains T09/T10-style run-level evidence and cannot replace T12's all-history, verified-finished-unit cumulative primary.

## Sensitive fields and deferred metrics

Serials, part numbers, operator fields (`tested_by`, `written_by`, `installed_by`, `removed_by`, `replaced_by`, `recorded_by`, `analyzed_by`), notes/reasons and station identity are now approved in unit-lookup HTTP responses on loopback. They still must not appear in logs, fixtures, docs, exports or repository artifacts. UUIDs and raw JSON snapshots are not returned. Aggregate endpoints remain nonidentifying. Rows/settings suppress sensitive repr fields; the diagnostic prints only state and bounded page count/has-more.

Driver exceptions become sanitized codes: `driver_unavailable`, `connection_timeout`, `query_timeout`, `authentication_failed`, `permission_denied`, `connection_unavailable`, `schema_incompatible`, `target_mismatch`, `read_failed`, `cleanup_failed`, or `disabled`. Logs retain only code/phase, never raw exception arguments, SQL parameters, records, target details or credentials. Cleanup attempts both resources and preserves a primary failure. CLI configuration failures print only `configuration_invalid`.

Remaining metric work: reconcile the two inclusion rules; distinguish unique units/runs, channels/attempts and front-panel/extra-only/partial runs; validate prospective 0007 active-time coverage and quality while retaining elapsed fallback or labels for pre-0007, partial and estimated timing; distinguish elapsed lifecycle time from active time; define technical validity/voiding and late retests; define replacement events versus unique channels, verified work and current map; validate saved analysis fingerprints and stale status; distinguish no viable recovery from final disposition. This endpoint implements only approved secondary run diagnostics. No final production KPI, quality outcome or disposition field is fabricated.

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

With the **Stage B-authorized target and local administrator-supplied configuration only** (owner-run; these commands connect and were not run for this Part A implementation):

```powershell
# Without --verify: configured_not_verified; no connection.
.venv\Scripts\python.exe -m app.reporting
# These commands DO connect; run only from the owner's authorized terminal.
.venv\Scripts\python.exe -m app.reporting --verify
.venv\Scripts\python.exe -m app.reporting --verify --runs --started-from 2026-11-01T00:00:00Z --started-before 2026-11-02T00:00:00Z
```

Diagnostic states distinguish `disabled`, `configured_not_verified`, `compatible` (only after checks), `incompatible` and `unavailable` with sanitized error codes. Success exits 0; sanitized configuration/read failures exit 2. A compatible connection does not establish full Stage B acceptance or production readiness. Process liveness remains separate from reporting activity. There are no automatic startup probes, retry loops or background connections.

Stage B checklist and remaining acceptance work (see `STATUS.md` for owner-run evidence):

- Exact non-production host/port/database and the separate identity are authorized and kept only in local configuration; environment and DNS still require independent operational control.
- DBA provisioning and a bounded effective-permission review were owner-run. Broader inherited/custom permissions still require ongoing administrator control; analytics never executes grants or write tests.
- Confirm 64-bit runtime/driver and login/query timeouts, plus either certificate chain/hostname validation or the documented owner-approved certificate-trust opt-in for a declared non-production target, against the actual server.
- Verify exact migration history/checksums, consumed columns and separately inspect relationships, constraints, indexes and database settings.
- Bounded schema/run reads were owner-run and sanitized; aggregate endpoint acceptance and query plan/cost on realistic volume remain owner-run follow-up work.
- Verify negative permission metadata and sanitized failure/cleanup behavior without DML/DDL attempts, destructive setup or production access. Record outcome in `STATUS.md` only after evidence exists.

Offline tests validate generated SQL/binding and fake-driver behavior; they do not execute T-SQL or prove real schema, TLS, effective privileges, query plans or driver timeout behavior against SQL Server. Production access still requires explicit authorization, a reviewed deployment/access boundary and final metric/data-disclosure decisions.
