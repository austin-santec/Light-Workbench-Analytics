# Live Q02 channel failure rate

Updated November 13, 2026. Implemented the approved Q02 slice without connecting to SQL Server. `GET /api/v1/reporting/failure-rate` returns first-observation run-channel N, D, nullable N/D and unknown criteria for the shared Pacific periods and 31-day series. It applies population A, ranks the first accepted attempt across each run-channel's full history before filtering its write time into P, treats a retest run as a new run-channel sequence, and uses the owner-approved strict `>` rule against each run's saved limit snapshot. This is not first-pass unit yield, unit failure or final disposition.

Two fixed per-window/per-run aggregate statements use deterministic bounded candidate runs and SQL's guarded decimal limit parse. A separate TOP 5001 criteria read detects the 5000-run cap. Python reuses `parse_limit_snapshot` and admits a run's SQL counts only when the strict validated Python fail limit equals SQL's parsed limit; invalid snapshots and SQL/Python mismatches are excluded from N/D and reported as unknown criteria. No new schema object, column gate, grant or write is introduced.

The Overview's existing Channel failure rate tile and daily chart now switch together to Q02 only when connected. They show the N/D basis, strict rule, included purposes, partial today and unknown criteria; null-rate days are SVG gaps. Manual refresh and filter changes abort superseded requests. Reporting-off, unreachable, invalid and sanitized-failure paths retain the complete labeled demo. Browser checks use synthetic DEMO responses only.

Offline verification passed all 256 backend tests, Ruff check/format, `pip check`, frontend typecheck/lint, and the runner-fallback Vite build (461 modules). The exact default build reached Vite but hit the documented managed-filesystem config-loader restriction; `npm.cmd run build -- --configLoader runner` passed. The 22-check real-browser suite passed against an owned loopback Vite server with no console/page/request errors. It covered exact not-connected demo behavior, backend-down fallback, synthetic connected Q02 values, null gaps, unknown criteria, strict labels, mixed purposes, refresh/abort behavior, keyboard interactions, both themes and 1440/768/390px layouts. Light 1440px and dark 390px connected Overview captures were visually inspected. `git diff --check` and the UTF-8 mojibake scan passed.

No database, real backend data, credential, target detail, commit or push was used. Live API values, Unit lookup reconciliation, and live query execution/plan/cost remain unverified.

Reviewer live check, November 13, 2026, against the authorized test database:

- **API:** the endpoint executed successfully, including the candidate-run grouping on the snapshot column, for production, engineering and both purposes. No unknown criteria or SQL/Python limit mismatches occurred.
- **Reconciliation with Unit lookup:** daily N/D matched the per-run current classifications for runs without retests: one production run gave 7 of 49, and one engineering run gave 1 of 4. A day combining a full run with a short same-day retest run counted each run's first observations separately (48 + 2 = 50 observed, 3 failed), as Q02 defines.
- **Browser:** the Overview tile matched the API for all four ranges, and the daily chart showed null days as gaps.

Not verified live: query plan/cost at production volume, and 503 rendering against the real backend (covered by synthetic browser checks).

# Live replacement activity

Updated November 13, 2026. Implemented the approved next Milestone 4B slice without connecting to SQL Server: `GET /api/v1/reporting/replacement-activity` returns R01 recorded events, R02 exact distinct assignment/channels, distinct units and R04 events/unit for all plus five attribution buckets over the shared Pacific periods and 31-day series. Null related runs remain unattributed; later voided, excluded or superseded related runs remain counted and are flagged. Administrative exclusions remain zero because none are authoritative. The optional exact model filter follows the event's historical assignment.

Two fixed parameterized aggregate statements use a bound 31-day superset, `LEFT JOIN` related runs, derived distinct tables and `COUNT_BIG`; there are no concatenated keys, writes, new objects or grants. The Failures & replacements screen now begins with a separately sourced live panel, its own range control, manual refresh/abort, exact all/production values, attribution row, linkage and not-current notes, and 31-day mini chart. Existing demo KPIs/charts remain unchanged and labeled. The optional Overview replacement subline was not added, avoiding an additional request on that tile.

