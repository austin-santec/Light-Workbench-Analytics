# Live Overview range and filters

Updated November 24, 2026. The Overview **Model**, **Mode**, **Channels** and **Station** controls are live, and the range now drives every live panel. Backend (Codex, reviewed by Claude): nine reporting endpoints accept optional `switch_model`, `wavelength_mode`, `channel_count` and `station` (exact match, ANDed, null never matches) and echo all four in `filters`. Run-grain endpoints filter each run in one shared, parameter-bound predicate; unit-grain endpoints filter the D16 context configuration after their existing bounded reads, using the context run's station (unit-status) or the latest qualifying run's station (D17). `station-summary` gained `period`. New `GET /api/v1/reporting/filter-options` returns sorted distinct models, modes, channel counts and stations for the last 30 days. Frontend (Claude): real selects fed by filter-options (Operator stays a disabled preview); every live panel sends the filters and ignores responses whose echo does not match. **Time to test one unit** and **Stations, <range>** follow the range; the 31-day throughput and failure-rate charts dim or shade days outside the selected range; the run activity card keeps its own window, and the scope note says so.

Offline verification: 479 backend tests, Ruff check/format, `pip check`, typecheck, lint, build (`--configLoader runner`) and `npm.cmd run test:browser` (**41 checks**, including filter-options, filters sent to all nine endpoints, reset, and range highlighting) passed; `git diff --check` passed.

Live acceptance (test database, Production, Last 30 days): with no filters, numbers were unchanged (37 of 560 failed first observations, retest 39 of 560, 6 finished units, first-pass proxy 4 of 6). filter-options equaled a Query console distinct query (2 models, SM only, 3 channel counts, 3 stations). Mode SM equaled the unfiltered failure rate and MM returned 0 of 0, because only SM runs exist. The two model filters summed to the unfiltered KPI totals, and the model filter returned exactly the recent-finished rows with that model. A station filter equaled that station's unfiltered station-summary row; its This week run count equaled a Query console count. In the browser, choosing a station sent it to all nine endpoints, and the failure-rate tile and Stations table showed that station's values. Not verified: query plans with filters, and the dark theme in the pane.

# Live First-pass yield proxy

Updated November 24, 2026. Owner decision: show a labelled first-pass **proxy**; strict Q03 first-pass unit yield remains Deferred (D08). Backend (Codex, reviewed by Claude): `failure-kpis` `units` gained `first_pass` (D17-finished units with no replaced channel and no failed first observation) and `first_pass_unknown` (no replacement, unknown first-observation criteria), reusing the recent-finished-units first-observation failure follow-up for all eligible units with no SQL text change. Frontend (Claude): the Overview **First-pass yield (proxy)** tile follows the summary range and purposes, shows first_pass / (finished - unknown) with "—" for an empty denominator, explains the proxy in its tooltip, hides the demo delta/sparkline, and keeps the demo tile when unavailable. All six Overview KPI tiles are now live when connected.

Offline verification: 456 backend tests, Ruff check/format, `pip check`, typecheck, lint, build (`--configLoader runner`) and `npm.cmd run test:browser` (**40 checks**) passed; `git diff --check` passed.

Live acceptance (test database, Production): `first_pass`/`first_pass_unknown` equaled the tally of recent-finished-units rows (no replacement and zero failed channels / failed unknown) for Last 30 days (4 of 6, 0 unknown), This week (0 of 1) and Yesterday (0 of 0). The tile showed 66.7% · "4 of 6 finished units, no failed first reading or replacement". Query-plan/cost review remains open.

# Live Failures KPI tiles

Updated November 24, 2026. The five **Failures & replacements** KPI tiles are live. Backend (Codex, reviewed by Claude): `GET /api/v1/reporting/failure-kpis` returns integer counts only: the D17 finished-unit outcome tally for the period (all eligible units, not the 100-row display cap), units with replacements and their distinct replaced channels, and V08/V10 within-run retest counts for the period. Shared cohort/replacement helpers were factored out of recent-finished-units without SQL changes; the station-summary statement is unchanged. No object, column or grant was added. Frontend (Claude): strict client; tiles follow the page's shared range with Production; ratios are computed client-side with "—" for empty denominators; the demo "vs prior 30 days" delta is dropped; the page header shows the selected range and its Pacific dates whenever KPI or concentration data is live. Unavailable states keep the demo tiles and fixed header.

Offline verification: 448 backend tests, Ruff check/format, `pip check`, typecheck, lint, build (`--configLoader runner`) and `npm.cmd run test:browser` (**40 checks**) passed; `git diff --check` passed.

Live acceptance (test database, Production): for Last 30 days and This week, `units` equaled the tally of recent-finished-units rows (6 finished: 5 passed with no replacement, 1 after replacement with 3 replaced channels; this week 1 finished, no replacements) and unit-test-time `finished`. Last 30 days retest equaled station-summary totals (39 of 560); This week retest (19 of 116) matched an independent Query console count. Header showed "Last 30 days · Oct 25 to Nov 23, 2026". Tiles were inspected at desktop width and 390px with no horizontal scroll. Query-plan/cost review remains open.

# Live Overview failure wavelengths

Updated November 24, 2026. The **Which wavelength fails** strip in Overview **Unit outcomes** is live. Backend (implemented by Codex under the new backend/frontend split, reviewed by Claude): `GET /api/v1/reporting/failure-wavelengths` reuses the failure-concentration first-observation population and saved-limit agreement, adds each first observation's recorded wavelength pair and losses, and splits failed observations into first-only, second-only and both per `(mode, nm, nm)` pair. Shared failure SQL is hash-checked unchanged; no object, column or grant was added. Frontend (Claude): strict client, one stacked bar per real pair with the longer wavelength first, empty/unknown-criteria/incomplete notes, following the Overview range and purposes; every unavailable state keeps the original demo strip.

Offline verification: 441 backend tests, Ruff check/format, `pip check`, typecheck, lint, build (`--configLoader runner`) and `npm.cmd run test:browser` (**39 checks**) passed; `git diff --check` passed.

Live acceptance (test database, Last 30 days, Production): totals equaled failure concentration (37 failed of 560 observed, 21 runs, 0 unknown, complete). Only the SM 1310/1550 nm pair had failures; its split (1310 only 15, 1550 only 7, both 15) matched an independent Query console count over the same first observations and saved limits. The strip was inspected at desktop width and at 390px with no horizontal scroll. Query-plan/cost review remains open.

