# Proposed development milestones

Milestones 0 and 1 are complete. Milestone 0 was accepted at `63f0cefd79cc67df2ab98f2d84dc1636104eb795`; Milestone 1 was authorized as focused frontend refinement. Scopes for 2–9 remain proposed and require review/authorization.

| Milestone | Proposed scope |
| --- | --- |
| 0. Repository and design foundation — complete/accepted | Preserved Claude sample; React/Vite adaptation, synthetic interactions, Git foundation, public-content audit, documentation and browser verification. |
| 1. Frontend and reusable UI components — complete | Shared shell/sidebar/status and repeated controls; strict TypeScript mock contracts and pure calculations; scoped filters, explicit previews, keyboard/focus/contrast improvements, browser and visual regression evidence. |
| 2. FastAPI backend foundation | Establish API contracts, configuration, error handling, and health checks; initially isolated from production data. |
| 3. Read-only SQL Server integration | Review schema and permissions; server-side connection management and narrowly scoped read-only repositories. Browser never connects to SQL Server. |
| 4. Core production metrics | Review definitions, time windows, purpose/status filters, units versus runs, current measurements, and elapsed versus active time before implementing metrics. |
| 5. Quality and replacement analytics | Review failure/yield definitions, replacement events versus unique channels, no-recovery analyses versus disposition, current/stale analysis semantics. |
| 6. Unit and run explorer | Search/paging, unit/run timelines, channel maps, attempts and provenance using reviewed read-only API contracts. |
| 7. Custom reports and exports | Review reporting needs, bounded query/report options, export formats and data disclosure controls. The sample query console is not authorization for arbitrary SQL. |
| 8. Security, testing, and deployment | Threat/access review, integration/e2e/performance coverage, operational settings, deployment and rollback plan. Hosting/authentication decisions require review. |
| 9. Pilot and production release | Validate definitions with users, reconcile against reviewed examples, pilot acceptance, training, release readiness and support ownership. |

## Milestone 2 recommendation (not started)

Review API contracts separately from the illustrative presentation contracts. Establish an isolated FastAPI skeleton, configuration conventions, health/error handling and API tests only after authorization. Keep frontend fixtures usable independently. Do not connect production SQL, implement production metrics, enable arbitrary SQL, add authentication or deploy hosting as part of that foundation.
