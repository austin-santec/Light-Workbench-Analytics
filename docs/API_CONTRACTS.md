# API contracts — Milestones 2–3, Stage B aggregates and unit lookup

Local base: `http://127.0.0.1:8000`. API version: `v1`; service version: `0.1.0`. All twelve implemented operations are GET and use Pydantic response models in `backend/app/schemas.py`. `/docs` and `/openapi.json` expose the generated specification. No authentication or arbitrary HTTP SQL execution exists. The Overview consumes the two run diagnostics plus the channel-activity and Q02 failure-rate diagnostics; the four unit-lookup operations are approved row-level evidence APIs.

The Stage B HTTP slices provide two aggregate-only run diagnostics, channel-activity and Q02 failure-rate diagnostics, replacement activity, and the approved unit, run-channel and assignment-hardware evidence lookups. They may consume reporting data only after explicit request-time opt-in; FastAPI startup still does not load pyodbc or connect. Unit lookup may return serials, operators and row-level records under the November 11 owner decision. Real values stay in HTTP responses and are never logged, tested or documented. Synthetic fixtures remain available whenever reporting is not connected. Local diagnostic and database boundaries are documented in [REPORTING_DATABASE.md](REPORTING_DATABASE.md).

## Implemented operations

`GET /api/v1/health/live` has no defined parameters. `HealthResponse`:

```json
{"status":"alive","scope":"process_only"}
```

This proves process responsiveness only, never SQL/database readiness.

`GET /api/v1/system/info` has no defined parameters. `SystemInfo`:

```json
{"service":"Light Workbench Analytics API","service_version":"0.1.0","api_version":"v1","environment":"development","stage":"development_foundation","data_source":"not_connected"}
```

`service` is the configured string; `environment` is `development` or `test`. Remaining identifiers are fixed for this foundation; the service version follows the backend package. No host paths, credentials or infrastructure details are returned.

`GET /api/v1/demo/runs` returns `DemoRunsResponse`: `synthetic` is literal `true`, `items` is an array of `DemoRun`, and `pagination` is a `Pagination` object. These are fictional fixture contracts, not proposed production schemas.

| Query parameter | Type / validation | Default |
| --- | --- | --- |
| `purpose` | Optional enum: `production`, `engineering`, `training`, `calibration` | All purposes |
| `model` | Optional enum: `DEMO-MODEL-A`, `DEMO-MODEL-B` | Both fictional models |
| `limit` | Integer 1–100 inclusive | 20 |
| `offset` | Integer 0–10000 inclusive | 0 |

Filters use exact, case-sensitive matching and intersect (AND), before pagination. Unknown parameters, invalid enums and malformed/out-of-range integers return 422. Empty strings are invalid. Repeated scalar query keys use the framework's last value; clients should send each key once. Newest-first ordering is fixed by the fixture, with unique run IDs. There are six runs and five distinct units; do not count runs as units. No current-time refresh or KPI calculations occur.

Example: `/api/v1/demo/runs?purpose=production&limit=1`

```json
{
  "synthetic": true,
  "items": [{
    "run_id": "DEMO-RUN-0006",
    "unit_id": "DEMO-UNIT-0001",
    "switch_id": "DEMO-SWITCH-0001",
    "model": "DEMO-MODEL-A",
    "purpose": "production",
    "started_at": "2026-11-05T14:00:00Z"
  }],
  "pagination": {"limit": 1, "offset": 0, "total": 3, "has_more": true}
}
```

Run/unit/switch IDs are strings constrained to `DEMO-RUN-`, `DEMO-UNIT-`, `DEMO-SWITCH-` plus four digits. Model and purpose use the enums above. `started_at` is an aware timestamp normalized to UTC, serialized as ISO 8601 with `Z`. These fixture IDs are unrelated to real serial numbers or SQL primary keys.

Pagination values are integers except boolean `has_more`. `total` counts matching runs before slicing, not all records. `has_more` means `offset + limit < total`. No matches or an offset at/beyond the result count returns 200 with `items: []` and `has_more: false`; no invented row or 404. The bounded offset is illustrative and is not a production paging strategy.