# Live Overview recently finished units

Updated November 23, 2026. Implemented the approved connected **Recently finished units** slice without connecting to SQL Server. The new bounded endpoint reuses the unchanged, hash-tested D17 cohort/timing SQL and D16 status projection, including missing-duration finished units and excluding open qualifying runs. Three parameterized follow-ups for the newest 100 eligible unit IDs supply latest qualifying-run station, strict saved-limit first-observation failures, and distinct replacement channels across historical assignments. D16 now retains internal effective readings/context limits for Worst IL without changing its HTTP contract or classification behavior.

Overview makes an independently aborted request that follows summary range and Run purposes. A strictly validated connected response preserves the existing table hierarchy while showing live serial links, Pacific relative finish times, current configuration, station, nullable duration/failure/Worst IL values, D17 result labels, dynamic local filters, sorting, truncation, incomplete and empty states. Loading, reporting-off, unreachable, invalid and sanitized 503 responses preserve the original synthetic table exactly.

Offline verification: from `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **419 tests**, Ruff check/format and `pip check` passed. Root typecheck and lint passed; the exact Vite build hit the documented managed-filesystem config-loader restriction, then `npm.cmd run build -- --configLoader runner` passed with **473 modules transformed**. `node --check scripts/browser-check.mjs`, `git diff --check`, strict changed-file UTF-8/mojibake scans passed. The implementer's run could not reach the dev server; the reviewer then ran `npm.cmd run test:browser`, which passed **38 checks** after browser-check fixes (demo table assertions, complete-date Last 30 days bounds, station options, Unit lookup handoff, a weekly-chart wait).

Frontend review (November 24, 2026): the live table uses the shared Live badge and the reference result-chip colors (blue for passed after replacement). **Time to test one unit** was redesigned from a full-width oversized chart to a stats column beside a histogram drawn at its measured pixel width (11-12px text at every card width, no zero-count labels, bin-edge minute ticks, mean/count labels kept clear of the edges and the mean line); the card is about 410px tall at 1024px and has no horizontal scroll at 390px dark. Overview KPI Live badges wrap below their labels instead of squeezing them, and the five synthetic Failures KPI tiles now carry Demo badges.

Live acceptance (test database, Last 30 days, Production): the table listed the same 6 units as **Units completed**; every duration and finish time equaled the unit-test-time response; Replaced matched an independent Query console distinct `(assignment_id, logical_channel)` count (one unit, 3 channels); a spot-checked unit's 3 Failed channels matched three failed first attempts later retested to pass in Unit lookup, and its Worst IL matched the channel map maximum. Today showed the one unit finished today, consistent with Last 30 days covering complete Pacific dates only. Query-plan/cost review remains open.

# Live Overview header and finished-unit KPIs

Updated November 23, 2026. Implemented the approved connected Overview header, **Units completed**, and **Avg test time per unit** slice without connecting to SQL Server. The unchanged unit-test-time SQL now also returns `finished` passed/unrecoverable counts derived from the existing D17 cohort before missing-duration exclusion. Counts require an in-period finish date and exclude open qualifying runs; the timed `units[]` subset remains unchanged. Backend and strict frontend validation require exact nonnegative outcome keys and counts that include every matching timed unit.

Overview makes a second independently aborted unit-test-time request that follows the selected summary range and Run purposes. Only a matching connected response changes the Pacific header read date/time, the two live KPI tiles and the connected scope note; loading and every unavailable result retain the exact demo header/tiles. Units completed includes finished units without a known duration and states that it is not final manufacturing disposition. Average test time uses the T12 combined mean over duration-complete units, with Small Sample/No Data and missing-duration disclosure. First-pass yield remains synthetic and always has a **Demo** badge; every other KPI now also identifies its own demo fallback. The fixed last-30-days production unit-time panel remains independent, and when connected it takes the row while the redundant demo configuration table is hidden.

Offline verification:

- From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **412 tests**; `.venv\Scripts\ruff.exe check .`, `.venv\Scripts\ruff.exe format --check .` and `.venv\Scripts\python.exe -m pip check` passed. Synthetic coverage includes an in-period missing-duration finished unit, out-of-period finished unit, run-in-progress unit, unfinished unit, empty cohort and response consistency. Existing SQL hash/read-only checks remained unchanged and passed.
- `npm.cmd run typecheck` and `npm.cmd run lint` passed. The exact `npm.cmd run build` reached Vite and hit the documented managed-filesystem/esbuild config-loader restriction; `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and **472 modules transformed**. `node --check scripts/browser-check.mjs` passed.
- `npm.cmd run test:browser` passed **38 checks** against the running dev server after the reviewer fixed two page-level text assertions in the new harness code (they passed the Playwright page instead of a locator).
- `git diff --check`, strict UTF-8 decoding and the mojibake-marker scan passed.

No credential, target detail, real record, dependency or `AGENTS.md` change was committed.

Live acceptance (November 23, 2026, test database): with Last 30 days + Production, Units completed showed 6 (6 passed, 0 unrecoverable) and Avg test time per unit 32m 23s · Small Sample, matching the Time to test one unit panel and the unit-test-time response; Today showed 0 and "—" · No Data, matching its response (2 tested units, neither finished). The header showed the Pacific date of an extraction at 00:30 UTC the next day (Monday, November 23, read 4:30 PM Pacific). The demo configuration table was hidden and First-pass yield kept its Demo badge. Narrow 375px layout checked with no page overflow. Not seen live: an unrecoverable or missing-duration finished unit, or the incomplete note.

# Stage B sanitized failure check

Updated November 23, 2026. Owner-run check against the authorized non-production test server, documentation only; no code changed.

