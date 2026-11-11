# API contracts — Milestones 2–3 and first Stage B aggregate

Local base: `http://127.0.0.1:8000`. API version: `v1`; service version: `0.1.0`. All four implemented operations are GET and use Pydantic response models in `backend/app/schemas.py`. `/docs` and `/openapi.json` expose the generated specification. No authentication, arbitrary HTTP SQL execution, resource-detail lookup, production metrics or frontend API integration exists.

The first Stage B HTTP slice adds one aggregate-only run diagnostic. It may consume reporting data only after explicit request-time opt-in; FastAPI startup still does not load pyodbc or connect. No serial, operator, run ID, station row or other record-level field is served. The frontend remains on synthetic fixtures. Local diagnostic and database boundaries are documented in [REPORTING_DATABASE.md](REPORTING_DATABASE.md).

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

Architecture is **React → FastAPI → read-only SQL Server**; browser-to-database access remains forbidden. The React application is not wired to this endpoint in Part A. React's colors, SVG geometry, chart formatting and view state remain client concerns; its synthetic presentation contracts are not production DTOs. Final production metrics and record-level APIs remain deferred.
