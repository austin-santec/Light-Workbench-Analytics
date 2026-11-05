# Milestone 1 status

Updated November 5, 2026. Milestone 1 is complete; Milestone 2 is not started.

## Baseline and completed work

- Started from accepted M0 commit `63f0cefd79cc67df2ab98f2d84dc1636104eb795`, with a clean worktree and matching `origin/main`. The existing directory spelling **Analightics** is unchanged.
- Replaced four duplicated frames with shared `AppShell`, `Sidebar` and `DemoStatus`; centralized route labels/active states. Hash routing and the four specialized screens remain.
- Added shared segmented buttons and native disabled preview button/select/input components. Scope descriptions distinguish functional summary filters, local controls and fixed historical periods. The misleading Failures “Open all in console” link is now a disabled preview.
- Migrated all four JavaScript mock modules to strict TypeScript. Explicit contracts cover fixtures, states, quality/recovery outcomes, chart geometry, filters, activity and presentation results. Functions are pure; UI owns event handlers. Shared configuration fixtures and duration/sparkline helpers remove repeated data/logic. No `any`, suppression directives or new dependencies were introduced.
- Improved skip navigation, route-change focus, input outlines, reset focus, numeric sorting, trimmed/case-insensitive searches, query-search empty state, schema disclosures, semantic configuration table, channel descriptions and keyboard-scrollable panels. Added real route loading/error/reload recovery.
- Preserved the original Claude reference files unchanged and ignored. SHA-256 checks still match all seven originals. The separate production repository, database, schema, hardware workflows and hosting configuration are untouched.

## Verification evidence

| Check | Result |
| --- | --- |
| TypeScript | `npm.cmd run typecheck` passed with strict checking and `allowJs: false`, including mock internals. |
| Lint | `npm.cmd run lint` passed without warnings; removed the mock-JavaScript exception. |
| Build | `npm.cmd run build` passed; route chunks stay below Vite's default size warning threshold. |
| Calculation preservation | One-time comparison against the accepted commit passed across 452 states: Overview ranges/purposes/configurations, failure channel counts, wavelengths, query views/schema states. Callbacks/color representation and newly typed numeric fields were excluded from structural comparison; existing demo values/calculations were preserved. |
| Browser suite | Passed in real headless Edge against Vite dev (5174) and production preview (4174). Each run captured 24 screen/theme/width combinations plus the narrow query chart. |
| Interactions | Direct routes/active navigation, filter scopes, activity search/filter/sort/reset/empty/detail links, unit lookup/switch alias/fallback, failure histogram, query search/schema/result views and disabled execution passed. |
| Keyboard/contrast | Skip link, Enter/Space activation, route/back focus, visible outlines and reset focus passed. Selected navigation and muted text met 4.5:1 contrast in both themes. These are targeted checks, not full accessibility certification. |
| Responsive/visual | Four screens at 1440/768/390 px in light/dark; no horizontal page overflow. Desktop/narrow captures inspected against M0; recognizable layout/density retained. |
| Loading/error | Delayed and deliberately failed lazy imports verified loading with navigation retained, actionable error UI and successful reload. The simulated 503 is isolated from normal diagnostics. |
| Normal diagnostics | No console/page errors, failed requests or missing assets. |
| Git/publication | `git diff --check` passed. Staged content audited for secrets, infrastructure addresses, production/customer data and redistribution issues before commit/push. Originals, local evidence, dependencies and build output remain excluded. |

Local before/after matrices, calculation comparison and results are in ignored `.local/milestone1/`. Sanitized M1 screenshots are versioned in `docs/design/milestone1/`; committed M0 screenshots remain unchanged. README documents `BASE_URL` and `QA_OUTPUT` for reproducing checks.

One focused M1 commit/push is authorized after verification, the public audit and expected-history check. The resulting SHA/push evidence is recorded in the completion handoff and Git history rather than embedding this document's own commit hash.

## Control scope and remaining limitations

| Control | Supported scope |
| --- | --- |
| Overview range/purpose | Synthetic counts, yields, outcomes and recent list. Historical panels/sparklines stay fixed. |
| Configuration | Fixed 30-day histogram and average-time example; average time follows range, not purpose. |
| Activity search/model/station/sort/reset | This small table within summary range/purpose; not reconciled aggregate data. |
| Failure channel count | Local histogram only; header filters remain disabled previews. |
| Unit serial/wavelength | One detailed fixture (`DEMO-18793` / `DEMO-SW-001`); others show fallback. Wavelength highlights the chart; tables/map retain both readings. |
| Query search/schema/result view | Filters titles, expands illustrative columns, or switches the same fixed results. SQL never executes. |
| Other actions/saved views | Disabled previews/static examples. Export/share/save/pin/execution and custom dates remain deferred. |

Synthetic definitions are not production analytics or manufacturing disposition rules. The original runtime's unresolved license is contained by keeping it local and unshipped; application licensing remains an owner decision. No backend, SQL connectivity, production calculations, authentication or hosting was added.

Recommended next scope: review isolated FastAPI/API-contract/error/health-test foundations in proposed Milestone 2, without production SQL or deployment. Further implementation requires authorization; see `docs/PLAN.md`.