Offline verification passed 247 backend tests, Ruff check/format, `pip check`, frontend typecheck/lint, the Vite runner-fallback build, and the 22-check real-browser suite. Browser interception covered not-connected, unreachable, sanitized 503 and synthetic connected paths, all four live ranges, attribution/notes, refresh, 31 daily bars, both themes and 1440/768/390px responsive layouts. Light 1440px and dark 390px Failures captures were visually inspected. No real backend/database, real record, target detail, credential, commit or push was used. Live API values, query execution/plan/cost and live-browser number matching remain unverified.

Reviewer live check, November 13, 2026, against the authorized test database:

- **API:** the endpoint returned `test_database` for every period, with and without the model filter.
- **Reconciliation:** the last-30-day results matched the per-assignment replacement records from the hardware endpoint exactly, including the attribution buckets, distinct channels and units, recommendation linkage, and the related-run-not-current count (records linked to a later voided/excluded run).
- **Browser:** the Failures panel matched the API for the ranges checked. The layout had no page overflow at 375px.

Not verified live: query plan/cost at production volume, and 503 rendering against the real backend (covered by synthetic browser interception).

# Live channel activity

Updated November 13, 2026. Implemented the approved first Milestone 4B volume metric slice without connecting to SQL Server. `GET /api/v1/reporting/channel-activity` computes Pacific today/yesterday/this-week/last-30-complete-date boundaries from one injectable extraction instant and returns direct exact period aggregates plus 30 complete local dates and partial today. The Overview's Channels tested tile and daily chart switch together to V06 activity coverage when connected, label every included purpose, retain the complete demo on any unavailable state, and never combine live and demo data within either view.

The two fixed parameterized SQL statements run after the existing preflight on one short-lived connection. Each joins measurement writes to the historical run assignment/unit and switch model, applies population A current-run predicates, and uses derived distinct tables before `COUNT_BIG`. Period totals are independent of daily totals. V07 accepted logical attempts, distinct units/runs, V11 extra candidates and unknown/out-of-range boundary exclusions are companions. No new object/grant or database write is introduced. Migration review confirmed no index led by `IL_MEASUREMENTS.written_at_utc`; live plan/cost validation therefore remains required.

The owner-approved `tzdata==2025.2` dependency is recorded in `pyproject.toml` and the tested constraints. The exact `.venv\Scripts\python.exe -m pip install tzdata==2025.2` command was attempted, but the managed sandbox blocked PyPI access and no cached wheel or package was present. Installation into `backend/.venv` therefore remains for a network-enabled owner environment. No substitute timezone data was vendored or taken from the source application's environment.

Verification in this environment:

- Backend `ruff check .` and `ruff format --check .` passed. `pytest -q` could not collect because the uninstalled package makes `ZoneInfo('America/Los_Angeles')` fail at import, so the new and regression Python tests are not claimed as passed. `pip check` reported no broken requirements against the pre-existing editable package metadata; an attempted no-dependency editable metadata refresh failed because the sandbox venv cannot import its build backend, so that result does not establish `tzdata` installation.
- Frontend `npm.cmd run typecheck` and `npm.cmd run lint` passed. Exact `npm.cmd run build` reached Vite after TypeScript and hit the documented managed-filesystem config-loader restriction; `npm.cmd run build -- --configLoader runner` passed with 458 modules transformed.
- `npm.cmd run test:browser` passed all 18 checks against a task-started/stopped loopback Vite server. Interception covered the exact not-connected demo path and a synthetic connected 31-day response, range/purpose changes, partial-today rendering, both themes and 1440/768/390px layouts. Light/dark Overview captures at 1440px and 390px were visually inspected. No real backend or database was used, so live rendering remains unverified.
- `git diff --check` passed. No AGENTS.md change, database connection, real record, credential, target detail, commit or push occurred.

Reviewer follow-up and live check, November 13, 2026:

- **Dependency and tests:** the reviewer installed `tzdata==2025.2` into `backend/.venv`. All 236 backend tests then passed, including the DST and week-edge boundary tests, along with `pip check`, ruff and the frontend checks.
- **Encoding fix:** a previously mis-encoded middle-dot sequence in the Overview live labels was fixed, along with the browser check that had asserted it. The live subline now uses singular "attempt"/"unit" for 1.
- **Live API check** against the authorized test database, with default production plus engineering, both purposes, and engineering with SM and model filters:
  - every period, daily length and filter returned `test_database`;
  - Pacific boundaries were correct on both sides of the November 1 DST change, and the week started Monday;
  - the optional NULL mode/model filters bound correctly;
  - distinct semantics held: the combined purposes kept the same channel count with more attempts where an engineering retest touched production channels;
  - yesterday's count matched the run shown by Unit lookup.