`GET /api/v1/reporting/run-activity` is an aggregate-only secondary run diagnostic. Required `started_from` and `started_before` values are timezone-aware ISO 8601 timestamps, normalized to UTC, with `start < end` and a maximum span of 31 days. Optional exact filters are `purpose` (`production`, `engineering`, `training`, `calibration`), `wavelength_mode` (`SM`, `MM`) and `switch_model` (1–30 characters). Purpose defaults to all purposes. Filters intersect and the response echoes the normalized window and filters.

When reporting is disabled or its required configuration is incomplete, HTTP 200 is exactly:

```json
{"data_source":"not_connected"}
```

When connected, `data_source` is `test_database`; `tls` is `verified` or `encrypted_unverified`. `runs.count_basis` is `runs_started_in_window_not_units`: `total`, `by_run_purpose` and `by_completion_status` count runs whose start is in `[started_from, started_before)`. They are never unit counts or finished-unit T12 metrics. Runs are not filtered by analysis status: pending, included, excluded (voided) and superseded runs all count, so this is a raw activity view, not the production report population. Counts and the timing sample come from two separate reads, so a run that ends between them can make the endpoint return 503 `schema_incompatible` once; retrying fixes it.

`timing.open_runs` counts runs without `run_ended_at_utc`; open runs are excluded from every statistics sample. `by_quality` counts ended runs in each of `confirmed`, `checkpoint_estimate`, `partial`, `provisional` and `unavailable`. `active_seconds` and `stopped_seconds` include only `confirmed` timing histories; `elapsed_seconds` includes all ended runs. Active and elapsed blocks return `n`, `mean`, `median`, `p90` and `sample_state`; stopped returns `n`, `mean` and `sample_state`. Median is exact and P90 is the one-based nearest rank `ceil(0.90*n)`. `sample_state` is `no_data` with null numbers at n=0, `small_sample` at 1–9 and `ok` at 10 or more. `flagged_over_90_min` counts ended elapsed values strictly greater than 5400 seconds; flagged observations remain in the statistics. These are T09/T10-style run diagnostics, not per-unit cumulative T12 or production KPIs.

The numeric timing read is capped at 5000 ended runs by fetching at most 5001 numeric-only rows. If more than 5000 exist, `incomplete` is `true` and returned statistics cover only the bounded sample; clients must not present them as complete. No record identifiers are returned.

`GET /api/v1/reporting/test-time-by-configuration` is a secondary **run-level** duration diagnostic grouped by the run's historical `switch_model × wavelength_mode × front_panel_channel_count`. It uses the same required aware UTC window, 31-day maximum, optional `purpose` and optional `wavelength_mode` validation as run activity. It intentionally has no switch-model filter because model is a group key. A null run channel count is retained as its own `front_panel_channel_count: null` group.

Each configuration reports ended `runs`, excluded `open_runs`, elapsed and confirmed-only active duration statistics, confirmed/unavailable timing counts, median elapsed seconds per channel (null for null channel count or no elapsed data), and elapsed observations strictly over 90 minutes. Duration blocks use the same exact mean/median/nearest-rank P90 and sample-state rules as run activity. Groups sort by model, mode and descending channel count with null last. One parameterized read requests at most 5001 rows containing only group keys, numeric durations and timing quality; Python groups at most 5000 and sets `incomplete: true` on overflow. No run, unit, switch, serial, station or operator identifier is returned.

The connected envelope contains `data_source`, `tls`, `window`, `filters`, `incomplete` and `configurations`. Disabled/incomplete reporting returns exactly `{"data_source":"not_connected"}`; enabled reporting failures return the same sanitized 503 contract as run activity. These statistics are T09/T10-style run diagnostics, not T12 per-finished-unit cumulative testing duration or a production KPI.

`GET /api/v1/reporting/channel-activity` implements the approved V06 activity-coverage diagnostic with V07, distinct-unit/run, V11 and boundary-exclusion companions. Repeated `purpose` parameters select one or more unique purposes and default to `production`; optional exact `wavelength_mode` (`SM`/`MM`) and `switch_model` (1–30 characters) filters intersect. The response echoes these filters. Production mixed with technical purposes remains explicitly labeled with every included purpose in the Overview.

The server captures one `extracted_at_utc` instant T and derives all boundaries from Pacific local dates using `America/Los_Angeles`: today local midnight to T, yesterday's complete local date, Monday local midnight to T, and the 30 complete local dates before today. `daily` contains those 30 dates plus today, in order. Every item has local `date`, UTC `start_utc`/`end_utc`, and `partial`; only today is partial, including the zero-width case when T is exactly local midnight. These UTC instants account for 23- and 25-hour DST dates and are the only time boundaries sent to SQL.

