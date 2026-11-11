# Stage B authorization and read-only identity provisioning

Updated November 11, 2026. The owner authorized Stage B for one named local non-production test database and a dedicated read-only SQL login. Exact target and identity details stay in local, untracked configuration. The owner provisioned the login through an administrator connection: one database role with object-level SELECT on `SCHEMA_MIGRATIONS`, `IL_RUNS`, `UNIT_SWITCH_ASSIGNMENTS`, `UNITS`, `SWITCHES` and `vw_RunTimingSummary`.

Owner-run checks (screenshots reviewed):
- The login belongs to no other database role, and `public` has no grants on `dbo` objects.
- Impersonated as the login, the permission checks returned SELECT on `IL_RUNS` and `vw_RunTimingSummary` = 1, and INSERT/UPDATE on `IL_RUNS`, SELECT on `IL_MEASUREMENTS`, `dbo` schema SELECT and database CREATE TABLE = 0.
- The migration ledger check ran successfully; its output was not reviewed here.

**First real connection (owner-run, November 11, 2026):**
- `python -m app.reporting` returned `configured_not_verified` with `tls: encrypted_unverified`, so the settings were valid with no connection made.
- `python -m app.reporting --verify` returned **`compatible`** with `tls: encrypted_unverified`.

So against the real test database, over an encrypted connection using the non-production certificate-trust opt-in:
- the migration ledger matches exactly 1–7 with the reviewed names and checksums;
- the consumed column types match;
- the login passed the role and permission preflight;
- connection cleanup completed.

The server's TCP port is configured static.

A bounded run read (`--verify --runs`, window 2026-10-12 to 2026-11-12 UTC, 31 days) returned `compatible` with `returned_count: 4` and `has_more: false`. The parameterized, historical-assignment run query works against the real schema. Only sanitized counts were printed.

Still pending for full Stage B acceptance: query plan/cost review on realistic volume and sanitized failure behavior against the real server (e.g. a wrong password or a stopped service). Neither blocks local development against the test database.

# Non-production certificate-trust opt-in

Updated November 11, 2026. At the owner's decision, reporting now has a default-off `LWA_REPORTING_TRUST_SERVER_CERTIFICATE` setting for the approved local test server's self-signed certificate. Encryption remains mandatory, certificate validation remains the default, and the opt-in is rejected unless the target is declared non-production. The local diagnostic reports the sanitized TLS mode without exposing target or credential values.

Offline validation: backend `pytest` passed 125 tests; `ruff check .`, `ruff format --check .` and `pip check` passed. Frontend typecheck and lint passed. The exact `npm.cmd run build` command was blocked by the managed filesystem while esbuild tried to read a parent directory and resolve `vite.config.ts`; the approved fallback `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 452 modules transformed. `git diff --check` passed. Milestone 3 Stage B remains **unaccepted**. No database connection, reporting verification, commit or push occurred.

# Migration 7 source baseline refresh

Updated November 11, 2026. The offline reporting schema baseline now recognizes exactly source migrations 1–7 at read-only evidence commit `5d4972830e74cc1b1e718fb577916d132e58faf7`. Migration 7 is `run_test_sessions` with normalized SHA-256 `43f6ec51f25bfd1bfae3da6255d896708add338cb021d96a8dab653f01f14125`; migrations 1–6 were re-derived at the same commit and remain unchanged. Evidence was read only with `git show`; no source code was imported or executed.

The compatibility gate accepts the seven reviewed ledger rows and fails closed for a missing migration 7, an extra migration 8, a gap, and a changed migration 7 name or checksum. The new `IL_RUN_SESSIONS` table and `vw_RunTimingSummary` are documented as source facts only. They were not added to analytics consumed columns, permissions or queries. Duration feasibility now recognizes prospective active time for `confirmed` sessions while retaining labeled elapsed fallback or incompleteness for pre-0007, missing, partial, checkpoint-estimated and provisional timing.

Offline validation: backend `pytest` passed 123 tests; `ruff check .`, `ruff format --check .` and `pip check` passed; frontend typecheck and lint passed; `git diff --check` passed. The exact `npm.cmd run build` command was blocked by the managed filesystem while esbuild tried to read a parent directory and resolve `vite.config.ts`. The non-mutating workaround `npm.cmd run build -- --configLoader runner` passed with Vite 7.3.7 and 452 modules transformed. No browser test was required because there was no UI change.

Milestone 3 Stage B remains **unapproved**. No database connection, reporting enablement, driver operation, HTTP route, React wiring, source-repository change, dependency change, commit or push occurred.

# Milestone 4A status

Updated November 6, 2026. **Final owner decision update prepared for review, documentation only.** The previous reconciliation is committed at `7801ae409c0d2110834cf6b6aa4c53334c3437ba`; it is no longer pending as unstaged work. Final D05/D06/D07/D08/D14 decisions are incorporated in [METRICS.md](METRICS.md), preserving other approvals. Technical verification and production readiness are not implied. Milestone 3 Stage B remains **unapproved**; Milestone 4B is **not started**.

## Delivered for review

- Started from clean `main` at reference commit `7801ae409c0d2110834cf6b6aa4c53334c3437ba`, matching locally recorded `origin/main`; no fetch/remote verification is claimed. Origin remains `https://github.com/austin-santec/Light-Workbench-Analytics.git`. Preserved the intentional **Analightics** directory.
- Preserved all **42 existing metric IDs** (including the original 35), S01–S12 evidence and E01–E22 case identities. Added only **Q11 `quality.corrective_recovery_fraction`**, because Q05 must remain a count while the percentage needs an explicit resolved-configuration denominator. Catalog: **43 contracts**, **27 fictional cases**, and D01–D15 each once in the dated register. No stable IDs renamed.
- D05 now specifies **last 30 complete Pacific Time dates**, context-aware rolling/calendar/matched-partial comparisons and remembered model/mode filters, while each visit's date range defaults anew. A new-user all-models/all-modes fallback remains proposed, not separately approved.
- D07 now includes valid >90-minute observations by default, flags strictly >90 minutes and retains controls/configurable threshold. Nearest-rank P90 is `ceil(0.90*n)`; show mean/median/P90 at n>=1, Small Sample at n<10, No Data at n=0, always n/exclusions.
- D06/D14 make **T12 the primary per-finished-unit cumulative duration**: all qualifying runs/retests across days or weeks, no inter-run gaps or episodes. Prefer run-active, label elapsed fallback; retain active-only/elapsed-only/combined sources and secondary run diagnostics. One unit contributes once; separate passed/conclusively-unrecoverable means, default overall both. Unfinished/pending/uncertain or incomplete units are excluded with reasons. No run-completion or insufficient-candidate shortcut to unit completion.
- Full cumulative duration is attributed to the latest **verified current finished-outcome date**. Later changed testing recalculates totals/eligibility/date, making finished summaries restated current-state reports. Actual activity stays on its occurrence dates. No immutable snapshots, new completion actions or mandatory SM-and-MM testing are invented; historical physical-switch model/mode/assignment evidence remains authoritative.
- D08 quality defaults to K with qualifying accepted production testing in P, plus a separate All Current Configurations view. Latest valid effective evidence/current map at extraction still determines quality. Q11 uses verified corrective recoveries / definitively resolved corrective-replacement configurations; pending/uncertain separate. Incomplete candidates do not prove unrecoverability.
- Previous approvals remain: W/A/C separation, unit/channel distinctness, production workload versus compatible technical evidence, valid replacement events/reversals/matched ratios, confirmed suitable candidates including deployed, current/stale recommendation separation, identity/privacy, bounded reporting and source effective behavior. The source threshold discrepancy remains open. First-pass manufacturing yield and true historical as-of quality remain Deferred.

