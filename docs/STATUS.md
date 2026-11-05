# Milestone 0 status

Updated November 5, 2026. Milestone 0 only; later milestone scopes remain proposed.

## Completed

- Inspected the existing root and all seven supplied files. The sample was runnable HTML/custom React templates; no previous Git repository or scaffold existed. Preserved the original directory and verified all original SHA-256 hashes unchanged after adaptation.
- Established React + TypeScript + Vite in the requested existing directory, with Tailwind, a shadcn/ui button, Recharts query chart, TanStack activity table, local fonts and lockfile.
- Adapted all four sample screens; preserved the Claude layout and changed theme tokens to the verified Light Workbench palette. Added hash navigation, theme persistence, route loading fallback, real mock interactions and readable narrow layouts.
- Added synthetic labels, `DEMO-*` serials/operators and honest empty states. Removed connection/role/migration, live-refresh and executed-query claims. Original runtime/vendor files are ignored, unserved and absent from build output.
- Added README, durable agent instructions, proposed roadmap, design reference, third-party notices, license texts, and sanitized screenshots.
- Initialized Git directly at the intended project root on `main`; configured the supplied `origin` and verified the target remote initially had no refs. Public publication is authorized after the staged-content audit; exact commit/push evidence is recorded in the completion handoff and Git history.

## Validation evidence

| Check | Result |
| --- | --- |
| Dependency installation | `npm.cmd install` succeeded on Node 24.22.1 / npm 11.19.1. |
| TypeScript | `npm.cmd run typecheck` passed; strict application TypeScript with incremental JS fixture boundaries. |
| Lint | `npm.cmd run lint` passed with no warnings. |
| Build | `npm.cmd run build` passed. Route chunks remain below Vite's default 500 kB warning threshold; original runtime is not bundled. |
| Local Vite startup | Served successfully on `http://127.0.0.1:5173/`; real Edge navigation succeeded. |
| Production build preview | Served on loopback port 4173; the same browser suite passed against the built assets. |
| Browser interactions | Overview range/purpose and configuration selection; activity search/model/station/sort/empty/detail link; unit wavelengths/lookup/reset; failures channel-count selection; query tabs/schema/search; disabled execution; theme reload persistence. |
| Responsive/theme checks | Four screens × 1440, 768 and 390 px × light/dark; no page-level horizontal overflow. Also exercised the narrow query chart and unknown-route/unit states. |
| Browser diagnostics | No page/console errors, missing assets or failed requests in the completed checks. |
| Visual inspection | Original screens and adapted desktop/narrow screenshots inspected in Edge. Qualitative fidelity confirmed; no pixel-diff claim. |
| Dependency audit | `npm.cmd audit --json`: zero reported vulnerabilities after a targeted lint-tool minimatch override. |
| Publication audit | Reviewed publishable source/docs/assets and staged changes for credentials, connection strings, internal addresses, production/customer records and redistribution rights. Originals, caches, dependencies, build output and local evidence are excluded. |

`npm.cmd run test:browser` reproduces the Edge checks with a running dev server; use `BASE_URL` to target production preview. Full screenshots/results are ignored in `.local/qa/`; sanitized reference captures are versioned in `docs/design/`.

Windows environment observations: PowerShell blocks `npm.ps1`, so use `npm.cmd`. The managed sandbox required normal-user execution for Git metadata/network and Vite's config loader; ordinary user terminals do not need application configuration changes. A file lock while downloading a license interrupted one dev-server instance; restarting succeeded, and reference/license/evidence directories are now excluded from unnecessary file watching.

## Remaining limitations and decisions

- Global model/mode/channel/station/operator/status filters and export/share/save/pin/run actions are retained disabled previews. Custom date selection is deferred. Saved views are inert previews.
- Overview range/purpose controls affect synthetic summary cards, outcomes and the small recent list; historical charts retain explicit fixed periods. Fixtures do not constitute a reconciled production dataset or reviewed metric definitions.
- Unit detail has one complete fixture. Unsupported serials show a clear empty state. Query SQL/schema/history is illustrative; there is no query executor or server.
- Some original presentation calculations remain JavaScript; full typing/shared-component extraction belongs to reviewed Milestone 1. The original runtime's license remains unresolved, but it is not redistributed or needed by this app.
- Review the adapted visual references, overall project license and proposed milestone scopes. No backend, SQL connection, production app changes, auth, reporting engine or hosting has been started.

Recommended next work: review Milestone 1 in `docs/PLAN.md`; keep it to frontend consolidation, typed fixtures, coherent filter scopes and accessibility while preserving this design.
