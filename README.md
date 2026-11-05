# Light Workbench Analytics

A browser-based analytics design foundation for Light Workbench. Milestones 0 and 1 retain the supplied Claude dashboard while consolidating the frontend and typing its entirely synthetic data. No backend, SQL connection, authentication, or hosting is implemented.

## Run locally

Use Node.js 22.12+ (validated with 24.22.1) and npm. In this existing folder, whose spelling **Analightics** is intentional:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the Local URL printed by Vite, normally <http://127.0.0.1:5173/>. `npm.cmd` avoids Windows PowerShell's script execution-policy restriction; `npm` works in other shells. No environment file or database credentials are needed.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run preview
```

For browser checks, keep the dev server running in a second terminal:

```powershell
npm.cmd run test:browser
```

The browser check uses installed Microsoft Edge through `playwright-core`; it does not download a browser. Other environments can set `BROWSER_PATH` to a compatible Chromium executable. `BASE_URL` overrides the test URL; `QA_OUTPUT` overrides ignored `.local/qa/` for screenshots/results. The suite includes keyboard/contrast checks plus isolated delayed/failed imports to verify loading and reload recovery.

## Frontend

React 19, strict TypeScript, Vite, Tailwind CSS 4, a locally owned shadcn/ui button, Recharts, and TanStack Table. Geist fonts are bundled locally. All application-owned mock modules have explicit TypeScript contracts and pure presentation functions; their calculations are illustrative, not validated production analytics. No new dependencies were added in Milestone 1.

```text
src/
  App.tsx                Hash navigation, theme, route loading/error recovery
  screens/               Overview, Failures, Unit, Queries (adapted templates)
  mock/                  Typed fixtures/contracts and pure sample calculations
  components/            Shared shell/sidebar, controls, activity table/chart
  lib/                   Styling and class helpers
  types.ts               Mock state and activity contracts
  styles.css             Workbench palette and sample layout adjustments
public/                  Original vector favicon and third-party licenses
scripts/browser-check.mjs
docs/                    Design audit, proposed plan, status, notices
```

## Demo behavior and limits

- Navigate among all four original screens. Theme preference persists locally; keyboard navigation focuses the shared page frame and skip link. Failed lazy imports offer reload recovery.
- Overview range/purpose controls update counts, yields, outcomes and recent activity. Average time follows range/configuration only; configuration buttons select the histogram. Historical charts and sparklines keep fixed demo periods.
- Recent activity supports trimmed, case-insensitive serial search, model/station filters, sorting, reset, and empty states. It is a small fixture list, not the full aggregate dataset.
- Unit lookup contains one detailed fixture, `DEMO-18793` / `DEMO-SW-001`. Other serials show an empty state; wavelength controls work.
- Query table/chart buttons switch the same fixed results; library search filters titles only and has an empty state. Illustrative schema expansion works. SQL is displayed as text and never executed.
- Unsupported filters/actions retain their design appearance as native disabled previews with visible explanation. Saved views are static examples; the Unit sidebar links example serials. Exports, sharing, query editing/execution, saved reports, and production metric semantics are deferred.

Future architecture: **React → FastAPI → read-only SQL Server**. The browser must never access SQL Server. The separate Light Workbench repository and its database/hardware workflows are untouched.

See [design reference](docs/DESIGN_REFERENCE.md), [status and evidence](docs/STATUS.md), [proposed milestones](docs/PLAN.md), and [third-party notices](docs/THIRD_PARTY.md). Milestone 2 is not started and requires authorization.