- **Wrong password:** the owner started the backend with a deliberately wrong password. Every reporting endpoint checked (unit status, unit test time, weekly unit outcomes, channel activity) and the Query console returned HTTP 503 with only `{"code":"authentication_failed"}` in about 0.2–0.3 s. Each failure logged one line with the code, phase, exception type, SQLSTATE and native error number only; no server, database, login, driver message or query text appeared in responses, logs or screens. Overview and Failures showed "Database check failed (authentication_failed)" on run panels and the labeled demo elsewhere; Unit lookup and the Query console showed the same code.
- **Lockout found:** about 30 failed sign-ins (each panel connects separately) locked the read-only SQL login under SQL Server password policy, so the next start with the correct password also failed with the same sanitized code. The owner unlocked it manually; after a restart all endpoints returned 200 and both screens showed every live panel with no failure. Operational note: a wrong password on start-up can lock the login within seconds; stop the backend and fix the password rather than reloading the app.
- **Stopped service:** with the SQL Server service stopped and the backend left running, the same endpoints and the Query console returned HTTP 503 `{"code":"connection_unavailable"}` after about 6.3 s (connect timeout), with one sanitized log line each (code, phase, type, SQLSTATE, native number) and no target details on screen. After the owner restarted the service, every endpoint returned 200 and Failures showed all eight live panels without a backend restart.
- **Query-plan review remains open:** the Query console accepts one `SELECT`/`WITH` statement only and the diagnostic has no plan option, the read-only login is not known to hold SHOWPLAN, and the test database is too small for realistic cost evidence. It needs a DBA-granted SHOWPLAN read and a larger dataset; no grant was changed.

# Live Failures weekly unit outcomes

Updated November 17, 2026. Implemented the approved connected **Unit outcomes by week** slice without connecting to SQL Server. `GET /api/v1/reporting/unit-outcomes-weekly` reuses the unchanged D17 cohort and timing SQL plus the shared D16/finished-outcome pipeline across eight Pacific Monday-start weeks, then performs one bounded replacement-count read for finished passed units across all historical assignments. Missing duration still counts; open runs and unfinished/currently uncertain outcomes do not. The response validates contiguous weeks, unit ordering and exact bucket/unit equality.

The existing Failures card retains its exact synthetic display for loading and all unavailable responses. Connected mode adds the production-only live badge and refresh, the **Passed, no replacement** legend, Pacific labels/current-week marker, a nice dynamic scale with minimum visible nonzero segments, exact accessible totals, exclusion/incomplete notes and an empty state. Its request is independent of the Failures range control.

Offline verification:

- From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **409 tests**; `.venv\Scripts\ruff.exe check .`, `.venv\Scripts\ruff.exe format --check .` and `.venv\Scripts\python.exe -m pip check` passed. Synthetic coverage includes DST and Monday-midnight week boundaries; bound/read-only and hash-locked shared SQL; replacement history through removed assignments; every outcome split; duration-independent inclusion; open/outside exclusions; empty-query skip; all caps and malformed/overflow rows; response consistency; validation, `not_connected` and sanitized 503.
- `npm.cmd run typecheck` and `npm.cmd run lint` passed. The exact `npm.cmd run build` reached Vite and hit the known managed-filesystem/esbuild config-loader restriction; `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and **472 modules transformed**. `node --check scripts/browser-check.mjs` passed.
- Port 5173 was not listening, so the required existing server could not be reused and `npm.cmd run test:browser` was not run; no server was started or stopped. The harness now covers the unchanged demo/down/503 states, live legend/subtitle/badge/labels/totals/geometry/ARIA, singular, empty, exclusions, incomplete, fixed refresh query, range independence and the existing both-theme 1440/768/390px matrix. Browser interaction and visual inspection therefore remain unverified in this run.
- `git diff --check`, strict UTF-8 decoding and the mojibake-marker scan passed.

No database connection, backend start, real record, credential, target detail, dependency, `AGENTS.md` change, commit or push occurred. Live reconciliation of finished units/finish weeks against unit-test-time and unit-status, and replacement splits against `CHANNEL_REPLACEMENTS`, remains for the separately authorized reviewer.

Reviewer follow-up and live verification (Claude, November 17, 2026): the y-axis maximum now uses four whole-number intervals (step 1, 2, 5, 10, 20, 50…) instead of doubling from 5, which had produced fractional unit labels such as 1.25; the browser-check expectations were updated to match and `npm.cmd run test:browser` passed **37 checks** against the running dev server. Against the authorized non-production test database (production) the endpoint returned eight Pacific weeks with the November 1 DST change at the correct UTC offset. It counted the same 5 passed units as unit-test-time, with matching finish dates and week buckets (4 passed with no replacement, 1 after replacement, 0 unrecoverable). A read-only Query console count of `CHANNEL_REPLACEMENTS` by unit confirmed the one replaced unit is the only finished unit with replacements. Not counted: 3 review required (one more than the 30-day cohort, from the longer window), 1 not evaluated, 1 recovery available, 1 needs analysis. The card was inspected in light desktop and dark 375px with whole-number axis labels and no horizontal overflow. Not verified live: unrecoverable or run-in-progress units, the incomplete flag, live 503 rendering and query-plan cost.

# Live Overview finished-unit test time

Updated November 17, 2026. Implemented the approved D17 working T12 slice without connecting to SQL Server. `GET /api/v1/reporting/unit-test-time` uses a bounded active-assignment run-end/analysis cohort, reuses the D16 projection through a shared post-cohort helper, and reads every run across every historical assignment of the cohort units in one bounded timing query. It counts current passing units and only the two approved current no-recovery analysis results, attributes the full qualifying-run total to the working finish date, prefers confirmed active time per run, labels positive elapsed fallback, and excludes the whole unit for an open or missing-duration constituent run. The original unit-status cohort and five supporting SQL texts are hash-locked unchanged in tests.

The existing Overview **Time to test one unit** card switches only after strict validation of a fixed production/last-30-days response. Live mode keeps the three-stat and eight-bin SVG hierarchy, adds All/Passed/Unrecoverable controls, a **Live · test database** badge, manual refresh, D07 Small Sample/No Data behavior, source/fallback and over-90-minute counts, exclusion notes and the incomplete warning. It is independent of the synthetic configuration table. Loading, reporting-off, unreachable, invalid and sanitized database-failure responses keep the exact configuration-driven demo card. The working finished label is explicitly not final manufacturing disposition.

Offline verification:

- From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **385 tests**; `.venv\Scripts\ruff.exe check .` and `.venv\Scripts\python.exe -m pip check` passed. The first format check reported two line-wrap-only differences in the new test; after correction, `.venv\Scripts\ruff.exe format --check .` passed. Synthetic tests cover binding/read-only SQL, stored hashes for unchanged unit-status SQL, every finished/non-finished rule, analysis-later and outside-period finish dates, removed historical assignments, ignored purpose/excluded/superseded runs, active/fallback totals, open/missing whole-unit exclusions, invalid rows, cohort/timing caps, defaults/validation, `not_connected` and sanitized 503.
- `npm.cmd run typecheck` and `npm.cmd run lint` passed. The exact `npm.cmd run build` reached Vite and hit the documented managed-filesystem/esbuild config-loader restriction; `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and **471 modules transformed**. `node --check scripts/browser-check.mjs` passed.
- `npm.cmd run test:browser` could not start its assertions because no process was listening on the required existing server port 5173; the initial navigation failed with `ERR_CONNECTION_REFUSED`. Per the task constraint, no replacement dev server was started or stopped. The harness has synthetic coverage for the unchanged demo/down/503 paths; connected subtitle/badge/stats; even median and nearest-rank P90; outcome filters; Small Sample/No Data/singular states; eight bins/mean marker; fallback/over-90/exclusion/incomplete notes; fixed refresh query; and the existing both-theme 1440/768/390px matrix, but those additions were not executed or visually inspected in this run.

