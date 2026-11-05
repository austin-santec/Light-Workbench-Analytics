# Proposed development milestones

Milestones 0–2 and Milestone 3 Stage A are complete. Milestone 3 started from approved M2 commit `5610652d6ede76fc98f1b5515f35d7951a87850e`. The user explicitly left Stage B pending. Scopes for 4–9 remain proposed and require review/authorization.

| Milestone | Proposed scope |
| --- | --- |
| 0. Repository and design foundation — complete/accepted | Preserved Claude sample; React/Vite adaptation, synthetic interactions, Git foundation, public-content audit, documentation and browser verification. |
| 1. Frontend and reusable UI components — complete | Shared shell/sidebar/status and repeated controls; strict TypeScript mock contracts and pure calculations; scoped filters, explicit previews, keyboard/focus/contrast improvements, browser and visual regression evidence. |
| 2. FastAPI backend foundation — complete | Isolated loopback FastAPI process, validated settings, versioned liveness/info/synthetic-run routes, Pydantic contracts, sanitized errors, focused tests and frontend regression checks. No frontend API wiring or SQL execution interface. |
| 3. Read-only SQL Server integration — Stage A complete; B pending | Reviewed source migrations/schema/eligibility; optional disabled-by-default pyodbc adapter, approval/TLS/permission/schema gates, bounded parameterized run/identity metadata reads and offline tests. No real integration connection, real-record API or React wiring. Stage B needs explicit non-production target/identity approval and manual acceptance. |
| 4. Core production metrics | Review definitions, time windows, purpose/status filters, units versus runs, current measurements, and elapsed versus active time before implementing metrics. |
| 5. Quality and replacement analytics | Review failure/yield definitions, replacement events versus unique channels, no-recovery analyses versus disposition, current/stale analysis semantics. |
| 6. Unit and run explorer | Search/paging, unit/run timelines, channel maps, attempts and provenance using reviewed read-only API contracts. |
| 7. Custom reports and exports | Review reporting needs, bounded query/report options, export formats and data disclosure controls. The sample query console is not authorization for arbitrary SQL. |
| 8. Security, testing, and deployment | Threat/access review, integration/e2e/performance coverage, operational settings, deployment and rollback plan. Hosting/authentication decisions require review. |
| 9. Pilot and production release | Validate definitions with users, reconcile against reviewed examples, pilot acceptance, training, release readiness and support ownership. |

## Remaining Stage B and proposed Milestone 4

Stage B remains pending by user instruction: approve the exact non-production target and dedicated identity, provision object-level read permissions/certificate trust through administrators, verify real schema and effective privileges, inspect query plans and run bounded reads without writes. See `REPORTING_DATABASE.md` for the acceptance checklist. Neither a known development database nor an integration-looking name supplies authorization.

Proposed M4 starts with metric definitions: resolve lifecycle-helper versus report-service inclusion rules, front-panel/extra-only and partial-run scope, units versus runs, accepted attempts versus effective current values, reporting time windows and elapsed versus active measurement time. Agree on reference examples and reconcile bounded query results before authorizing any production KPI implementation. Retain disconnected demos; no arbitrary SQL, hardware workflows, writes, authentication or hosting is implied.
