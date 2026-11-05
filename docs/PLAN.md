# Proposed development milestones

Scopes below require review before implementation. Only Milestone 0 is authorized/completed in the initial setup.

| Milestone | Proposed scope |
| --- | --- |
| 0. Repository and design foundation | Inspect/preserve Claude sample; React/Vite adaptation, synthetic interactions, Git foundation, public-content audit, lightweight documentation and browser verification. |
| 1. Frontend and reusable UI components | Review design fidelity; extract shared shell/cards/filter/table components incrementally; type retained mock modules; clarify filter scopes and accessible interactions. Keep synthetic data. |
| 2. FastAPI backend foundation | Establish API contracts, configuration, error handling, and health checks; initially isolated from production data. |
| 3. Read-only SQL Server integration | Review schema and permissions; server-side connection management and narrowly scoped read-only repositories. Browser never connects to SQL Server. |
| 4. Core production metrics | Review definitions, time windows, purpose/status filters, units versus runs, current measurements, and elapsed versus active time before implementing metrics. |
| 5. Quality and replacement analytics | Review failure/yield definitions, replacement events versus unique channels, no-recovery analyses versus disposition, current/stale analysis semantics. |
| 6. Unit and run explorer | Search/paging, unit/run timelines, channel maps, attempts and provenance using reviewed read-only API contracts. |
| 7. Custom reports and exports | Review reporting needs, bounded query/report options, export formats and data disclosure controls. The sample query console is not authorization for arbitrary SQL. |
| 8. Security, testing, and deployment | Threat/access review, integration/e2e/performance coverage, operational settings, deployment and rollback plan. Hosting/authentication decisions require review. |
| 9. Pilot and production release | Validate definitions with users, reconcile against reviewed examples, pilot acceptance, training, release readiness and support ownership. |

## Milestone 1 recommendation (not started)

Keep the four-screen design and Workbench palette. First review the M0 screenshots and scope labels, then extract the shared shell and existing repeated controls. Type the remaining presentation fixtures; decide which global filters should affect which datasets. Improve keyboard/touch usability and preserve meaningful browser checks. Defer backend work, production SQL, authentication, advanced reporting and deployment to their reviewed milestones.