- **Browser:** the KPI tile changed with every range chip and purpose selection and matched the API exactly. The live per-day chart rendered 31 bars with today partial.

Not verified live: query plan/cost at production volume (no `written_at_utc` index), and 503 rendering on this tile.

# Unit lookup UI Part B

Updated November 12, 2026. Implemented the approved live Unit screen without changing the backend. The existing detailed synthetic unit remains the complete fallback when reporting is disabled, unreachable or returns a sanitized 503. Connected mode adds debounced/abortable serial search, URL-backed unit/run selection, strict clients for all four Unit lookup responses, live run selection, real-event timeline, API-classified insertion-loss chart, assignment channel map, extra-port evidence, replacements, attempts and saved analyses. Live panels are source-labeled and never borrow synthetic values. Saved no-recovery analyses are worded as historical evidence and explicitly not final manufacturing disposition.

The live screen loads unit detail before independent run-channel and assignment-hardware requests, keeps failures local to dependent sections and caches completed hardware responses by assignment while the unit remains open. Hash reload/back/forward restore positive unit and run IDs; malformed IDs fail locally. The sidebar shows up to five recently viewed live unit IDs/serials from guarded `localStorage` only in connected mode and otherwise keeps the demo example list. Browser-to-database access was not added.

Validation for this change:

- `npm.cmd run typecheck` and `npm.cmd run lint` passed. The exact `npm.cmd run build` reached Vite after TypeScript passed, then hit the documented managed-filesystem/esbuild config-loader restriction; `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 457 modules transformed.
- `npm.cmd run test:browser` passed all 18 reported checks against a loopback Vite server started with the approved runner fallback and stopped afterward. Unit search was intercepted with the exact `not_connected` envelope, so the run used only the established synthetic fixture. It covered the fallback note, wavelength control, lookup empty/recovery behavior, direct serial route, keyboard navigation, both themes, 1440/768/390px layouts, horizontal overflow and normal-flow browser errors. Light/dark Unit captures at 1440px and 390px were visually inspected.
- Plain `pytest -q` was unavailable on the PowerShell PATH. From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed all 218 offline tests. `git diff --check` passed, including separate whitespace checks for the two new untracked frontend files.

Live check, November 12, 2026 (reviewer, real browser against the owner-run loopback backend and the authorized test database):

- **Search and opening:** an exact serial search opened the unit directly. The URL updated to the unit and its newest run, and the sidebar listed recently viewed live units.
- **Unit content:** header, run list, timeline, chart, channel map, extra ports, replacement history, attempts and saved analyses all rendered real data. The failing-channel count matched the per-channel attempts, and used recommendations were labeled as linked to a recorded replacement.
- **Navigation:** clicking another run and browser back restored the selection. An unknown run, an unknown unit and a malformed ID each showed its own not-found state.
- **Layout:** desktop and a 375px phone width, light and dark, with no page-level horizontal overflow.
- **Fix:** the reviewer changed the live channel map from a fixed 12 columns to auto-fill, because desktop cells truncated values inside the half-width panel.
- **Overview card:** still loads live alongside the Unit screen.

Not verified live: stopped-backend behavior while the Unit screen is open, the 200-run, 5000-attempt and hardware caps, and a 503 rendering on this screen; the offline client guards cover these. Codex's original note: rendering, search, run switching, history navigation and stopped-backend behavior in live mode were not verified by its run. The final passing browser run intercepted every Unit search and did not use a reporting backend. In the first failed import-recovery run, the isolated page removed interception before one reload; no response or data was inspected, but whether an already-running loopback backend answered that probe is unknown. The test was corrected before the final run, and no loopback backend was listening when checked afterward. No real serial, operator, measurement, target or credential was added to code, tests, docs or screenshots. No backend file, dependency, AGENTS.md, source application, database, commit or remote was changed.

# Unit lookup API Part A

Updated November 11, 2026. Implemented the approved read-only backend for unit search, unit/run detail, run channel attempts and assignment hardware history. The four loopback endpoints are `GET /api/v1/units/search`, `/api/v1/units/{unit_id}`, `/api/v1/runs/{run_id}/channels` and `/api/v1/assignments/{assignment_id}/hardware`. Reporting-disabled behavior is the exact existing `not_connected` response; enabled failures remain sanitized 503 codes. Unknown IDs use the standard sanitized 404.

Every endpoint uses one short-lived connection and the existing same-connection target/permission/migration/column preflight. SQL is fixed, explicitly projected, parameterized and capped. Search escapes LIKE metacharacters and returns 20+1 rows; unit runs return 200+1; attempts return 5000+1; hardware lists return their documented 500/200/2000 caps with explicit overflow flags. Limits are strictly validated from each run snapshot; malformed JSON becomes null. Current-attempt classification follows source `LimitProfile.classify` strict comparisons, including equality at warning/fail boundaries, while the wider rounded COC `>=` decision remains unresolved. Saved no-recovery analyses remain historical evidence, not final disposition.

The schema gate now covers the eight newly consumed measurement/replacement/spare/analysis tables/views and dynamically sizes catalog/object placeholders. `IL_RUN_SESSIONS` remains unconsumed even though the administrator role-update script lists an object-level SELECT grant for it; timing is read only through `vw_RunTimingSummary`. Offline fake tests cover search escaping/caps, 404s, run cap, valid/missing/malformed limits, classification boundaries, attempt order/current selection, recommendation usage, latest spare projection, incomplete caps, disabled/503 behavior and each new object's missing column/wrong type/no SELECT/write permission failure.

Validation: inside `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed all 217 tests, `ruff check .`, `ruff format --check .` and `pip check` passed. At the repository root, `npm.cmd run typecheck`, `npm.cmd run lint` and `git diff --check` passed. No browser check was required because this brief has no frontend changes. No frontend file, dependency, AGENTS.md, source application, database, running backend, commit or remote was changed. No backend was started or stopped and no real record, target, identity or credential was written.