No database connection, backend start, real record, credential, target detail, `AGENTS.md` change, dependency, commit or push occurred. Not verified here: the browser/visual checks above; live D17 outcomes against unit status; per-unit timing and fallback totals against `vw_RunTimingSummary`; excluded-cohort arithmetic against the authorized test database; or query-plan/cost behavior. Those remain the approved live reviewer acceptance.

Reviewer follow-up and live verification (Claude, November 17, 2026): two browser-check assertions were corrected. The demo card subtitle is 412 units for the default configuration, not 138, and selecting a configuration row now asserts that the live histogram is unchanged instead of expecting it to follow the row. With the dev server running, `npm.cmd run test:browser` passed **36 checks**. Against the authorized non-production test database (production, last 30 days) the new cohort SQL ran without error. The response counted 5 passed units and excluded 5 (2 review required, 1 not evaluated, 1 recovery available, 1 needs analysis), matching unit-status for the same cohort; no unit was unrecoverable. A read-only Query console read of `vw_RunTimingSummary` matched every unit total, run count and fallback count, including a unit whose engineering run was correctly ignored, a two-run unit, a four-run all-fallback unit, and a confirmed run whose idle-excluded time (about 51 minutes) replaced its 24.6-hour start-to-end span. The card showed average 31m 54s, median 33m 08s, nearest-rank P90 50m 56s, Small Sample, the expected eight bins and "4 of 9 runs used start-to-end time"; Unrecoverable showed No Data. Light and dark desktop and dark 375px were inspected with no horizontal overflow. Not verified live: unrecoverable, run-in-progress and missing-duration units (none in range), the incomplete flag, live 503 rendering and query-plan cost.

# Live Failures failing-unit reasons

Updated November 17, 2026. The existing Failures **Why units were unrecoverable** card now switches to the already-loaded D16 `unit-status` response only when reporting is connected. Live mode is retitled **Why failing units aren't recovered** and groups every currently failing unit, in the approved order, into recovery available, no viable recovery found, no usable extra ports, other saved result, analysis out of date or no saved analysis. Counts, rounded cohort shares, largest-group-relative bars and sorted distinct result codes are derived from response rows by a typed pure function. The note separates current extraction-time status and saved analysis from final manufacturing disposition; review-required and incomplete-cohort states remain explicit. Loading and all unavailable states retain the original 27-unit demo card.

Offline verification:

- `npm.cmd run typecheck` and `npm.cmd run lint` passed.
- The exact `npm.cmd run build` reached Vite after TypeScript and hit the known managed-filesystem/esbuild config-loader restriction; `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and **470 modules transformed**.
- `npm.cmd run test:browser` passed **35 checks** against the already-running loopback Vite server on port 5173, which was reused and left running. Synthetic interception covered the unchanged demo/down paths; all six live grouping rules and sorted codes; zero-group suppression; shares and relative widths; review/incomplete notes; singular and empty states; shared-range updates; and both themes at 1440/768/390px. Light/dark desktop and narrow Failures captures were visually inspected.
- `git diff --check`, strict UTF-8 decoding of changed text files and the mojibake-marker scan passed.

No backend file, database connection, real record, credential, target detail, `AGENTS.md` change, dependency, commit or push occurred. Not verified here: live group totals against the authorized test-database response and Unrecoverable units table, or live result codes against `REPLACEMENT_ANALYSES.result_status` through the Query console. Those remain the approved live reviewer acceptance.

Live verification (Claude, November 17, 2026, authorized non-production test database, production purpose, last 30 days): the card showed 2 currently failing units, one **Recovery available** (latest analysis current, 2 unused recommendations, code `recommendations_available`) and one **No saved analysis**, each 50%; the two review-required units were noted and not grouped. Group counts summed to the response's failing units, and each unit's group matched its status and latest analysis in the response and in the Unrecoverable units table. A read-only Query console read of `REPLACEMENT_ANALYSES` confirmed one unit has no saved analysis and the other's only analysis is `recommendations_available`. Not verified live: the stale-analysis, no-viable-recovery, no-extra-ports and other-result groups (no such units in range), and live 503 rendering.

# Live Failures failure concentration

Updated November 17, 2026. `GET /api/v1/reporting/failure-concentration` now returns the bounded Q02 first-observation population for one shared Pacific period and selected purposes, grouped both by logical channel and by measured physical port. It reuses the unchanged failure-rate candidate-run and first-observation CTE text, projects `IL_MEASUREMENTS.physical_port` through the selected `measurement_id`, applies the existing SQL/Python saved-limit agreement, splits a repeated port number by per-run `extra`, and enforces the channel-failures row cap plus the shared criteria-run cap. No schema gate, grant, dependency or database setting changed.

The existing Failures **Where failures concentrate** card switches to the connected response only after strict client validation. It ranks nonzero rows by failures, rate and number, preserves the two-column hierarchy and extra-port styling, adds the shared range/live badge/refresh behavior, and replaces the demo warning with the approved neutral interpretation note. Loading, reporting-off, unreachable, invalid and sanitized database-failure states retain the original synthetic rows and port-50 callout.

Offline verification:

- From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **355 tests**; `.venv\Scripts\ruff.exe check .`, `.venv\Scripts\ruff.exe format --check .`, and `.venv\Scripts\python.exe -m pip check` passed. New synthetic tests cover binding/order, stored hashes for unchanged shared SQL, strict comparisons at either wavelength, unknown limits and fail-closed SQL/Python disagreements, per-run extra classification including the same port number in both groups, channel/port/total equality, equality with channel-failures totals, empty/invalid/overflow behavior, `not_connected`, rejected query parameters and sanitized 503 responses.
- `npm.cmd run typecheck` and `npm.cmd run lint` passed. The exact `npm.cmd run build` reached Vite and hit the known managed-filesystem/esbuild config-loader restriction; `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and **469 modules transformed**.
- `npm.cmd run test:browser` passed **34 checks** against the already-running loopback Vite server on port 5173, which was reused and left running. Synthetic interception covered the unchanged demo/down/503 callout; connected order and tie-breaks, counts, titles, relative widths, EXTRA styling and same-number normal/extra ports; unknown-limit/incomplete notes; empty data; range and refresh requests; and both themes at 1440/768/390px. Light 1440px and dark 390px Failures captures were visually inspected.
- `git diff --check`, strict UTF-8 decoding of changed text files and the mojibake-marker scan passed.