## Remaining decisions and verification

The only separately unapproved default identified in the final decisions is the proposed all-models/all-modes fallback for new users. Comparison edge cases, persistence mechanism and secondary ongoing-run presentation need technical design; the core defaults, statistics, primary unit population/date and quality/recovery denominator are now approved in intent.

**T12 and Q11 may be unsupported in full:** authoritative unit-level conclusive terminal failure/latest finish timestamps and definitive corrective resolution may not be reconstructable. Complete unit-run history (including supplemental work and old retests) and duration coverage must be verified under bounded queries. Do not truncate history to the selected period, infer a date from a run end/write, omit an unknown terminal group or fabricate a complete overall average/denominator. SQL still lacks reliable run-active intervals; elapsed fallback does not cure missing outcome/history evidence. T08's old workflow-span proposal is superseded, not a request for episodes.

Other technical gates persist: rounded COC >= versus strict classifier; valid-workflow SQL/Python consistency; historical configuration integrity; corrective sequence/current map; candidate allocation; recommendation applicability/freshness; administrative-error authority; exact aggregates/resource budgets/incomplete reporting. Acquisition-only T05, interruption T06, uninterrupted T07, strict first-pass Q03, final disposition Q10 and historical as-of remain unsupported/deferred as specified. No manufacturing outcome is inferred from a saved no-recovery analysis or incomplete candidates.

Stage B still requires explicit exact non-production target and dedicated read-only identity authorization plus administrator provisioning, schema/TLS/effective-privilege and bounded query-plan acceptance. See [REPORTING_DATABASE.md](REPORTING_DATABASE.md) for the unchanged Stage A foundation; [METRICS.md](METRICS.md) now records owner policy where the earlier foundation lists open M4 questions. No SQL connection is authorized.

## Validation and preservation

- Checked baseline ID preservation, 43 unique contracts/fields, 15 dated decision rows, 27 fictional cases, unchanged source evidence, local Markdown links/anchors and metric cross-references. Reviewed unit-versus-run and K denominator grains, whole-history versus period clocks, restatement, fallback/completeness, final approvals and remaining gaps. Checked example arithmetic/P90/default-window DST boundaries, UTF-8/LF and sensitive-content patterns. `git diff --check` passes.
- Only `docs/METRICS.md`, `docs/PLAN.md` and this file are changed. Source/application code, tests, SQL, migrations, dependencies/configuration and original Claude files remain untouched. SHA-256 comparisons confirm all seven original Claude files and 30 source evidence files match retained preservation records. No real data, credentials or new infrastructure identifiers were introduced.
- No application tests, lint/build or browser tests were run: this is documentation-only validation. No application/source import or execution, driver operation, SQL connection/query, hardware operation or real-record HTTP exposure occurred.
- **This final update** remains unstaged/uncommitted for review. No commit or push was performed for it; HEAD remains `7801ae409c0d2110834cf6b6aa4c53334c3437ba`, which already contains the previous reconciliation.

Final owner intent is documented; these changes await review. Implementation and integration still require separate authorization. See [PLAN.md](PLAN.md).
