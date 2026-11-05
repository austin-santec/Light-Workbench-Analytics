# Milestone 4A status

Updated November 5, 2026. **Metric-definition review draft delivered; no new metric is approved.** Milestone 3 Stage B remains pending, no database connection is authorized, and Milestone 4B is not started.

## Delivered

- Started from clean `main` at approved M3 Stage A commit `87579140fb5d6c51d8d41eb26875ebed945259bb`, matching `origin/main`. Preserved the existing **Analightics** folder spelling.
- Created [METRICS.md](METRICS.md) as the canonical owner-review catalog: **35 candidate contracts** across volume, elapsed/unsupported timing, replacement records and quality; counting grains, formulas/N-D, populations, clocks, source evidence, missing-data/limit rules, drill-downs, verification cases, feasibility and individual approval states.
- Recorded **15 unresolved owner decisions**, **17 independent/shared-history synthetic verification cases**, proposed date/DST/comparison and bounded multi-month semantics, dashboard alignment issues and a conditional first implementation batch. Mock values/formulas remain illustrative; none became production business rules.
- Reviewed the related source read-only at exact commit `02ec8f831b71a0c593cdf8cc2b3576723c978373`: six migrations, lifecycle/repositories/reports, current/effective/COC projections, replacement history/analysis, timing persistence and architecture documentation. Checked relevant Git history and call sites without importing/running the application.

## Findings requiring review

- The lifecycle eligibility helper requires production/complete/included and has test callers only in the reviewed tracked source. Runtime reporting uses production/included/no superseding pointer. Standard terminal transitions often align, but desktop resume can preserve included while changing complete→in_progress/end=NULL, so the discrepancy is operationally reachable. Neither definition was silently chosen as universal authority.
- SQL persists run start/final end and accepted-write times. It does not provide authoritative active-session duration, operator interruption or first-completion history. Resume preserves the original start; proposed elapsed full-plan averages include gaps/retests and must be labeled accordingly. Full 48-channel plans and complete two-channel retests need different populations.
- Saved-profile classification fails strictly above a limit; COC validation fails rounded values at or above it. SQL current view orders attempts/IDs while Python current projection uses write-time/attempt/ID. Boundary and chronology differences need explicit owner decisions.
- Distinct units, assignment/mode/channels, attempts, replacement events, current mapping and saved analyses have different grains and clocks. Recommendations may cover only some required failures or be optional; no-recovery analysis, missing candidates and final manufacturing disposition are not interchangeable. Accurate active time and final rejection/scrap are unsupported by current authoritative SQL data.

## Documentation validation and preservation

- Validated local Markdown links/anchors, 35 unique stable metric IDs, complete contract-field structure, approval states, 15 decision IDs, 17 example IDs and source references/locators. `git diff --check` passed; staged public-content audit passed before the focused documentation commit/push.
- Reviewed source paths match the recorded commit; relevant source hashes, the source worktree's two existing unrelated documentation edits and all seven original Claude hashes are unchanged. Frontend, backend, tests, migrations, application assets and configuration remain unchanged.
- **No application tests, lint/build or browser suite were run for this documentation-only milestone.** No driver import/enumeration, SQL connection/query, hardware operation, production application execution, code/test change or real-record HTTP exposure occurred.
- Only `docs/METRICS.md`, `docs/PLAN.md` and this status file changed. Ignored documentation-validation/preservation evidence is under `.local/milestone4a/`. Resulting commit SHA/push evidence is recorded in the completion handoff and Git history.

## Pending

Owner/team review must select timezone/period semantics, metric-specific eligibility, channel/retest units, exact-limit comparisons, timestamp ordering, elapsed-time scope, quality cohort/unique-unit rollup, replacement/spare denominators, snapshot/identity privacy, historical-restatement and query-work policies. Approval requires an explicit dated record; the draft is not approval.

Suggested first batch after relevant decisions and separately authorized Stage B evidence: metadata/activity counts, then recorded replacement counts and explicitly labeled full-plan elapsed statistics. No production calculations, new queries, dashboard redesign or Milestone 4B implementation was begun. Existing M0–M3 evidence remains in Git history and the design/database documents; see [PLAN.md](PLAN.md) for remaining gates.
