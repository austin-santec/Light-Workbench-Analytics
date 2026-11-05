# Light Workbench Analytics

A browser-based analytics design foundation for Light Workbench. Milestone 0 adapts the supplied Claude dashboard into a working frontend with entirely synthetic data. No backend, SQL connection, authentication, or hosting is implemented.

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

The browser check uses installed Microsoft Edge through `playwright-core`; it does not download a browser. Other environments can set `BROWSER_PATH` to a compatible Chromium executable. `BASE_URL` overrides the test URL. Screenshots and results go to ignored `.local/qa/`.

## Frontend

React 19, TypeScript, Vite, Tailwind CSS 4, a locally owned shadcn/ui button, Recharts, and TanStack Table. Geist fonts are bundled locally. The original sample's mock presentation calculations remain in small JavaScript modules with typed input/output boundaries; they are not validated production analytics.

```text
src/
  App.tsx                Hash navigation, theme, route loading state
  screens/               Overview, Failures, Unit, Queries (adapted templates)
  mock/                  Synthetic fixtures and retained sample calculations
  components/            RecentActivity, QueryChart, ui/button
  lib/                   Styling and class helpers
  types.ts               Mock state and activity contracts
  styles.css             Workbench palette and sample layout adjustments
public/                  Original vector favicon and third-party licenses
scripts/browser-check.mjs
docs/                    Design audit, proposed plan, status, notices
```

## Demo behavior and limits

- Navigate among all four original screens. Theme preference persists locally.
- Overview range/purpose controls update summary cards and recent activity; configuration rows update the histogram. Charts keep their explicitly labeled demo periods.
- Recent activity supports serial search, model/station filters, sorting, and empty states. It is a small fixture list, not the full aggregate dataset.
- Unit lookup contains one detailed fixture, `DEMO-18793` / `DEMO-SW-001`. Other serials show an empty state; wavelength controls work.
- Query table/chart tabs, library search, and illustrative schema expansion work. SQL is displayed as text and never executed.
- Unsupported filters/actions and saved views retain their design appearance as disabled previews. Exports, sharing, query editing/execution, saved reports, and production metric semantics are deferred.

Future architecture: **React → FastAPI → read-only SQL Server**. The browser must never access SQL Server. The separate Light Workbench repository and its database/hardware workflows are untouched.

See [design reference](docs/DESIGN_REFERENCE.md), [status and evidence](docs/STATUS.md), [proposed milestones](docs/PLAN.md), and [third-party notices](docs/THIRD_PARTY.md). Stop at Milestone 0 until further work is authorized.