Each period and day reports `channels_tested` (exact distinct `(unit_id, logical_channel)`), `attempts` (distinct accepted logical measurement IDs), `units`, `runs`, `extra_candidate_attempts`, and `excluded_unknown_boundary`. Period distinct totals are queried directly and are never sums of daily values. Population A includes logical-role writes in the bounded window whose current parent run is not excluded/superseded, has no superseding pointer, matches every requested filter, has known positive N, and has logical channel in `1..N`; lifecycle state is not a gate. Extra candidates require a known positive N and physical port above N and never enter V06. `excluded_unknown_boundary` counts distinct logical measurement IDs with null/nonpositive N or null/out-of-range logical channel. Accepted older attempts remain V07 activity.

The connected envelope contains `data_source`, `tls`, `extracted_at_utc`, fixed `timezone`, `filters`, the four-key `periods` object, 31-item `daily`, and `incomplete` (currently false because SQL returns exact aggregates). Disabled/incomplete configuration returns exactly `{"data_source":"not_connected"}`; enabled failures return the same sanitized 503 code contract. The result is labeled **channels with test activity** (activity coverage), not finished-unit capacity.

`GET /api/v1/reporting/failure-rate` implements Q02, the **first-observation run-channel failure fraction**. Its repeated `purpose`, optional `wavelength_mode` and optional `switch_model` parameters, defaults, validation, filter echo, extraction instant and four Pacific periods/31-day series are identical to channel activity. It is not Q01, first-pass unit yield, a unit failure rate, or final disposition. A retest run has its own first observation.

For each `(run_id, logical_channel)` in population A, SQL orders every accepted logical attempt in that run by `written_at_utc, measurement_id` and selects rank one before applying `[start_utc,end_utc)`. Each period/day returns `failed` N, `observed` D, nullable `rate` N/D, and `unknown_criteria`. D includes only first observations with a strictly valid saved run limit snapshot. N uses either wavelength strictly greater than that run's `fail_above_db`, without rounding; equality passes. Invalid/missing/inconsistent snapshots are excluded from N and D and add their first observations to `unknown_criteria`. Zero D produces `rate: null`. Warnings and too-good classifications do not enter this metric. `classification_rule` is the literal `strict >, run limit snapshot`.

The SQL aggregation returns per-window/per-run counts and a SQL-parsed `DECIMAL(9,4)` fail limit guarded by `ISJSON`. A separate bounded read returns the same deterministic run set's mode and raw snapshot. Python applies the canonical `parse_limit_snapshot`; a run contributes N and D only when its validated Python limit exactly equals SQL's parsed limit. Invalid snapshots and SQL/Python limit mismatches contribute to `unknown_criteria`, never passes. The deterministic candidate set is capped at 5000 runs; a TOP 5001 snapshot read detects overflow and sets `incomplete: true`. The connected envelope otherwise matches channel activity and disabled/failure behavior is the established exact `not_connected`/sanitized 503 contract.

### Unit lookup

All four operations below use one short-lived reporting connection per request. The same connection performs target, permission, migration and consumed-column preflight before fixed parameterized reads. When reporting is disabled or incomplete, each returns HTTP 200 exactly as `{"data_source":"not_connected"}`. Connected responses contain `data_source: "test_database"` and `tls: "verified" | "encrypted_unverified"`. Enabled reporting failures are the exact sanitized 503 `{"code":"<reporting_code>"}`. Unknown positive IDs return the standard sanitized 404 envelope; nonpositive/malformed path IDs return 422.

`GET /api/v1/units/search?q=<text>` trims `q` and requires 2–100 characters. It performs a case-insensitive contains match against the main-board serial and every historically assigned switch serial. SQL LIKE metacharacters `%`, `_`, `[` and the escape marker are escaped before the value is bound. The fixed TOP 21 read returns at most 20 units, newest run first (units without runs last), plus `has_more`. Each item contains `unit_id`, main-board serial, nullable part number/model, the active assignment's nullable switch serial/model, nullable latest run start and run count.

`GET /api/v1/units/{unit_id}` returns:

