# Light Workbench Analytics — durable project instructions

## Scope and stack

- Work directly in this existing project directory. Its **Analightics** spelling is intentional; do not rename, move, recreate, or nest another checkout.
- Approved frontend: React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Recharts, TanStack Table. Add dependencies only when required by authorized scope.
- Milestone 0 is the current scope. Later milestones in `docs/PLAN.md` are proposed, not authorization to implement them.
- No FastAPI, authentication, deployment/hosting, advanced reports, or production database integration in Milestone 0.

## Visual authority

- The supplied `Claude-generated analytics dashboard sample/` is the primary design reference. Read `docs/DESIGN_REFERENCE.md` before changing the UI.
- Preserve its navigation, hierarchy, typography, cards, chart/table arrangements, spacing, and responsive intent. Do not replace it with a generic dashboard.
- Use the verified Light Workbench red/gray light and dark palette documented in the design reference.
- Keep original reference files unchanged and ignored. Do not redistribute `support.js` or bundled vendor files without resolving licensing. Adapted React screens and sanitized screenshots are the versioned reference on a fresh clone.
- The sample's remaining JavaScript mock calculations are temporary presentation logic. Migrate incrementally when authorized; keep new application code in TypeScript.

## Data and architecture safety

- Use clearly labeled, entirely synthetic fixtures. Never imply a production connection, live refresh, or completed server query.
- Future flow is React → FastAPI → read-only SQL Server; never connect the browser directly to SQL Server.
- Do not alter the separate Light Workbench application, its repository, database, schema, migrations, or hardware workflows.
- Never commit credentials, connection strings, infrastructure addresses, production/customer records, database exports, or local environment files. SQL/schema shown in the demo is illustrative, not a production contract.
- Future metric definitions require review and must distinguish runs/units, channels/attempts, elapsed/active measurement time, replacement events/unique replaced channels, saved no-recovery analyses/final manufacturing disposition, and current/stale historical analyses.

## Git and publication

- Primary branch: `main`. Expected origin: `https://github.com/austin-santec/Light-Workbench-Analytics.git`.
- Inspect the current worktree before editing; preserve user files and changes. Make focused commits; never force-push or erase remote history.
- This repository is public. Audit every staged file for sensitive content and third-party redistribution rights before any push. Stop a push if the remote has unexpected history or publication is uncertain.
- Initial commit/push is authorized by the Milestone 0 request after its audit. Future publication follows the user's active authorization.
- Git metadata writes may require execution outside the Windows sandbox. Prefer a command-local `-c safe.directory=<absolute-project-path>` ownership exception over changing global Git settings.

## Verification and documentation

- Run TypeScript, lint, and build checks for meaningful frontend changes. Use `npm.cmd` in Windows PowerShell when its execution policy blocks `npm.ps1`.
- For UI changes, inspect a real browser, exercise affected interactions, and check desktop/narrow layouts and both themes. Run `npm.cmd run test:browser` with a running local server; see README for browser options.
- Keep checks meaningful; do not add tests that merely mirror implementation. Do not claim browser/visual verification unless it occurred.
- Record completed work, evidence, limitations, and pending decisions in `docs/STATUS.md`. Update README for setup/behavior changes and the design reference for deliberate visual differences. Keep documentation concise and local to this application.
