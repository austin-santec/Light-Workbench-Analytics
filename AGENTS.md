# Light Workbench Analytics — durable project instructions

## Scope and stack

- Work directly in this existing project directory. Its **Analightics** spelling is intentional; do not rename, move, recreate, or nest another checkout.
- Approved frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts, TanStack Table. Add dependencies only when required by authorized scope.
- Milestones 0–2 establish the current frontend and isolated backend foundations. The Milestone 2 request authorizes only the backend foundation and its audited commit/push; no frontend redesign/refactoring. Later milestones in `docs/PLAN.md` require separate authorization.
- Approved backend: conventional 64-bit Python 3.12+, FastAPI, Pydantic/Pydantic Settings, Uvicorn; pytest, FastAPI TestClient/HTTPX2 and Ruff for development. Use the independent `backend/.venv`, `pyproject.toml` and tested dependency constraints. Never reuse the production application's interpreter/environment or hardware dependencies.
- No SQL access, authentication, deployment/hosting, production metrics, advanced reports, ORM/repositories, migrations or background workers in Milestone 2. Keep the frontend independently runnable on its own synthetic fixtures.

## Visual authority

- The supplied `Claude-generated analytics dashboard sample/` is the primary design reference. Read `docs/DESIGN_REFERENCE.md` before changing the UI.
- Preserve its navigation, hierarchy, typography, cards, chart/table arrangements, spacing, and responsive intent. Do not replace it with a generic dashboard.
- Use the verified Light Workbench red/gray light and dark palette documented in the design reference.
- Keep original reference files unchanged and ignored. Do not redistribute `support.js` or bundled vendor files without resolving licensing. Adapted React screens and sanitized screenshots are the versioned reference on a fresh clone.
- Application-owned mock calculations are strict TypeScript pure functions with explicit fixture/presentation contracts. Preserve accepted demo values; never treat them as validated production analytics. Keep application code in TypeScript and retain shared layout/control components.

## Data and architecture safety

- Use clearly labeled, entirely synthetic fixtures. Never imply a production connection, live refresh, or completed server query.
- Future flow is React → FastAPI → read-only SQL Server; never connect the browser directly to SQL Server.
- Backend DTOs are transport contracts, separate from React presentation contracts, CSS and SVG geometry. Keep example records deterministic and labeled synthetic with DEMO identifiers. Use UTC-aware timestamps. Document changes in `docs/API_CONTRACTS.md`; do not finalize production schemas/metric definitions from mock data.
- Start locally from `backend/` using `python -m app` with validated loopback settings; do not expose beyond loopback. CORS is absent by default; any development origins must be explicit loopback URLs. Never log raw request/query/body values or exception text containing sensitive data. Preserve sanitized HTTP errors and locally diagnosable stack locations/types.
- Do not alter the separate Light Workbench application, its repository, database, schema, migrations, or hardware workflows.
- Never commit credentials, connection strings, infrastructure addresses, production/customer records, database exports, or local environment files. SQL/schema shown in the demo is illustrative, not a production contract.
- Future metric definitions require review and must distinguish runs/units, channels/attempts, elapsed/active measurement time, replacement events/unique replaced channels, saved no-recovery analyses/final manufacturing disposition, and current/stale historical analyses.

## Git and publication

- Primary branch: `main`. Expected origin: `https://github.com/austin-santec/Light-Workbench-Analytics.git`.
- Inspect the current worktree before editing; preserve user files and changes. Make focused commits; never force-push or erase remote history.
- This repository is public. Audit every staged file for sensitive content and third-party redistribution rights before any push. Stop a push if the remote has unexpected history or publication is uncertain.
- The Milestone 2 request authorizes one focused commit and push to `origin/main` after checks, publication audit and expected-history verification. Future publication follows the user's active authorization.
- Git metadata writes may require execution outside the Windows sandbox. Prefer a command-local `-c safe.directory=<absolute-project-path>` ownership exception over changing global Git settings.

## Verification and documentation

- Run TypeScript, lint, and build checks for meaningful frontend changes. Use `npm.cmd` in Windows PowerShell when its execution policy blocks `npm.ps1`.
- For backend changes run `pytest`, `ruff check .`, `ruff format --check .`, `pip check` inside `backend/`, plus frontend typecheck/lint/build and `git diff --check` for milestone regression. Tests must use an in-process client and stay independent of databases/hardware. Preserve the fresh-process import/network/DLL isolation test; its narrowly scoped socket-pair exception is Windows asyncio's internal wakeup pipe only. Never run integration tests against production without explicit future authorization.
- For UI changes, inspect a real browser, exercise affected interactions, and check desktop/narrow layouts and both themes. Run `npm.cmd run test:browser` with a running local server; see README for browser options.
- Keep checks meaningful; do not add tests that merely mirror implementation. Do not claim browser/visual verification unless it occurred.
- Record completed work, evidence, limitations, and pending decisions in `docs/STATUS.md`. Update README for setup/behavior changes and the design reference for deliberate visual differences. Keep documentation concise and local to this application.