- `unit`: ID, serial, nullable part number/model/front-panel count, created and updated UTC timestamps;
- `assignments`: newest-first switch assignment history with serial/model/firmware, install/remove timestamps and operators, and removal reason. The list is capped at 500; `assignments_incomplete` reports overflow;
- `runs`: newest-first runs capped at 200 with `has_more`. Each includes IDs, start/end, tester/station, mode/band/saved front-panel count/part number/application version, lifecycle/purpose/analysis state, superseding run ID and parsed void details;
- `limits`: the strictly validated saved snapshot fields (`model`, mode, too-good, warning and fail criteria), or null for missing/malformed/internally inconsistent JSON;
- `timing`: timing quality, active/elapsed/stopped seconds and session count from `vw_RunTimingSummary`;
- `counts`: current logical channels and extra candidates measured, plus strict-source-rule failing/warning channel counts. Failure/warning counts are null when the saved limits cannot be validated.

`GET /api/v1/runs/{run_id}/channels` returns all accepted logical-channel and extra-candidate attempts in separate flat lists. The combined fixed TOP 5001 read returns at most 5000 rows and sets `incomplete` on overflow. Logical attempts order by logical channel, attempt and measurement ID; extras use physical port, attempt and measurement ID. Each row contains the measurement ID, nullable logical channel, physical port, attempt, both wavelength/loss pairs, written UTC/operator and `is_current`, determined by membership in `vw_CurrentILMeasurements`. Current rows receive one classification with precedence `fail` → `too_good` → `warning` → `pass`; invalid/missing limits produce `unknown`. Noncurrent rows have null classification/rule. For valid limits, `classification_rule` is `strict >, run limit snapshot`: fail and warning use source `>` comparisons and too-good uses source `<`. Unknown classifications identify an invalid or missing snapshot instead. Equality at the fail limit is warning when the run has an enabled, lower warning threshold; it is never fail under the source rule. This follows `LimitProfile.classify`, the analytics rule the owner chose on 2026-11-13 (D04).

`GET /api/v1/assignments/{assignment_id}/hardware` returns:

- current channel-map rows with logical, initial/effective ports, replacement flag and latest replacement time;
- oldest-first replacement events and their run/recommendation provenance and notes;
- confirmed extra-port measurements with wavelength/loss pairs, attempt, source run/write time and analysis state;
- only the latest designated/undesignated spare event per physical port;
- newest-first saved analyses for runs in the assignment, with ranked recommendations and `used`, derived from a matching replacement's `source_recommendation_id`.

Channel map, replacements, extra ports and spare lists are each capped at 500; analyses at 200; total recommendations at 2000. One top-level `incomplete` flag reports any overflow. Saved analysis `result_status` is historical evidence only: `fail_no_viable_recovery` is not a final manufacturing disposition, and `used` is recommendation linkage rather than proof of verified work.

All insertion-loss and analysis loss/improvement values serialize as JSON numbers rounded to four decimal places. SQL `DECIMAL(9,4)` values are retained as `Decimal` until response serialization. Every returned timestamp is UTC-aware and serializes with `Z`.

### Replacement activity

`GET /api/v1/reporting/replacement-activity?switch_model=<exact model>` returns recorded replacement activity for Pacific today, yesterday, this week, the last 30 complete Pacific dates, and a 31-date daily series ending with partial today. The optional model filter is exact and follows each event's historical assignment to its switch. There is no purpose filter.

Each period contains `start_utc`, exclusive `end_utc`, `partial`, and `by_attribution` with exact `all`, `production`, `engineering`, `training`, `calibration`, and `unattributed` buckets. Every bucket returns distinct replacement `events`, distinct `(assignment_id, logical_channel)` `channels_replaced`, distinct `units`, nullable `events_per_unit`, `from_recommendation`, and `related_run_not_current`. The ratio is null at zero units; its event numerator and unit denominator remain present. Daily entries carry the same shape so consumers can use exact all/production counts without adding buckets. `administrative_exclusions` is zero because the reviewed schema provides no authoritative classification; `incomplete` is currently false.

All replacement records in `[start_utc,end_utc)` count, including repeated replacements, returns to an initial port, null related runs, and related runs now voided, excluded or superseded. A null related run is `unattributed`; otherwise the related run purpose selects exactly one bucket. Recommendation linkage does not prove compliance or verified physical work. Disabled reporting returns exactly `{"data_source":"not_connected"}` and enabled failures use the established sanitized 503 envelope.

