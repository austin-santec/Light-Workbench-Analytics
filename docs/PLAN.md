# Proposed development milestones

Milestones 0–2, Milestone 3 Stage A, and Milestone 4A's documentation/decision-preparation work are complete. Milestone 4A started from approved baseline `87579140fb5d6c51d8d41eb26875ebed945259bb`. Milestone 3 Stage B remains pending; no database connection is authorized. Metric definitions remain unapproved. Milestone 4B and scopes 5–9 require separate review/authorization.

| Milestone | Proposed scope |
| --- | --- |
| 0. Repository and design foundation — complete/accepted | Preserved Claude sample; React/Vite adaptation, synthetic interactions, Git foundation, public-content audit, documentation and browser verification. |
| 1. Frontend and reusable UI components — complete | Shared shell/sidebar/status and repeated controls; strict TypeScript mock contracts and pure calculations; scoped filters, explicit previews, keyboard/focus/contrast improvements, browser and visual regression evidence. |
| 2. FastAPI backend foundation — complete | Isolated loopback FastAPI process, validated settings, versioned liveness/info/synthetic-run routes, Pydantic contracts, sanitized errors, focused tests and frontend regression checks. No frontend API wiring or SQL execution interface. |
| 3. Read-only SQL Server integration — Stage A complete; B pending | Reviewed source migrations/schema/eligibility; optional disabled-by-default pyodbc adapter, approval/TLS/permission/schema gates, bounded parameterized run/identity metadata reads and offline tests. No real integration connection, real-record API or React wiring. Stage B needs explicit non-production target/identity approval and manual acceptance. |
| 4A. Production metric definitions — review draft delivered | [Canonical metric catalog](METRICS.md): eligibility evidence/history, volume/duration/replacement/quality contracts, feasibility, dates/query-work proposals, synthetic examples, dashboard mapping and owner decisions. Documentation only; definitions are not approved. |
| 4B. Core production metric implementation — not started | Requires explicit authorization, approved relevant metric/clock/population/threshold decisions and Stage B evidence. Implement a reviewed first batch with bounded queries and protected evidence access; no approval is implied by the sample dashboard. |
| 5. Quality and replacement analytics | Review failure/yield definitions, replacement events versus unique channels, no-recovery analyses versus disposition, current/stale analysis semantics. |
| 6. Unit and run explorer | Search/paging, unit/run timelines, channel maps, attempts and provenance using reviewed read-only API contracts. |
| 7. Custom reports and exports | Review reporting needs, bounded query/report options, export formats and data disclosure controls. The sample query console is not authorization for arbitrary SQL. |
| 8. Security, testing, and deployment | Threat/access review, integration/e2e/performance coverage, operational settings, deployment and rollback plan. Hosting/authentication decisions require review. |
| 9. Pilot and production release | Validate definitions with users, reconcile against reviewed examples, pilot acceptance, training, release readiness and support ownership. |

## Remaining Stage B and metric approval

Stage B remains pending by user instruction: approve the exact non-production target and dedicated identity, provision object-level read permissions/certificate trust through administrators, verify real schema and effective privileges, inspect query plans and run bounded reads without writes. See `REPORTING_DATABASE.md` for the acceptance checklist. Neither a known development database nor an integration-looking name supplies authorization.

Milestone 4A's [35 candidate metric contracts and decision register](METRICS.md) require owner/team review. Key findings include resumed included runs entering reports, mutable run ends, missing SQL active-session timing, differing exact-limit comparisons and current-view ordering, non-additive distinct counts, and the absence of final manufacturing disposition. No source logic was changed.

Recommended first batch after approval/integration evidence: volume/activity counts with separate start/end/write clocks, followed by recorded replacement counts and explicitly labeled full-plan elapsed statistics. Defer yield/recovery/spare percentages until population, threshold, cutoff and denominator decisions are resolved. The catalog's fictional cases are proposed acceptance fixtures, not approved rules. Retain disconnected demos; no arbitrary SQL, hardware workflows, writes, authentication, hosting or real-data HTTP access is implied.