No database connection, backend start, real record, credential, target detail, `AGENTS.md` change, commit or push occurred. Not verified here: live totals against channel-failures, live per-channel equality, physical-port counts against a Query console read, per-run extra flags against `front_panel_channel_count`, or query-plan/cost behavior. Those remain the approved live reviewer acceptance.

Reviewer live check, November 17, 2026, against the authorized test database (production), after the owner restarted the backend:

- Last 30 days: 11 of 373 first observations failed across 13 runs, 0 unknown criteria, not incomplete, exactly equal to `channel-failures` totals; all 49 per-channel failed/observed/unknown counts matched. This week: 0 of 72 across 2 runs, also equal on all 36 channels.
- An independent Query console read (production, not excluded/superseded, first logical-channel observation per run-channel in the window, grouped by `physical_port` and port above `front_panel_channel_count`) matched all 52 port groups, including extra ports 49, 50 and 51 with no failures.
- In the browser the panel showed the live badge, "11 of 373 failed", top channels 43, 45, 7, 18, 21 and ports 43, 45, 7, 9, 18 (one failure each, ranked by rate then number), titles with N/D and rate, and the neutral note, in both themes. Query plans and live 503 rendering remain unverified.

# Live Failures failed channels per unit

Updated November 17, 2026. The existing Failures **Failed channels per unit** panel now switches from its unchanged synthetic first-pass example to the already-loaded D16 `unit-status` response when reporting is connected. It includes only evaluated passing/failing statuses, bins units by 0 through 7+ current failing channels, reports current-filter evaluated/failing totals, and explicitly excludes review-required/not-evaluated units. Live mode removes the unsupported usable-extras zone, changes the axis and interpretation note to current measured status, and shows incomplete/empty states. Its separate **All**/context-run channel-count control is derived from response values; null-count units appear only under All and a vanished selection resets to All after refreshed/range-changed data arrives. Unavailable states preserve the demo caption, 24/36/48 control, zone, bars and first-pass axis.

The unit-status item contract adds nullable positive `channel_count`, projected from the already-read context run's `front_panel_channel_count`; absent/invalid context counts remain null. No SQL, query, grant, gate, endpoint, dependency or database access changed.

Offline verification:

- From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **334 tests**; `.venv\Scripts\ruff.exe check .`, `.venv\Scripts\ruff.exe format --check .`, and `.venv\Scripts\python.exe -m pip check` passed. Tests cover both a projected value and null plus the HTTP response contract.
- `npm.cmd run typecheck` and `npm.cmd run lint` passed. The exact `npm.cmd run build` reached Vite after TypeScript and hit the known managed-filesystem/esbuild config-loader restriction; `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 468 modules transformed.
- `npm.cmd run test:browser` passed **33 checks** against an owned loopback Vite server started with `npm.cmd run dev -- --configLoader runner --port 5173 --strictPort` and stopped afterward. Synthetic interception covered unchanged demo/off/down behavior; connected bins/counts/caption/ARIA; removal of the extras zone; dynamic filters and null-only-under-All behavior; excluded, incomplete and empty states; range update/reset; and the both-theme 1440/768/390px matrix. Light 1440px and dark 390px connected Failures captures were visually inspected.
- `git diff --check`, strict UTF-8 decoding of changed text files and the mojibake-marker scan passed.

No database connection, backend start, reporting-enabled process, real record, credential, target detail, AGENTS.md change, commit or push occurred. Not verified here: live histogram totals against the authorized test database, per-unit counts against the live Unrecoverable table, or context-run counts against `IL_RUNS.front_panel_channel_count`; those remain reviewer live acceptance.

Reviewer live check, November 17, 2026, against the authorized test database (production, last 30 days), after the owner restarted the backend:

- The response had 10 cohort units: 5 passing, 2 failing (recovery available, needs analysis), 2 review required and 1 not evaluated; not incomplete. The histogram showed 7 evaluated units (5 with none, 1 with 1, 1 with 7+), 2 currently failing and 3 excluded, matching the counts exactly.
- Per-unit failing-channel counts (7 and 1) matched the live Unrecoverable units table. A Query console read of `IL_RUNS.front_panel_channel_count` for all 10 context runs matched every returned `channel_count` (36, 48 and 49).
- The All, 36, 48 and 49 filters gave 7/2, 4/1, 1/0 and 2/1 evaluated/failing units. Review found "1 units" and "1 evaluated units" wording; caption, ARIA and excluded note now use the singular for one, and the browser check was updated. The panel was inspected in both themes. Live 503 rendering remains unverified.

# Live Overview station summary

Updated November 16, 2026. Implemented directly by Claude (Codex was at its usage limit). `GET /api/v1/reporting/station-summary` returns last-30-day station-level runs, distinct units, Q02 first-observation failures, V08/V10 within-run retests and median elapsed seconds per channel, with pooled totals and `incomplete`. It reuses the failure-rate candidate-run and first-observation CTE text; the failure-rate and channel-failures SQL were verified byte-identical before and after. The Overview **Stations, last 30 days** table shows it for the selected purposes with a live badge, refresh, an All stations row, relative bars, `—` for nulls and a neutral station-level note instead of the demo callout. No operator data is read.

Offline verification:

- From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **333 tests**; `ruff check .` and `ruff format --check .` passed. New DEMO tests cover parameter binding, shared CTE reuse, station grouping with null last, distinct units, invalid and mismatched limits, retest and timing aggregation with medians, station sums equal to failure-rate totals, empty data, the run cap, fail-closed rows, the row cap, `not_connected`, rejected purpose and period parameters and the sanitized 503.
- `npm.cmd run typecheck` and `npm.cmd run lint` passed. `npm.cmd run test:browser` passed **32 checks** against the local dev server, including the unchanged demo table and callout, connected rows, totals, titles, relative bar widths, the null station row, unknown-limit, incomplete and empty states, purpose re-requests, and the both-theme 1440/768/390px matrix.

Reviewer live check, November 16, 2026, against the authorized test database (production, last 30 days):

- Totals: 11 runs, 8 units, 11 of 301 first observations failed with 0 unknown criteria, matching the failure-rate endpoint exactly; 19 of 301 run-channels retested; not incomplete.
- Independent Query console reads matched every station's runs, distinct units, active and retested run-channels (stations 1, 2 and 99: 1/1/36/1, 2/2/42/0 and 8/5/223/18). Recomputing seconds per channel from each run's `elapsed_ms` and front-panel count reproduced every median (99.6, 49.6, 30.9 and 55.2 overall). One test-database run has about 24 hours of elapsed time, which is why wall-clock medians are labeled as such.
- In the browser, the table showed the live badge, three station rows plus All stations (3.7% failure, 6.3% retests), relative bars and the neutral note, in both themes; the narrow dark view scrolls inside the table wrapper as designed. Live 503 rendering and query plans remain unverified.

# Live Overview channel failure heatmap

Updated November 16, 2026. Implemented directly by Claude (Codex was at its usage limit). `GET /api/v1/reporting/channel-failures` returns Q02 first-observation failures for one shared Pacific period, split by logical channel, with totals, contributing runs, the largest front-panel count and `incomplete`. It reuses the failure-rate candidate-run and first-observation CTE text (extracted into a shared constant; the failure-rate SQL text was verified byte-identical before and after) and the same per-run SQL/Python limit agreement. The Overview **Failures by logical channel** heatmap shows it for the selected range and purposes with a live badge, refresh, rate-relative token ramp, `—` for unobserved channels, up to three ringed standouts and unknown-limit/incomplete notes. Unavailable states keep the original demo heatmap.

Offline verification:

- From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **324 tests**; `ruff check .` and `ruff format --check .` passed. New fake-cursor DEMO tests cover parameter order and period binding, reuse of the failure-rate CTE text, the unchanged 30-day failure-rate seed, per-channel grouping, invalid and mismatched limits, per-channel sums equal to the failure-rate period totals for the same runs, empty periods, the run cap, fail-closed row validation, the row cap, `not_connected`, invalid period and the sanitized 503. The OpenAPI path allowlist gained the endpoint.
- `npm.cmd run typecheck` and `npm.cmd run lint` passed. `npm.cmd run test:browser` passed **31 checks** against the local dev server, including the unchanged demo heatmap, connected cells/titles/standouts, 8 unobserved channels, a 24-channel week, the unknown-limit and incomplete notes, zero failures, refresh and range re-requests, plus the both-theme 1440/768/390px matrix.

Reviewer live check, November 16, 2026, against the authorized test database:

- Production totals equal the failure-rate endpoint's period values exactly: today and this week 0 of 72 (2 runs, 36 channels), yesterday none, last 30 days 11 of 301 with 0 unknown criteria (11 runs, largest front panel 49). Neither response was incomplete.
- Independent Query console first-observation counts over the same 30-day window matched channels 1 (0 of 8), 7 (1 of 7), 43 (1 of 3) and 49 (0 of 2).
- In the browser, the heatmap filled 7 rows (channels 50–56 shown as `—`) and named "Ch 43, 45, 7 stand out", which is correct: 43 and 45 lead at 1 of 3, and 7 wins the 1-of-7 tie as the lowest channel. Measured text contrast on every live ramp step is at least 4.7:1 in dark and 4.8:1 in light after adjusting steps 3–5. Live 503 rendering and query plans remain unverified.

# Live Overview Unit outcomes

Updated November 16, 2026. The existing Overview **Unit outcomes** panel now switches from its unchanged three-row synthetic demo to the already-loaded `unit-status` response when reporting is connected. It shows the six current status buckets in the approved order with counts, cohort shares, an accessible stacked bar, the selected range label, incomplete/empty handling, and the current-state interpretation note. The existing Unrecoverable KPI refresh remains the single refresh trigger for both presentations; no request or endpoint was added. The wavelength strip remains illustrative and gains a connected-mode **Demo** chip with an example-only title.

The status labels are shared with Failures so both screens retain the same wording. The panel uses existing Workbench theme tokens, keeps the Failure examples link and original demo output, and continues to use synthetic DEMO identifiers in tests. `docs/DESIGN_REFERENCE.md` records the deliberate six-status/live difference, and the dashboard map in `docs/METRICS.md` records the Q04–Q08 implementation while Q03 remains Deferred.

Offline verification:

- `npm.cmd run typecheck` and `npm.cmd run lint` passed. The exact `npm.cmd run build` reached Vite after TypeScript and hit the known managed-filesystem/esbuild config-loader restriction; `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 466 modules transformed.
- `npm.cmd run test:browser` passed **30 checks** against an owned loopback Vite server on port 5189, which was started with the runner-loader workaround and stopped afterward. Synthetic interception covered the unchanged demo caption/three legend rows/no badge, connected six-row counts/shares/badge/note/wavelength Demo chip, zero-cohort em dashes and empty state, incomplete warning, shared range refetch/update, and the existing both-theme 1440/768/390px no-overflow matrix. Light 1440px and dark 390px connected Overview captures were visually inspected.
- From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **313 tests** and `.venv\Scripts\ruff.exe check .` passed. `git diff --check`, strict UTF-8 decoding of changed text files, and the mojibake-marker scan passed.

No backend, SQL, endpoint, schema, dependency, database connection, real record, credential, target detail, commit or push was involved. Not verified here: live endpoint/count reconciliation with the authorized test database, including comparison with the Failures current-status panel. That remains reviewer live acceptance.

