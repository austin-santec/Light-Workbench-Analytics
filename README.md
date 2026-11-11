# Light Workbench Analytics

A browser-based analytics design foundation for Light Workbench. Milestones 0–2 retain the Claude dashboard and establish an independent synthetic FastAPI foundation. Milestone 3 adds an offline-tested, opt-in SQL Server reporting adapter and the first bounded aggregate endpoint. The frontend still runs independently using its own fixtures; one clearly separated Overview card can consume that endpoint when the local backend is available. No authentication, final production metrics, hardware integration, or hosting is implemented.

## Run locally

Use Node.js 22.12+ (validated with 24.22.1) and npm. In this existing folder, whose spelling **Analightics** is intentional:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the Local URL printed by Vite, normally <http://127.0.0.1:5173/>. `npm.cmd` avoids Windows PowerShell's script execution-policy restriction; `npm` works in other shells. No environment file, backend, or database credentials are needed for the synthetic screens. With the backend off, the live card reports that `127.0.0.1:8000` is not reachable and the rest of the Overview continues to work.

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

## Backend (independent local process)

Use conventional **64-bit Python 3.12+** (validated with CPython 3.14.7 x64). Keep its environment separate from the production application's Python. From the repository root in Windows PowerShell:

```powershell
# Select an installed 64-bit interpreter; substitute another 3.12+ version if needed.
py -0p
py -3.14 -m venv backend/.venv
Set-Location backend
.venv\Scripts\python.exe -m pip install -e ".[dev]" -c requirements-dev.lock
.venv\Scripts\python.exe -m app
```

Open <http://127.0.0.1:8000/docs> for interactive API documentation; <http://127.0.0.1:8000/openapi.json> is the machine-readable contract. Swagger's UI loads its standard assets from a public CDN; JSON endpoints and in-process tests do not require that CDN. Stop with Ctrl+C.

To show the live run-activity card, start the backend from `backend/` in the terminal that already contains the owner-approved local reporting settings, then start Vite from the repository root in a second terminal:

```powershell
# Settings terminal, from backend/
.venv\Scripts\python.exe -m app

# Second terminal, from the repository root
npm.cmd run dev
```

Vite proxies only `/api` requests to `http://127.0.0.1:8000`; the browser never connects to SQL Server and no CORS change is needed. Reporting remains disabled by default. The card fetches on load and Run purpose changes, and has a manual refresh button; it has no automatic refresh loop.

FastAPI, Pydantic/Pydantic Settings and Uvicorn are the runtime stack. pytest, FastAPI TestClient, HTTPX2 and Ruff are development tools. Current Starlette recommends [HTTPX2 for TestClient](https://starlette.dev/testclient/); the deprecated HTTPX dependency is not needed. `pyproject.toml` declares dependencies; `requirements-dev.lock` constrains the tested resolution without machine-specific paths. Refresh that snapshot intentionally in a clean environment, then rerun checks. Python 3.12/3.13 have not been tested here.

No configuration file is required. Optional `backend/.env` settings are illustrated in the sanitized [.env.example](backend/.env.example). Run from `backend/` so only that directory's `.env` is read. Environment variables override the file. Defaults: `LWA_APP_NAME="Light Workbench Analytics API"`, `LWA_ENVIRONMENT=development`, `LWA_LOG_LEVEL=info`, `LWA_HOST=127.0.0.1`, `LWA_PORT=8000`, `LWA_CORS_ORIGINS=[]`. Environment accepts `development`/`test`; host accepts loopback only (`127.0.0.1`/`::1`), port 1024–65535, and CORS accepts explicit loopback origins with ports. Keep CORS empty for this milestone. Use the supplied launcher; do not override Uvicorn to expose the process externally. Access logs are disabled to avoid echoing query values.

In a second PowerShell terminal, from `backend/`:

```powershell
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe -m ruff check .
.venv\Scripts\python.exe -m ruff format --check .
.venv\Scripts\python.exe -m pip check
Invoke-RestMethod http://127.0.0.1:8000/api/v1/health/live
```

```text
backend/
  app/main.py            App factory, middleware, routes, optional explicit CORS
  app/__main__.py        Validated loopback-only local launcher
  app/api.py             Four versioned GET routes
  app/core/              Settings and sanitized error handling/logging
  app/schemas.py         Pydantic request/response transport contracts
  app/services/demo.py   Six deterministic fictional runs; filter/page only
  app/reporting/         Disabled-by-default, local-only SQL reporting/diagnostic
  tests/                 In-process API, configuration and isolation checks
  pyproject.toml         Runtime/development dependencies and check configuration
  requirements-dev.lock Tested dependency constraints
```

See [API contracts](docs/API_CONTRACTS.md) for query parameters, response examples, errors and proposed future API boundaries. There is no HTTP SQL execution interface, automatic database setup, or hardware dependency.

## Optional local reporting

Read [reporting database guidance](docs/REPORTING_DATABASE.md) before configuring any target. The repository supports schema/permission checks, bounded run reads and the aggregate `/api/v1/reporting/run-activity` route. Reporting is lazy and disabled by default; synthetic endpoints remain unchanged.

From `backend/`, installing the optional 64-bit adapter and checking the default disabled state is safe without SQL Server:

```powershell
.venv\Scripts\python.exe -m pip install -e ".[dev,reporting]" -c requirements-dev.lock
.venv\Scripts\python.exe -m app.reporting
# {"reporting": "disabled"}
```

Microsoft ODBC Driver 18 and pyodbc 5.4.0 were locally enumerated/imported on CPython 3.14 x64. The main test suite uses fake database connections. Reporting configuration uses separate `LWA_REPORTING_*` environment variables only, never the source application's configuration. Use reporting only with the separately recorded owner-approved non-production target and dedicated read-only identity. Full Stage B acceptance still requires the remaining query-plan/cost and sanitized real-failure checks recorded in [STATUS.md](docs/STATUS.md).

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
- Overview range/purpose controls update synthetic counts, yields, outcomes and recent activity. Average time follows range/configuration only; configuration buttons select the histogram. Historical charts and sparklines keep fixed demo periods. The separate **Live · test database** card follows Run purpose only and uses the last 30 complete UTC days.
- Recent activity supports trimmed, case-insensitive serial search, model/station filters, sorting, reset, and empty states. It is a small fixture list, not the full aggregate dataset.
- Unit lookup contains one detailed fixture, `DEMO-18793` / `DEMO-SW-001`. Other serials show an empty state; wavelength controls work.
- Query table/chart buttons switch the same fixed results; library search filters titles only and has an empty state. Illustrative schema expansion works. SQL is displayed as text and never executed.
- Unsupported filters/actions retain their design appearance as native disabled previews with visible explanation. Saved views are static examples; the Unit sidebar links example serials. Exports, sharing, query editing/execution, saved reports, and production metric semantics are deferred.

Reporting architecture: **React → FastAPI → read-only SQL Server**. The browser must never access SQL Server. The separate Light Workbench repository and its database/hardware workflows are untouched.

See [design reference](docs/DESIGN_REFERENCE.md), [status and evidence](docs/STATUS.md), [proposed milestones](docs/PLAN.md), and [third-party notices](docs/THIRD_PARTY.md). Milestone 3 Stage A is complete; Stage B is pending. Milestone 4 is not started and requires separate authorization.