The Failures & replacements screen fetches this endpoint independently on mount and manual refresh, aborts superseded/unmounted requests, and selects among the four server period totals without refetching. Its live panel never replaces or mixes values into the existing synthetic failure/recovery content. The strict client validates all keys, six attribution buckets, nonnegative counts, 31 ordered dates, partial-today placement, zero administrative exclusions, filter echo and sanitized error codes.

### Overview frontend consumption

During Vite development, `/api` is proxied to loopback `http://127.0.0.1:8000`; production build output has no proxy configuration. The Overview card computes the last 30 complete UTC days and sends the exclusive current-UTC-midnight boundary, keeping the window at exactly 30 days. It refetches on mount, Run purpose changes and manual refresh only.

One selected purpose produces one filtered request. All four selected purposes produce one unfiltered request. Two or three selected purposes produce one request per purpose; the client sums only run counts, completion counts, timing-quality counts, open runs and the incomplete flag. It never combines means, medians or quantiles, and suppresses those statistics for partial multi-purpose selections.

The client validates the complete response shape and known enum keys before rendering. It renders only fixed labels, aggregate numbers, the bounded window, the known TLS state and a sanitized 503 code. `not_connected`, network/backend-down, invalid-response and incomplete-sample states remain inside the live card and do not affect synthetic Overview content.

Configuration timing is requested for one selected purpose or, when all four are selected, one unfiltered request. Two or three selected purposes show a selection prompt because means, medians and quantiles cannot be combined. A separate unfiltered run-activity result supplies live purpose-chip counts while connected; the chips fall back to their labeled synthetic counts otherwise.

Channel activity sends all selected purposes in one request, so SQL computes exact distinct totals across the selection rather than the browser adding purpose totals. It refetches on mount, range/purpose changes and its manual refresh. The selected range chooses one of the four server periods; the live sparkline and daily chart use all 31 days and visibly mark today partial. Connected values carry **Live · test database** plus every included purpose. Reporting-off, unreachable, 503 and invalid responses retain the established demo tile/chart without adding another banner. The disabled Model, Mode, Channels, Station and Operator previews are explicitly labeled as not applied; the strict client supports mode/model parameters when those controls become active.

Failure rate also sends all selected purposes in one request and aborts superseded or unmounted requests. The selected range chooses its direct server period; manual refresh refetches. When connected, the Channel failure rate tile shows one-decimal N/D, its N-of-D first-observation basis, the strict rule, included purposes, unknown-criteria note when nonzero, and a 31-day sparkline whose null-rate dates remain gaps. The daily chart uses the same 31 dates, marks today partial, names the strict saved-run-limit rule and Pacific date range accessibly, and keeps null dates as gaps. There is no comparison badge. Any unavailable/failed response leaves both views on their labeled synthetic demo values.

### Unit frontend consumption

The Unit screen probes `GET /api/v1/units/search` on mount. `not_connected`, an unreachable backend and a sanitized 503 retain the established synthetic unit screen and add an honest state note; a 503 exposes only its validated reporting code. A connected response switches the whole screen to live mode. Live and synthetic values are never combined within a panel, and every live evidence panel is labeled **Live · test database**.

Live search trims input, waits until at least two characters are present, debounces for approximately 250 ms and aborts every superseded request. Only the response for the current text is rendered. Exact case-insensitive main-board or switch-serial matches open directly; the result list otherwise shows the bounded search fields and `has_more` refinement state. Timestamps render in the browser's local time with the original UTC value retained in the `time` element and tooltip.

The hash route accepts `#/unit?unit=<positive_id>` and optional `&run=<positive_id>`. The existing `?serial=` route remains a search prefill and continues to drive the demo fixture when live reporting is unavailable. Unit/run choices update browser history; reload, back and forward navigation restore both IDs. Missing positive IDs use the API's not-found state, while malformed/nonpositive IDs are rejected locally without issuing a detail request.

After unit detail loads, the newest run is selected when the route has no run ID. The client then requests that run's channel attempts and its assignment's hardware independently. Completed hardware responses are cached by assignment for the lifetime of the open Unit screen. Channel and hardware failures stay local to their dependent sections. A stopped backend therefore leaves the unit frame visible with sanitized failure messages rather than substituting synthetic values or blanking the screen.

