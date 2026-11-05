# Milestone 3 status

Updated November 5, 2026. **Stage A is complete; Stage B is pending by explicit user instruction. No database connection was opened.** Milestone 4 is not started.

## Completed Stage A

- Started clean on `main` at approved M2 baseline `5610652d6ede76fc98f1b5515f35d7951a87850e`, matching `origin/main`. Preserved the existing **Analightics** directory and the separate source repository's two pre-existing documentation edits.
- Read-only review of the related local source at `02ec8f831b71a0c593cdf8cc2b3576723c978373`: six SQL migrations, migration runner, reporting repositories/service/lifecycle policy and four architecture documents. Recorded actual dbo objects, types, FKs, assignment ownership, roles/current views, history and eligibility distinctions in `REPORTING_DATABASE.md`. No source application/utilities were imported or run.
- Added internal `app/reporting/`: environment-only, disabled-by-default approval configuration; optional lazy pyodbc adapter; read-only repository protocol/implementation; schema metadata; internal typed run models; local diagnostic emitting sanitized states/counts only. No new HTTP routes, automatic startup probes or React API wiring.
- Exact approved target matching, explicit non-production/dedicated-identity declarations, fixed encrypted certificate-validated ODBC 18 connections, Windows or explicit SQL authentication, bounded login/query timeouts and deterministic cursor/connection cleanup. Permissions enforce read-only access; intent hints and SQL text tests are secondary guards.
- Added current-database/effective-permission gates, exact migration ID/name/checksum checks and consumed-column checks. Reads return a bounded run page joined through its historical assignment to unit/switch context; explicit projection, required UTC period, bound values, stable ordering, capped limit/offset and one extra row for `has_more`. No counts/KPIs, JSON snapshots, measurement history, ORM or source writer code.
- Updated setup, API boundary, durable instructions, milestone plan and notices. Optional pyodbc extra/constraint added; application service version and existing synthetic API contracts remain unchanged.

## Verification evidence

| Check | Result |
| --- | --- |
| Driver prerequisites only | CPython 3.14.7 x64, pyodbc 5.4.0 binary wheel installed/imported, local 64-bit Microsoft ODBC Driver 18 enumerated. No `connect()` against a real driver/server. Python 3.12/3.13 and other operating systems were not exercised. |
| Offline backend suite | **122 passed**, no warnings: existing 42 foundation tests plus reporting configuration/approval/target gates, binding, UTC/date/page bounds, ordering, cleanup, login/query/fetch failures, missing/incompatible schema, permissions, sanitized logs, metadata projections, no-write SQL and local diagnostic behavior. |
| Default isolation | Fresh-process guards block database/hardware imports, network connections and DLL loads while importing the HTTP app, constructing disabled reporting and exercising synthetic routes. Only Windows asyncio's internal socket-pair construction is exempted. Tests require no SQL Server or connected hardware. |
| Source metadata cross-check | Offline text review matched all six normalized migration checksums and all 23 consumed column signatures against source DDL, including the nullable station field. No SQL was executed; this is not live schema verification. |
| Backend lint/format/dependencies | Ruff lint/format checks and `pip check` passed. Documented optional editable install with tested constraints succeeded. |
| Local diagnostic | `python -m app.reporting` returned `{"reporting": "disabled"}` without loading the driver or connecting. Enabled/compatible/incompatible/error paths were exercised only with fakes. |
| Frontend | Existing TypeScript, lint and production build passed; `src/`, `public/`, frontend dependencies, browser scripts and design assets are unchanged from M2. No visual differences introduced. |
| Browser regression | Existing real headless Edge suite passed against loopback production preview 4174: 14 groups, 24 screen/theme/width captures plus narrow query chart. Four screens, both themes, 1440/768/390 px; navigation, filters/table/unit/query controls, theme persistence, keyboard/focus/contrast, responsive overflow, loading/error/reload recovery. No normal-flow console/page errors, missing assets or failed requests. |
| Preserved files | All seven original Claude references match their saved SHA-256 manifest. Reviewed source files and both pre-existing source documentation edits retain their hashes; source Git status is unchanged. |
| Public/Git audit | `git diff --check` and staged audit passed before the focused commit/push. No secrets, actual connection details, real records/exports, source migration/writer files, vendor binaries, venv or original runtime files staged. Resulting SHA/push evidence is in the completion handoff/Git history. |

Ignored evidence is in `.local/milestone3/`: schema text cross-check, source/reference hashes, browser results/captures and publication review. The temporary frontend verification server is stopped after checks. M0–M2 evidence remains in Git history and the existing design references.

## Pending Stage B and unresolved questions

The user selected **complete Stage A; leave Stage B pending**. No server/database/identity was approved or configured for real access. No SQL objects, source application files, database permissions or production/hardware workflows were modified. No live compatibility, read-only identity, TLS, timeout behavior or query plan/cost is proven.

Before Stage B, explicitly approve the exact non-production target and separate identity; have administrators provision/review narrow effective permissions and certificate trust; verify actual migration history, consumed columns/relationships and database settings; then run bounded reads and inspect plans without test writes or destructive setup. Use the acceptance checklist in `REPORTING_DATABASE.md`. There is no production-access authorization.

M4 must resolve the lifecycle helper's production/complete/included policy versus the report service's production/included/not-superseded rule before final metrics. Also review partial/extra-only runs, unique units, attempts/current effective values, elapsed versus active timing availability, assignment-scoped replacement events/verification and stale saved analysis versus final disposition. Existing global date queries may need an administrator-reviewed index/plan strategy; current filters/caps/timeouts are not performance proof. No final KPI formulas or dashboard real-data integration were begun.