Live check, November 12, 2026, against the authorized non-production test database:

- **Grants and catalog:** the owner ran the role-update grants and confirmed SELECT=1 and INSERT/UPDATE/DELETE=0 on all eleven unit-lookup objects. Their catalog check confirmed every gated view column, including the inferred nullability. No schema change was needed.
- **Endpoints that worked:** search, run channels (runs 1–20; unknown run 404), hardware (assignments 1–10; unknown assignment 404) and the existing run-activity aggregate all returned `test_database` with `encrypted_unverified` TLS.
- **Unit detail bug and fix:** unit detail first returned `read_failed` for every unit. The runs-with-counts query aggregated expressions that mixed outer run columns with inner measurement columns, which SQL Server rejects (error 8124) and fakes cannot detect. The query now parses limits once per run in a `CROSS APPLY`, with an `ISJSON` guard so malformed snapshots give null limits instead of a SQL error. It classifies each current measurement in a derived table and aggregates only the resulting flags.
- **After the fix:** unit detail returned assignments, runs, timing, limits and counts for five units. SQL failing-channel counts matched the per-channel Python classification on five runs.
- **Failure logging:** adapter failure logs now add the exception type, SQLSTATE, SQL Server error number (digits only) and innermost application file:line. The message text and values are still never logged, and a test proves message text stays out (218 tests).

Not verified: query plans/cost at production volume, the result-cap paths against real data, timeout behavior and UI consumption (Part B).

# Live test time by configuration and cleanup

Updated November 11, 2026. Implemented the approved `GET /api/v1/reporting/test-time-by-configuration` aggregate and added its compact table below run activity in the existing **Live · test database** card. The endpoint groups ended-run elapsed and confirmed-only active duration diagnostics by each run's historical switch model, wavelength mode and saved front-panel channel count; null channel count remains its own group. It reports exact mean/median/nearest-rank P90, sample state, open runs, timing coverage, strict over-90-minute flags and median seconds per channel. One parameterized TOP 5001 read returns no record identifiers, and Python groups at most 5000 rows with an explicit incomplete state. This is labeled T09/T10-style run-level evidence, not the T12 per-finished-unit primary.

The dependency-free frontend client strictly validates the complete response shape. Configuration timing fetches alongside run activity on mount, purpose changes and manual refresh. One selected purpose and all four purposes show statistics; mixed selections show the required non-combination prompt. An unfiltered run-activity request supplies live purpose-chip counts while connected, with accessible source labels and deterministic demo-count fallback. The synthetic configuration table, histogram and KPIs are unchanged. The top banner and sidebar now accurately describe demo fixtures plus optional live test-database panels in every connection state.