Reviewer live check, November 16, 2026, against the authorized test database: the Overview panel showed the live badge and exactly the unit-status endpoint counts for the same range. Today: 2 units, 1 passing, 1 review required. Last 30 days: 8 units, 4 passing, 1 recovery available, 1 needs analysis, 0 no measured recovery, 1 review required, 1 not evaluated, matching the Failures current-status check above. The wavelength strip carried the Demo chip. Incomplete-cohort rendering was not seen live.

# Live recommendation usage (R06)

Updated November 16, 2026. Implemented the approved R06 slice without connecting to SQL Server. `GET /api/v1/reporting/recommendation-usage` returns saved-analysis and distinct recommendation-ID counts for one shared Pacific period and selected purposes, required/optional/other splits, linkage through extraction time, nullable four-place linkage share, linked/all predicted-improvement means with n, and in-period linked/unlinked event context. Analyses on excluded/superseded runs or runs with a superseding pointer are counted separately and excluded from the valid cohort.

One fixed aggregate-only, parameterized statement runs after normal preflight on the same short-lived connection. It uses only the already gated/granted `IL_RUNS`, `REPLACEMENT_ANALYSES`, `REPLACEMENT_ANALYSIS_RECOMMENDATIONS` and `CHANNEL_REPLACEMENTS` base tables; the ungranted `vw_ReplacementRecommendationUsage` is not used. Derived distinct tables and `COUNT_BIG` preserve recommendation grain, `EXISTS` admits links outside P through T, averages cast to `DECIMAL(19,6)` before Python four-place rounding, and zero denominators remain null. No row-level data, new object, grant, dependency or log value was added.

The existing Failures recommendation strip shares the replacement/status range and production purpose. A connected response shows the live badge, four requested tiles, category/context sublines, manual refresh and the missing-link/repeated-opportunity/predicted-improvement caveat. Loading, reporting-off, unreachable, invalid and database-failure states preserve the original demo subtitle and four demo tiles unchanged. The strict typed client aborts superseded requests and validates the full response, arithmetic, decimal strings, n values and filter echo.

Offline verification:

- From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **313 tests**; `.venv\Scripts\ruff.exe check .`, `.venv\Scripts\ruff.exe format --check .`, and `.venv\Scripts\python.exe -m pip check` passed. New fake-cursor and synthetic DEMO tests cover parameter order/window binding, purpose slots, invalid-run exclusion, category splits, linkage outside P, unattributed unlinked events, zero D, decimal rounding, `not_connected`, sanitized 503 and guarded SQL text. The exact OpenAPI path allowlist test was updated for the approved endpoint.
- `npm.cmd run typecheck` and `npm.cmd run lint` passed. Exact `npm.cmd run build` passed TypeScript and then hit the known managed-filesystem/esbuild config-loader access restriction. `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 465 modules transformed.
- `npm.cmd run test:browser` passed **29 checks** against an owned loopback Vite server started with the runner-loader workaround and then stopped. Synthetic interception covered the unchanged demo, connected values, null share/averages, unattributed and invalid-run notes, refresh and shared range refetch. The existing both-theme 1440/768/390px matrix passed with no page overflow or normal-flow browser error. Light 1440px and dark 390px connected Failures captures were visually inspected.
- `git diff --check`, strict UTF-8 decoding of changed text files and the mojibake-marker scan passed.

No database connection, reporting-enabled backend, real record, credential, target detail, source-application operation, commit or push occurred. Not verified here: live D/N/unlinked reconciliation, live SQL execution, query plan/cost at representative volume, or live 503 behavior. Those remain owner/Claude acceptance work.

Reviewer live check, November 16, 2026, against the authorized test database:

- Last 30 days, production: 8 valid cohort analyses (0 on invalid runs), 5 with recommendations; 10 distinct recommendations (9 required, 1 optional); 3 linked (all required), share 0.3000; predicted improvement 1.5784 dB over 3 linked and 1.3713 dB over all 10; 0 unlinked and 0 unattributed events; 3 linked events in the period. Today and this week each had 1 analysis with no recommendations, and yesterday had none.
- Independent Query console reads over the same window reproduced every count, the category split and both averages. Replacement events in the window were 3 linked production, 3 linked engineering and 3 unlinked engineering, so the production-only unlinked count of 0 is correct.
- In the browser, the Failures panel showed the live badge, 10 / 3 (30.0%) / 0 / 1.58 dB with the expected sublines and caveat note. Live 503 rendering and query plans remain unverified.

# Live read-only query console

Updated November 16, 2026. Implemented the owner-approved local query console without connecting to SQL Server. `GET /api/v1/query/schema` exposes the 14 reviewed schema-gated objects from application constants without a catalog call. `POST /api/v1/query/execute` accepts one trimmed `SELECT`/`WITH` statement, runs the existing target/permission/migration/column preflight on the same short-lived read-only connection, applies fixed lock/isolation settings plus a 30-second default console timeout, and returns at most 5000 rows by default after one-row overflow detection. A pure secondary guard rejects multiple statements, parameter markers, write/DDL/execution/permission/session/server commands, `SELECT INTO`, remote access, procedure-style identifiers and four-part names. SQL permissions remain authoritative.

Result serialization preserves decimal precision, bounds strings/binary values, normalizes supported temporal values and exposes coarse column types. SQL errors return only the native number and a bounded message after ODBC-prefix removal and case-insensitive configured/approved server, database and login redaction. SQL, values, results and returned server messages are never logged; diagnostics retain only the code, native number, elapsed time and application location. Tests use fake cursors and synthetic DEMO values only.

The Query screen retains the existing synthetic design unchanged whenever schema discovery is disabled, unreachable or invalid. Connected mode keeps its library/editor/results/history hierarchy with five schema-gated examples, a real textarea and Ctrl/Cmd+Enter, browser-only Cancel, dynamic table, compatible bar chart, TSV copy, RFC 4180 CSV, truncation/error states, and guarded browser-local draft/history. Saved/team queries, parameters, formatting, Overview pinning, server-side cancellation and multiple-result-set display remain unavailable.

Offline verification for this implementation:

- From `backend/`, `.venv\Scripts\python.exe -m pytest -q` passed **300 tests**; `.venv\Scripts\python.exe -m ruff check .`, `.venv\Scripts\python.exe -m ruff format --check .`, and `.venv\Scripts\python.exe -m pip check` passed.
- `npm.cmd run typecheck` and `npm.cmd run lint` passed. The exact `npm.cmd run build` command passed TypeScript and then hit the known managed-filesystem/esbuild config-loader access restriction. `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 464 modules transformed.
- `npm.cmd run test:browser` passed **29 checks** against an owned loopback Vite server started with the same runner-loader workaround. Synthetic interception covered the unchanged demo, connected schema, success/table/chart, truncation, guard rejection, redacted SQL error, browser cancellation and exact CSV bytes. The existing both-theme 1440/768/390px matrix also passed. Light 1440px, dark 390px, and light 390px chart captures were visually inspected.
- `git diff --check`, strict UTF-8 decoding of all 21 changed text files, and the mojibake-marker scan passed.
- No database connection, reporting-enabled backend, real record, credential, target detail, source-application operation, dependency change, `AGENTS.md`/`docs/PLAN.md` edit by Codex, commit or push occurred.

