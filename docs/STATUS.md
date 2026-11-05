# Milestone 2 status

Updated November 5, 2026. Milestones 0–2 are complete. Milestone 3 is not started and requires separate authorization.

## Completed work

- Started clean on `main` at approved M1 baseline `94849723fc7c839c956e14aaa4331942d1313085`, matching the supplied `origin/main`. The existing **Analightics** directory spelling is unchanged.
- Added independent `backend/` packaging and a conventional CPython 3.14.7 x64 virtual environment (Python requirement: 3.12+). Dependencies are declared in `pyproject.toml`, with a tested version-constraint snapshot. FastAPI TestClient uses current Starlette's recommended HTTPX2, avoiding the deprecated HTTPX compatibility path.
- Added a small app factory, Pydantic settings/DTOs, three versioned GET endpoints, six deterministic DEMO runs, exact optional filters, bounded offset/limit pagination and explicit empty results. No KPI calculations or duplicate frontend mock engine.
- The launcher binds only to loopback (default `127.0.0.1:8000`), rejects external host configuration, keeps CORS absent by default and disables request access logs. Optional sanitized settings example is committed; actual `.env` files remain ignored.
- Added consistent validation/404/405/500 JSON errors. Unexpected exceptions are caught before Uvicorn can emit their raw text; local diagnostics retain exception type/stack locations without input values, source lines or locals. Response validation failures receive the same sanitized 500.
- Documented Windows setup, contracts/examples/errors and proposed future API boundaries. Consulted only the related repository's database/data architecture docs at pinned commit `810ec42c46ed656eda90ddb5f14dec11fa77a2d8`; no production application execution or modification.
- Frontend `src/`, `public/`, package manifests, browser scripts and design assets are unchanged from M1. The only frontend tooling adjustment excludes `backend/**` from ESLint to avoid linting JavaScript bundled in Python's virtual environment. Git ignores also exclude Python build/egg metadata.

## Verification evidence

| Check | Result |
| --- | --- |
| Backend install | Documented editable install with development extras and tested constraints succeeded; `pip check` passed. No database/hardware packages were added. |
| Runtime | CPython 3.14.7, MSC AMD64, 64-bit. Python 3.12/3.13 and non-Windows hosts were not exercised. |
| Backend tests | **42 passed**, no warnings: import/startup, liveness/info, demo/schema/UTC normalization, deterministic order, filters, empty results, pagination boundaries, invalid/unknown parameters, missing routes, methods, response validation, sanitized error logs, configuration, CORS and isolation. |
| Isolation | Fresh-process import guards reject database/hardware/OP815 modules, socket connection attempts and DLL loads during app import/startup/route calls. Only Windows asyncio's internal loopback socket-pair construction is exempted. Tests use in-process TestClient; no database or hardware access. This is targeted regression coverage, not a security sandbox. |
| Backend lint/format | `ruff check .` and `ruff format --check .` passed. |
| Real HTTP startup | `python -m app` started successfully; listener verified at `127.0.0.1:8000`. Liveness, system info, filtered synthetic runs, `/openapi.json` and `/docs` returned 200. |
| Frontend checks | Existing `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build` passed. No source/assets/dependency changes or visual design differences. |
| Browser regression | Existing suite passed in real headless Edge against loopback production preview on 4174: **14 check groups**, 24 screen/theme/width captures plus narrow query chart. Four screens at 1440/768/390 px in light/dark; direct routes, active navigation, filters/table/unit/query controls, theme persistence, keyboard/focus, targeted contrast and no page overflow. |
| Browser error/diagnostics | Delayed and failed lazy import/reload recovery passed. Normal flows had no console/page errors, missing assets or failed requests. The deliberate simulated 503 is isolated. |
| Preserved references | All seven original Claude files still match their saved SHA-256 manifest; originals remain ignored. M0/M1 screenshots and visual reference documentation are unchanged. |
| Git/publication | `git diff --check` and staged public-content audit passed before the focused commit/push. Virtual environment, runtime metadata, secrets, local evidence, original runtime and production data are excluded. The completion handoff/Git history records the resulting SHA and push outcome. |

Ignored local evidence: `.local/milestone2/` contains HTTP smoke results, frontend browser results/captures and read-only architecture context. Temporary verification servers are stopped after checks.

## Limits and next decisions

The frontend continues using its own synthetic fixtures; it does not consume the API. Liveness reports process responsiveness only; system info explicitly says the data source is disconnected. There is no SQL execution interface, ORM, database initialization, migrations, metrics, authentication, hosting or hardware/DLL integration. No separate production repository/database/workflows were changed.

The standard Swagger UI uses public CDN assets; its HTML/OpenAPI endpoints were verified by HTTP, not an interactive Swagger browser session. App licensing remains an owner decision; the original Claude runtime's unclear redistribution license remains contained by keeping it local and unshipped.

Proposed M3: review schema, least-privilege access, sensitive fields and metric vocabulary, then design narrowly bounded server-side read-only access/tests against an approved non-production environment. Production access, API consumption by the frontend and final production DTOs require explicit review. See `PLAN.md` and `API_CONTRACTS.md`.

M0/M1 evidence remains in Git history and `docs/design/`; their accepted dashboard behavior and limitations still apply. No further milestone was begun.