The migration preflight now fetches `len(MIGRATIONS) + 1` rows and uses plain migration-ID ordering. Offline tests still prove exact migrations 1–7 pass and missing 7, extra 8, a gap, and changed name/checksum fail closed.

Validation for this change:

- Backend `.venv\Scripts\python.exe -m pytest` passed all 155 tests; `.venv\Scripts\python.exe -m ruff check .`, `.venv\Scripts\python.exe -m ruff format --check .` and `.venv\Scripts\python.exe -m pip check` passed.
- `npm.cmd run typecheck` and `npm.cmd run lint` passed.
- The exact `npm.cmd run build` command reached Vite after TypeScript passed, then hit the known managed-filesystem/esbuild config-loader restriction. `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 455 modules transformed.
- `npm.cmd run test:browser` passed all 18 checks against the already-running owner preview on port 5173. It covered reporting-off and backend-down states for both live sections, connected configuration timing, live purpose-chip counts, one/mixed/all-purpose behavior, the 24-screenshot light/dark responsive matrix and normal-flow error diagnostics. Light/dark Overview screenshots were visually inspected at 1440px and 390px.
- `git diff --check` passed.
- No database connection, backend start, reporting-enabled process, real record, credential, target detail, dependency change, AGENTS.md change, commit or push occurred.

Not verified here: rendering against the real test database, live query plan/cost, live incomplete/503 behavior and the owner-specific reporting configuration. Those remain owner-run acceptance work.

# First live metric Part B — Overview run activity card

Updated November 11, 2026. The Overview now has a separate **Live · test database** card below its existing filters. It consumes `GET /api/v1/reporting/run-activity` through Vite's loopback-only `/api` proxy while every established KPI, chart, table and fixture remains synthetic. The card uses the last 30 complete UTC days, follows the existing Run purpose selection, fetches on mount/purpose change or manual refresh, and has no automatic refresh loop.

The dependency-free client strictly validates the response contract and fixed enum keys. One selected purpose uses one filtered request; all four use one unfiltered request; two or three use separate filtered requests and sum counts/quality coverage only. Means, medians and P90 are never combined. The card covers loading, reporting-off, backend-down, sanitized 503, invalid-response, incomplete-sample, TLS and sample-size states, and never renders identifiers or arbitrary database strings.

Validation for this change:

- `npm.cmd run typecheck` and `npm.cmd run lint` passed.
- The exact `npm.cmd run build` command reached Vite after TypeScript passed, then hit the known managed-filesystem/esbuild config-loader restriction. `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 454 modules transformed.
- `npm.cmd run test:browser` passed all 18 reported checks against a loopback Vite dev server. Synthetic route interception covered reporting-off, simulated connection refusal, the exact 30-day window, connected single-purpose timing, TLS, summed multi-purpose counts, refusal to combine timing and the all-purpose unfiltered request. The suite also passed its 24-screenshot light/dark desktop/tablet/narrow matrix and normal-flow error diagnostics. Light/dark desktop and 390px Overview captures were visually inspected. A separate headless Edge smoke check, with no backend listening and no API interception, confirmed the real Vite proxy path renders `Backend not reachable on 127.0.0.1:8000`.
- Backend `.venv\Scripts\python.exe -m pytest` passed 143 tests and `.venv\Scripts\python.exe -m ruff check .` passed.
- `git diff --check` passed. No backend code, dependency, AGENTS.md, database, reporting-enabled process, real record, credential, target detail, commit or push was involved.

Real connected-card rendering, real 503/incomplete responses and live target behavior were not exercised in this implementation session. Austin must start the backend in his settings terminal for live visual acceptance.

# First live metric Part A — aggregate run activity API

Updated November 11, 2026. Implemented the approved aggregate-only `GET /api/v1/reporting/run-activity` backend slice. It counts runs started in a bounded UTC window by purpose and completion status, reports ended-run timing quality and T09/T10-style active/elapsed/stopped statistics, separates open runs, flags elapsed values strictly over 90 minutes, and marks the 5000-row numeric sample cap as incomplete. It returns no run IDs, serials, operators, stations or other record-level rows and is explicitly not a unit count, per-unit T12 metric or production KPI. React remains unchanged and synthetic.