Not verified here: any live console query, SQL Server/ODBC timeout cancellation, real permission denial/message shape, example-query compatibility/results against the authorized test database, the default 5000-row live truncation path, or live query plan/cost. Those remain owner/Claude acceptance work under the recorded authorization.

Reviewer live check and fixes, November 16, 2026, against the authorized test database:

- All five built-in examples ran (3, 12, 29, 4 and 13 rows). The chart view, inline error, Ctrl+Enter and browser history worked in a real browser.
- The guard rejected `SELECT INTO` (`forbidden_keyword:INTO`), `UPDATE` and `EXEC` (`not_select`) before execution. A syntax error returned 422 with native 102, and an unknown object returned 208.
- Fix: a capped result was drained through `nextset()`, so a cross join of about 460 million rows took 61.5 s to return 5000 rows. Truncated results now call `cursor.cancel()` and skip `nextset()`; the same query returns in 0.4 s. A fake-cursor test covers it.
- Fix: console error messages now drop the leading SQLSTATE and trailing `(native) (SQLExecDirectW)` markers; the native number stays in `sql_error_number`.
- A query running past 30 s returned 503 `query_timeout` at 30.2 s, and the backend answered the next request immediately.
- The read-only login can read every user table, including `SCHEMA_MIGRATIONS`, not just the 14 gated objects, so a SQL permission denial on reads could not be shown. Preflight still confirms no INSERT/UPDATE/DELETE/ALTER/CONTROL on the gated objects. CSV export was covered only by the synthetic browser suite.

# Live current unit status (D16)

Updated November 13, 2026. Implemented the approved D16 slice without connecting to SQL Server. `GET /api/v1/reporting/unit-status` returns a capped active-assignment D08 cohort for a selected shared Pacific period/purpose set and evaluates each unit now. Typed Python mirrors the reviewed source effective-projection ordering, compatibility, wavelength/port checks and strict saved-limit classification. It separates review, missing coverage, passing, recovery available, needs analysis and no measured recovery. Analysis freshness is the approved timestamp approximation against newest effective readings and assignment replacements, not source-fingerprint equivalence or manufacturing disposition.

One TOP 501 cohort read and five bounded supporting reads execute after existing preflight on the same short-lived connection; a sixth recommendation read occurs only for bounded latest analysis IDs. Generated placeholders come only from at most 500 IDs just read. All statements are explicit, parameterized and read-only; no object, column gate, grant or dependency was added. Supporting caps are 100000 rows for runs/attempts/map/replacements and 5000 recommendations; any overflow marks the response incomplete. Tests and docs contain only DEMO identifiers.

The Overview Unrecoverable tile switches to **currently failing, no measured recovery** when connected, follows range/purposes, removes comparison/history, and shows needs-analysis/recovery-available counts. The Unit outcomes panel remains demo. On Failures, the existing replacement range is lifted into the screen and also controls a production current-status request; the table becomes the three failing statuses sorted no-measured-recovery first, with unit links, switch identity, effective failing channels, latest analysis freshness and separate review/not-evaluated counts. Unavailable responses retain the existing demo table. Both screens use one strict abortable client and manual refresh.

Offline verification:

- Backend `.venv\Scripts\python.exe -m pytest -q` passed all 270 tests; `.venv\Scripts\python.exe -m ruff check .`, `.venv\Scripts\python.exe -m ruff format --check .`, and `.venv\Scripts\python.exe -m pip check` passed.
- Frontend `npm.cmd run typecheck` and `npm.cmd run lint` passed. Exact `npm.cmd run build` reached Vite after TypeScript and hit the known managed-filesystem config-loader restriction; `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 462 modules transformed.
- `npm.cmd run test:browser` passed all 22 checks against a task-started/stopped loopback Vite server on port 5177. Synthetic interception covered demo/not-connected, backend-down, sanitized replacement 503, connected Overview counts, all three failing rows, shared range, refresh/abort behavior, review/not-evaluated notes, both themes and 1440/768/390px layouts. Light 1440px and dark 390px Overview/Failures captures were visually inspected; there was no page overflow or normal-flow browser error.
- `git diff --check` and the UTF-8 mojibake scan passed.

No database connection, reporting-enabled backend, real record, credential, target detail, source execution/import, dependency change, commit or push occurred. Live value reconciliation, live query execution/plan/cost, and live incomplete/503 rendering remain unverified for owner/reviewer acceptance.

Reviewer live check, November 16, 2026, against the authorized test database:

- Last 30 days, production: 8 cohort units, 4 passing, 1 review required (too-good readings), 1 not evaluated, 1 recovery available, 1 needs analysis, 0 no measured recovery; not incomplete. This week: 1 cohort unit, not evaluated.
- The needs-analysis unit's 7 failing channels match Unit lookup's current classified failures for its context run exactly, with no saved analysis. The recovery-available unit's single failing channel matches Unit lookup, and its latest saved analysis is current with 2 unused recommendations.
- The Overview tile showed 0 with "+ 1 need analysis · 1 recovery available" for Last 30 days, and 0/0/0 for Today. The Failures table listed both failing units with unit links, failing channels and analysis freshness, plus the review/not-evaluated note.
- The 0 no-measured-recovery count is expected: the test database has no current analysis without an unused recommendation. Live incomplete/503 rendering and query plans remain unverified.

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

Still pending for full Stage B acceptance: query plan/cost review on realistic volume. The wrong-password and stopped-service sanitized failure checks passed on November 23, 2026 (see the top of this file). Neither blocks local development against the test database.

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