Transport DTO guards validate every documented key, nested object, enum, timestamp, identifier and numeric/null boundary for all four responses. Unknown enum values and malformed bodies become `invalid_response`; 404 becomes `not_found`; 503 accepts only a short lowercase reporting code. Pure rendering derivations select current attempts, construct chronological events, group attempt history and map API classifications without recomputing classification or limits. Saved `result_status` and recommendation `used` remain historical evidence labels, never final disposition or verified-repair claims.

While live mode is connected, the Unit sidebar reads and writes at most five recently opened units in `localStorage`. The stored records contain only positive unit IDs and serial strings; parsing and writes are guarded with `try/catch`. Demo mode retains the three synthetic example links.

## Errors

`ErrorResponse` wraps `{error: {code: string, message: string, details: ErrorDetail[]}}`; details contain only `{field: string, code: string}`. Example invalid `limit=0`:

```json
{"error":{"code":"validation_error","message":"Request parameters are invalid.","details":[{"field":"query.limit","code":"greater_than_equal"}]}}
```

| HTTP status | Code / message | Details |
| --- | --- | --- |
| 422 | `validation_error` / `Request parameters are invalid.` | Field locations and validator codes; no input values or validation context |
| 404 | `not_found` / `Resource not found.` | Empty; includes unknown routes and unimplemented detail URLs |
| 405 | `method_not_allowed` / `Method not allowed.` | Empty; retains the HTTP `Allow` header |
| 500 | `internal_error` / `An internal error occurred.` | Empty; includes response-schema failures |

The reporting endpoint also returns HTTP 503 as exactly `{"code":"<sanitized_reporting_code>"}` when enabled reporting fails. It never includes driver text, target details, query values or TLS/configuration details. Invalid reporting query parameters use the same sanitized 422 envelope above.

Other raised HTTP exceptions use their status with `http_error` / `Request could not be completed.`. Consumers should branch on status and top-level code, not validator wording/codes, which may evolve with dependencies. Errors never include consumer-visible tracebacks. Local internal-error logs retain exception type and stack file/function/line locations, omitting exception text, source lines, locals, request bodies and query values. The launcher disables Uvicorn access logging. There is no request-body logging or production logging integration. Invalid startup settings fail before binding, with sanitized messages.

CORS is disabled by default because the frontend remains independent. Optional explicit loopback CORS uses standard middleware preflight semantics (including its own plain-text 400 for rejected preflights), not application JSON errors. Trailing slash normalization may return the framework's standard 307 redirect.

## Future areas — proposed, not implemented

The separate Light Workbench [database architecture](https://github.com/austin-santec/Light-Workbench/blob/810ec42c46ed656eda90ddb5f14dec11fa77a2d8/docs/DATABASE_ARCHITECTURE.md) and [data architecture](https://github.com/austin-santec/Light-Workbench/blob/810ec42c46ed656eda90ddb5f14dec11fa77a2d8/docs/DATA_ARCHITECTURE.md) were consulted read-only. No production application was run or modified. These docs are context; no database connection was made.

| Proposed API area | Decisions required before schemas or endpoints |
| --- | --- |
| Production overview | Reviewed period/timezone, purpose/validity rules, unique units versus runs, accepted/current measurements, explicit elapsed versus active measurement time, aggregate/list reconciliation |
| Run and unit history | Stable identities, assignment/unit/switch provenance, separate run state and derived quality, bounded search/paging and safe disclosure |
| Channel measurements | Logical channel versus physical port, attempts versus current accepted values, wavelength/units/precision, criteria/reference snapshots, front-panel versus extra candidates |
| Quality and replacements | Reviewed criteria snapshots, events versus unique replaced channels, assignment scope, recommendation usage versus verified work, saved no-recovery analyses versus final manufacturing disposition, current versus stale historical analyses |
| Saved reports | Allowlisted report definitions, reviewed read models, bounded filters/results and disclosure/export rules; no arbitrary SQL execution implied by the sample Queries screen |

Architecture is **React → FastAPI → read-only SQL Server**; browser-to-database access remains forbidden. The Overview card consumes this endpoint through the Vite loopback proxy; other screens remain fixture-only. React's colors, SVG geometry, chart formatting and view state remain client concerns; its synthetic presentation contracts are not production DTOs. Final production metrics and record-level APIs remain deferred.