The request-scoped dependency returns `not_connected` when reporting is disabled or incomplete. When enabled, one short-lived connection performs the existing permission/schema preflight and two fixed parameterized reads; startup does not load pyodbc or connect. The schema gate now requires `vw_RunTimingSummary` as a type `V` object with its consumed columns and object-level SELECT, and fails closed for a missing/wrong-type view, missing column or denied SELECT. Tests use fakes only and clear all reporting environment variables.

Offline validation for this change: backend `pytest` passed 143 tests; `ruff check .`, `ruff format --check .` and `pip check` passed. Frontend typecheck and lint passed. The exact `npm.cmd run build` command was blocked by the managed filesystem while esbuild tried to read a parent directory and resolve `vite.config.ts`; the documented `npm.cmd run build -- --configLoader runner` fallback passed with Vite 7.3.7 and 452 modules transformed. No browser test was required because there was no UI change. No live database connection, server start with reporting enabled, `--verify`, frontend change, commit or push was performed. Austin must run any live endpoint acceptance afterward from his terminal.

# First live aggregate endpoint

Updated November 11, 2026. `GET /api/v1/reporting/run-activity` returned HTTP 200 against the Stage B test database. The backend ran on loopback, the owner supplied credentials in his own terminal session, and the connection used `tls: encrypted_unverified`.

The first live call failed closed with 503 `schema_incompatible`. The owner's catalog query showed `vw_RunTimingSummary.timing_quality` is `varchar(19) NOT NULL`, while the gate expected it nullable. The gate was corrected; all other view columns matched.

Live checks over a 31-day window:
- **No filter:** 200.
- **`purpose=engineering`:** 200.
- **`purpose=production`:** 200.
- **Response shape:** only aggregates and enum keys. Most runs predate 0007 timing (`unavailable`), so active-time samples are `small_sample`, as expected.
- **Run counts:** these differ from `--verify --runs`, which uses the narrower production/included report selection. The endpoint counts every run started in the window.

React is not wired yet; that is Part B.

# Stage B authorization and read-only identity provisioning

Updated November 11, 2026. The owner authorized Stage B for one named local non-production test database and a dedicated read-only SQL login. Exact target and identity details stay in local, untracked configuration. The owner provisioned the login through an administrator connection: one database role with object-level SELECT on `SCHEMA_MIGRATIONS`, `IL_RUNS`, `UNIT_SWITCH_ASSIGNMENTS`, `UNITS`, `SWITCHES` and `vw_RunTimingSummary`.

Owner-run checks (screenshots reviewed):
- The login belongs to no other database role, and `public` has no grants on `dbo` objects.
- Impersonated as the login, the permission checks returned SELECT on `IL_RUNS` and `vw_RunTimingSummary` = 1, and INSERT/UPDATE on `IL_RUNS`, SELECT on `IL_MEASUREMENTS`, `dbo` schema SELECT and database CREATE TABLE = 0.
- The migration ledger check ran successfully; its output was not reviewed here.

**First real connection (owner-run, November 11, 2026):**
- `python -m app.reporting` returned `configured_not_verified` with `tls: encrypted_unverified`, so the settings were valid with no connection made.
- `python -m app.reporting --verify` returned **`compatible`** with `tls: encrypted_unverified`.

So against the real test database, over an encrypted connection using the non-production certificate-trust opt-in:
- the migration ledger matches exactly 1–7 with the reviewed names and checksums;
- the consumed column types match;
- the login passed the role and permission preflight;
- connection cleanup completed.

The server's TCP port is configured static.

A bounded run read (`--verify --runs`, window 2026-10-12 to 2026-11-12 UTC, 31 days) returned `compatible` with `returned_count: 4` and `has_more: false`. The parameterized, historical-assignment run query works against the real schema. Only sanitized counts were printed.

Still pending for full Stage B acceptance: query plan/cost review on realistic volume and sanitized failure behavior against the real server (e.g. a wrong password or a stopped service). Neither blocks local development against the test database.

# Non-production certificate-trust opt-in

