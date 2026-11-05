# Proposed development milestones

Milestones 0–2 are complete. Milestone 0 was accepted at `63f0cefd79cc67df2ab98f2d84dc1636104eb795`; Milestone 2 started from approved Milestone 1 commit `94849723fc7c839c956e14aaa4331942d1313085`. Scopes for 3–9 remain proposed and require review/authorization.

| Milestone | Proposed scope |
| --- | --- |
| 0. Repository and design foundation — complete/accepted | Preserved Claude sample; React/Vite adaptation, synthetic interactions, Git foundation, public-content audit, documentation and browser verification. |
| 1. Frontend and reusable UI components — complete | Shared shell/sidebar/status and repeated controls; strict TypeScript mock contracts and pure calculations; scoped filters, explicit previews, keyboard/focus/contrast improvements, browser and visual regression evidence. |
| 2. FastAPI backend foundation — complete | Isolated loopback FastAPI process, validated settings, versioned liveness/info/synthetic-run routes, Pydantic contracts, sanitized errors, focused tests and frontend regression checks. No frontend API wiring or SQL execution interface. |
| 3. Read-only SQL Server integration | Review schema and permissions; server-side connection management and narrowly scoped read-only repositories. Browser never connects to SQL Server. |
| 4. Core production metrics | Review definitions, time windows, purpose/status filters, units versus runs, current measurements, and elapsed versus active time before implementing metrics. |
| 5. Quality and replacement analytics | Review failure/yield definitions, replacement events versus unique channels, no-recovery analyses versus disposition, current/stale analysis semantics. |
| 6. Unit and run explorer | Search/paging, unit/run timelines, channel maps, attempts and provenance using reviewed read-only API contracts. |
| 7. Custom reports and exports | Review reporting needs, bounded query/report options, export formats and data disclosure controls. The sample query console is not authorization for arbitrary SQL. |
| 8. Security, testing, and deployment | Threat/access review, integration/e2e/performance coverage, operational settings, deployment and rollback plan. Hosting/authentication decisions require review. |
| 9. Pilot and production release | Validate definitions with users, reconcile against reviewed examples, pilot acceptance, training, release readiness and support ownership. |

## Milestone 3 recommendation (not started)

Review the actual schema, data sensitivity, least-privilege permissions and metric vocabulary first. Define a narrowly scoped server-side read-only access boundary and safe timeouts/query bounds against an explicitly approved non-production environment. Establish repository tests and connectivity/error semantics before authorizing production access. Retain the disconnected demo mode and independent frontend. Review DTOs separately from illustrative presentation contracts. No arbitrary SQL, hardware workflows, schema writes, authentication or hosting is implied by this proposed scope. See `API_CONTRACTS.md` for boundaries awaiting review.