Updated November 11, 2026. At the owner's decision, reporting now has a default-off `LWA_REPORTING_TRUST_SERVER_CERTIFICATE` setting for the approved local test server's self-signed certificate. Encryption remains mandatory, certificate validation remains the default, and the opt-in is rejected unless the target is declared non-production. The local diagnostic reports the sanitized TLS mode without exposing target or credential values.

Offline validation: backend `pytest` passed 125 tests; `ruff check .`, `ruff format --check .` and `pip check` passed. Frontend typecheck and lint passed. The exact `npm.cmd run build` command was blocked by the managed filesystem while esbuild tried to read a parent directory and resolve `vite.config.ts`; the approved fallback `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 452 modules transformed. `git diff --check` passed. Milestone 3 Stage B remains **unaccepted**. No database connection, reporting verification, commit or push occurred.

# Migration 7 source baseline refresh

Updated November 11, 2026. The offline reporting schema baseline now recognizes exactly source migrations 1–7 at read-only evidence commit `5d4972830e74cc1b1e718fb577916d132e58faf7`. Migration 7 is `run_test_sessions` with normalized SHA-256 `43f6ec51f25bfd1bfae3da6255d896708add338cb021d96a8dab653f01f14125`; migrations 1–6 were re-derived at the same commit and remain unchanged. Evidence was read only with `git show`; no source code was imported or executed.

The compatibility gate accepts the seven reviewed ledger rows and fails closed for a missing migration 7, an extra migration 8, a gap, and a changed migration 7 name or checksum. The new `IL_RUN_SESSIONS` table and `vw_RunTimingSummary` are documented as source facts only. They were not added to analytics consumed columns, permissions or queries. Duration feasibility now recognizes prospective active time for `confirmed` sessions while retaining labeled elapsed fallback or incompleteness for pre-0007, missing, partial, checkpoint-estimated and provisional timing.

Offline validation: backend `pytest` passed 123 tests; `ruff check .`, `ruff format --check .` and `pip check` passed; frontend typecheck and lint passed; `git diff --check` passed. The exact `npm.cmd run build` command was blocked by the managed filesystem while esbuild tried to read a parent directory and resolve `vite.config.ts`. The non-mutating workaround `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 452 modules transformed. No browser test was required because there was no UI change.

Milestone 3 Stage B remains **unapproved**. No database connection, reporting enablement, driver operation, HTTP route, React wiring, source-repository change, dependency change, commit or push occurred.

# Milestone 4A status

Updated November 6, 2026. **Final owner decision update prepared for review, documentation only.** The previous reconciliation is committed at `7801ae409c0d2110834cf6b6aa4c53334c3437ba`; it is no longer pending as unstaged work. Final D05/D06/D07/D08/D14 decisions are incorporated in [METRICS.md](METRICS.md), preserving other approvals. Technical verification and production readiness are not implied. Milestone 3 Stage B remains **unapproved**; Milestone 4B is **not started**.

## Delivered for review

- Started from clean `main` at reference commit `7801ae409c0d2110834cf6b6aa4c53334c3437ba`, matching locally recorded `origin/main`; no fetch/remote verification is claimed. Origin remains `https://github.com/austin-santec/Light-Workbench-Analytics.git`. Preserved the intentional **Analightics** directory.
- Preserved all **42 existing metric IDs** (including the original 35), S01–S12 evidence and E01–E22 case identities. Added only **Q11 `quality.corrective_recovery_fraction`**, because Q05 must remain a count while the percentage needs an explicit resolved-configuration denominator. Catalog: **43 contracts**, **27 fictional cases**, and D01–D15 each once in the dated register. No stable IDs renamed.
- D05 now specifies **last 30 complete Pacific Time dates**, context-aware rolling/calendar/matched-partial comparisons and remembered model/mode filters, while each visit's date range defaults anew. A new-user all-models/all-modes fallback remains proposed, not separately approved.
- D07 now includes valid >90-minute observations by default, flags strictly >90 minutes and retains controls/configurable threshold. Nearest-rank P90 is `ceil(0.90*n)`; show mean/median/P90 at n>=1, Small Sample at n<10, No Data at n=0, always n/exclusions.
- D06/D14 make **T12 the primary per-finished-unit cumulative duration**: all qualifying runs/retests across days or weeks, no inter-run gaps or episodes. Prefer run-active, label elapsed fallback; retain active-only/elapsed-only/combined sources and secondary run diagnostics. One unit contributes once; separate passed/conclusively-unrecoverable means, default overall both. Unfinished/pending/uncertain or incomplete units are excluded with reasons. No run-completion or insufficient-candidate shortcut to unit completion.
- Full cumulative duration is attributed to the latest **verified current finished-outcome date**. Later changed testing recalculates totals/eligibility/date, making finished summaries restated current-state reports. Actual activity stays on its occurrence dates. No immutable snapshots, new completion actions or mandatory SM-and-MM testing are invented; historical physical-switch model/mode/assignment evidence remains authoritative.
- D08 quality defaults to K with qualifying accepted production testing in P, plus a separate All Current Configurations view. Latest valid effective evidence/current map at extraction still determines quality. Q11 uses verified corrective recoveries / definitively resolved corrective-replacement configurations; pending/uncertain separate. Incomplete candidates do not prove unrecoverability.
- Previous approvals remain: W/A/C separation, unit/channel distinctness, production workload versus compatible technical evidence, valid replacement events/reversals/matched ratios, confirmed suitable candidates including deployed, current/stale recommendation separation, identity/privacy, bounded reporting and source effective behavior. The source threshold discrepancy remains open. First-pass manufacturing yield and true historical as-of quality remain Deferred.

## Remaining decisions and verification

The only separately unapproved default identified in the final decisions is the proposed all-models/all-modes fallback for new users. Comparison edge cases, persistence mechanism and secondary ongoing-run presentation need technical design; the core defaults, statistics, primary unit population/date and quality/recovery denominator are now approved in intent.

**T12 and Q11 may be unsupported in full:** authoritative unit-level conclusive terminal failure/latest finish timestamps and definitive corrective resolution may not be reconstructable. Complete unit-run history (including supplemental work and old retests) and duration coverage must be verified under bounded queries. Do not truncate history to the selected period, infer a date from a run end/write, omit an unknown terminal group or fabricate a complete overall average/denominator. SQL still lacks reliable run-active intervals; elapsed fallback does not cure missing outcome/history evidence. T08's old workflow-span proposal is superseded, not a request for episodes.

Other technical gates persist: rounded COC >= versus strict classifier; valid-workflow SQL/Python consistency; historical configuration integrity; corrective sequence/current map; candidate allocation; recommendation applicability/freshness; administrative-error authority; exact aggregates/resource budgets/incomplete reporting. Acquisition-only T05, interruption T06, uninterrupted T07, strict first-pass Q03, final disposition Q10 and historical as-of remain unsupported/deferred as specified. No manufacturing outcome is inferred from a saved no-recovery analysis or incomplete candidates.

Stage B still requires explicit exact non-production target and dedicated read-only identity authorization plus administrator provisioning, schema/TLS/effective-privilege and bounded query-plan acceptance. See [REPORTING_DATABASE.md](REPORTING_DATABASE.md) for the unchanged Stage A foundation; [METRICS.md](METRICS.md) now records owner policy where the earlier foundation lists open M4 questions. No SQL connection is authorized.

## Validation and preservation

- Checked baseline ID preservation, 43 unique contracts/fields, 15 dated decision rows, 27 fictional cases, unchanged source evidence, local Markdown links/anchors and metric cross-references. Reviewed unit-versus-run and K denominator grains, whole-history versus period clocks, restatement, fallback/completeness, final approvals and remaining gaps. Checked example arithmetic/P90/default-window DST boundaries, UTF-8/LF and sensitive-content patterns. `git diff --check` passes.
- Only `docs/METRICS.md`, `docs/PLAN.md` and this file are changed. Source/application code, tests, SQL, migrations, dependencies/configuration and original Claude files remain untouched. SHA-256 comparisons confirm all seven original Claude files and 30 source evidence files match retained preservation records. No real data, credentials or new infrastructure identifiers were introduced.
- No application tests, lint/build or browser tests were run: this is documentation-only validation. No application/source import or execution, driver operation, SQL connection/query, hardware operation or real-record HTTP exposure occurred.
- **This final update** remains unstaged/uncommitted for review. No commit or push was performed for it; HEAD remains `7801ae409c0d2110834cf6b6aa4c53334c3437ba`, which already contains the previous reconciliation.

Final owner intent is documented; these changes await review. Implementation and integration still require separate authorization. See [PLAN.md](PLAN.md).
