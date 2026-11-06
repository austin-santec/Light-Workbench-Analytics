# Production metric definitions — Milestone 4A

**Owner intent reconciled November 6, 2026; documentation changes prepared for review.** The supplied owner decisions approve the semantics recorded in D01–D15, with explicit unresolved details. They do not certify metric contracts, source completeness or production readiness. This canonical definition/decision document authorizes no implementation, database connection, schema change or real-record HTTP access. Milestone 3 Stage B remains unapproved; Milestone 4B is not started. Dashboard values are synthetic design examples, not manufacturing evidence.

All **35 original stable IDs are retained without renaming**. Seven companion contracts are necessary to avoid overloading them: V12 separates assignment/mode coverage from corrected unit-level V06; V13 separates cross-run remeasurement from within-run retests; T09–T12 distinguish run-active, general elapsed, combined averages and per-unit testing totals from the original full-plan/hardware/workflow scopes; R07 separates current recommendations from historical R06. The catalog now contains **42 contracts**. Companion formulas operationalize owner intent; details not explicitly approved remain proposed and require verification before implementation.

## Evidence index

Evidence below is retained from the initial 4A review. This reconciliation starts from analytics commit `270f829842c2f36913783c3f90bc2086b7f56f1e`; it does not repeat source execution or establish live database facts.

Analytics baseline: `87579140fb5d6c51d8d41eb26875ebed945259bb`. Related source: `austin-santec/Light-Workbench`, local `ILM Python Testing`, branch `cleanup`, exact reviewed commit **`02ec8f831b71a0c593cdf8cc2b3576723c978373`**. Relevant source files are unchanged from that commit. Its existing two unrelated documentation edits were preserved. Source was read, never imported/run; no live database was inspected. [Reporting database contract](REPORTING_DATABASE.md) records types/relationships and the separate integration acceptance checklist.

References S01–S12 identify files/symbols at that source commit; they are source facts, not proof of actual stored data quality or owner intent.

| Ref | Source path / locator | Established evidence |
| --- | --- | --- |
| S01 | `infrastructure/database/sql_migrations/0001_initial_schema.sql` through `0006_authoritative_channel_roles.sql` | dbo units, switches, assignments, runs, accepted paired measurements, replacement/spare events, saved analyses/recommendations; UTC `DATETIME2(3)`, decimal losses, FKs and vocabularies. 0003 adds station, 0005 adds void JSON/removes exclusion-reason column, 0006 defines roles and current/extra projections. |
| S02 | `domain/database_run_lifecycle.py:is_normal_production_analysis_eligible`; `domain/run_purpose.py:default_analysis_policy` | Helper requires production/complete/included; current purpose policy initially makes all purposes pending. |
| S03 | `application/run_lifecycle_workflow.py:prepare_start_spec,finish_run,resume_run,set_analysis_status`; `infrastructure/database/sql_repositories.py:finish,resume,set_analysis_status` | Normal close marks complete→included, otherwise pending; resume clears end/status completion but retains original start and analysis state. Lower-level APIs allow explicit dispositions. |
| S04 | `application/database_reporting.py:search,_matches,_run_row`; `application/database_primary_workflow.py:__init__`; `ui/database_reports.py:_filters,_date_value` | Desktop report service uses production/included/no superseding pointer, optional inclusive run-start UTC date filters; source report aggregates/read-all behavior is not an analytics query/performance contract. |
| S05 | `application/database_run_read_model.py:_measurement_recency_key,build_database_run_snapshot`; SQL `vw_CurrentILMeasurements` in 0006 | Python current view chooses written time/attempt/ID; SQL view orders attempt/ID within run and role/key. Neither alone is assignment-wide effective quality. |
| S06 | `domain/effective_replacement_analysis.py:_compatible_run,build_effective_replacement_projection` | Assignment/model/mode/count/criteria compatibility, exclusion of voided/superseded sources, current mapping, whole-pair recency, replacement verification, candidate coverage and source fingerprint. Purpose/completion are not technical compatibility gates. |
| S07 | `domain/coc_preparation.py:_compatibility_issues,_select_latest_records,_measurement_sort_key,_formal_failures` | Whole-pair composite selection, profile/assignment compatibility and strict COC publication requirements. COC template support is narrower than measurable model/mode combinations. |
| S08 | `domain/limit_profiles.py:LimitProfile.classify,resolve_loaded_run_profile` | Saved criteria/model/mode are authoritative; classifier fails `loss > fail_above_db`, flags too-good/review independently. |
| S09 | `domain/replacements.py:analyze_replacements`; `application/replacement_analysis_persistence.py:classify_result,PersistedReplacementAnalysis.is_current`; source SQL repository `_validate_analysis_source_snapshot` | Required/optional one-to-one recommendations, measured candidate constraints, append-only saved classifications, full-fingerprint versus legacy watermark freshness paths. |
| S10 | `ilm_app.py:_database_measurement_hardware_snapshot` (5181), resume branch (6480); `domain/timing.py:SwitchTestTimer`; `domain/measurement_timing.py:MeasurementTimingProfile` | SQL hardware snapshot stores plan/model/source/timing settings, not measured active session durations. Local switch-test session timer is a different record from authoritative SQL run timing. Desktop continuation/retest can reopen an existing run. |
| S11 | `tests/test_run_lifecycle_workflow.py`; source Git history `d0c6b21` and `9b6292d` | Helper introduced with database lifecycle foundation; report filter introduced later with purpose-separated reporting. Tracked Python call-site search finds helper use only in its tests, not runtime application paths. History does not explain/approve omission of the completion predicate. |
| S12 | `docs/DATABASE_ARCHITECTURE.md`, `DATA_ARCHITECTURE.md`, `DATABASE_ROADMAP.md`, `PROGRAM_DESIGN.md` | Documented assignment ownership, accepted-only persistence, lifecycle versus quality, technical composites and workflow intent. Descriptions supplement, rather than override, code/DDL. |

Analytics evidence: `backend/app/reporting/{models,repository,schema,config,adapter,__main__}.py` remains unchanged. Its `normal_report` matches S04, has a required ≤31-day UTC interval, limit ≤100, offset ≤1000 and no total count. It fetches metadata only, not snapshots/history needed for most metrics. Frontend evidence is `src/mock/{overview,failures,unit,queries,fixtures,contracts}.ts` and their four screens, reviewed without changes.

## Eligibility reconciliation

| Current production record | Lifecycle helper S02 | Default desktop report S04 | Owner-approved completed-result population C |
| --- | --- | --- | --- |
| complete + included + null superseding pointer | Yes | Yes | Yes |
| stopped/failed + pending | No | No | No; keep in operational activity |
| in_progress + included after a completed run is resumed | No | Yes | No |
| complete + pending | No | No | No; needs disposition review |
| stopped/failed + included via explicit disposition/lower-level API | No | Yes | No |
| complete + included + non-null superseding pointer | Yes | No | No; flag contradictory state |
| complete + superseded or excluded/voided | No | No | No |
| engineering/training/calibration + complete + included | No | No | No for C; source-compatible technical evidence allowed with provenance (D03) |

The rules began in different features/commits (S11); purpose separation is explicit, but intentionality of the completion omission is **not established**. The helper has test callers only in the reviewed tracked tree. The desktop Reports dialog reaches `DatabasePrimaryWorkflow.reporting → DatabaseReportingService.search → _matches`; the current analytics metadata repository independently reproduces the report rule. No source change is proposed here.

Normal new-run/close transitions largely align the rules: pending initially, complete becomes included, stopped/failed become pending. They do **not** make disagreement merely theoretical: desktop continuation/retest calls `resume_run`; SQL accepts reopening complete/stopped/failed, sets in-progress/end=NULL, and does not reset included. Reporting can include a reopened completed run. Lower-level `finish`/explicit `set_analysis_status`, historical records, and retained pointers after other operations can also diverge. SQL CHECKs validate each vocabulary and a non-self FK, not all lifecycle/disposition/pointer combinations. Standard supersession sets status and pointer together, but a pointer is still a useful defensive KPI exclusion. Historical prevalence and human intent remain unknown without an approved data review.

Owner-aligned categories (D01–D03/D08/D12; predicates below still require technical verification):

- **W — recorded workload:** all production run records, including zero accepted measurements, with voided/superseded categories shown separately. Do not equate physical effort with accepted output.
- **A — accepted front-panel activity:** production source run, not excluded/superseded and pointer NULL at extraction; any lifecycle/analysis inclusion state otherwise, including pending/stopped/ongoing. Require accepted logical-role pair, known positive run boundary N, logical channel `1..N`. This preserves incomplete work without calling it finished quality.
- **C — closed results:** production + complete + included + pointer NULL. Lifecycle complete can mean a complete two-channel plan; it does not imply a full unit test or a pass.
- **F — full-plan closed runs:** C plus valid immutable model/mode/N, explicit planned-channel set exactly `1..N`, a front-panel full plan (not extra-only/short retest), and accepted paired coverage of every required channel. Missing plan/coverage is unknown, not inferred from N or `complete`.
- **Q — current effective-quality stock:** evaluate each selected configuration key **K = `(assignment_id, wavelength_mode, N, criteria signature)`** against the latest valid compatible evidence and effective mapping **at extraction T** using S06/S07. K is not a unique unit and does not require a latest C completion in P. Compatible evidence may include pending/partial and non-production runs where source logic permits, with provenance. A newer valid failure can reverse an earlier pass. Do not impose end-of-P/context-end write or replacement cutoffs on this current-status KPI. Show extraction time and label **restated current configuration quality**. The selected configuration universe must be explicit: an all-current selected-configuration stock and the current quality of configurations with testing activity in P are different cohorts. For the latter, P selects cohort membership only; evidence through T still determines quality. Default cohort selection and unique-unit/multi-mode rollups remain pending; no hidden default is approved. True historical as-of quality is Deferred, not reconstructed from current mutable state.

## Shared contract conventions

P is the half-open UTC interval `[S,E)` derived from factory timezone **Z = America/Los_Angeles**; T is extraction time. Weeks run Monday–Sunday. A/C predicates use the source's **current state at T**. Historical events retain their actual timestamps; a later retest is not moved into an earlier event period. Lifecycle/analysis-state history is not fully persisted, so timestamped activity with current eligibility is restated, not guaranteed historical “as known at E” reporting. Q is current stock at T, not an event flow. Void JSON/saved analysis snapshots provide some history, not complete status/session history (D12).

Joins: runs→assignments via `assignment_id`; assignment→unit/switch by `unit_id`/`switch_id`; measurements→runs by `run_id`; replacements/spares→assignment; analyses→context run; recommendations→analysis; optional replacement→recommendation by `source_recommendation_id`. Aggregate each child grain before joins or count distinct event/measurement IDs; joining attempts × replacements × recommendations multiplies rows.

Grouping G: historical assignment, saved model from valid `limit_snapshot_json` and corroborating hardware snapshot; `wavelength_mode`; **run** `front_panel_channel_count` (24/36/48 where present, not assumed exhaustive); saved criteria. Do not use current unit count or SCPI count as historical capacity. Missing/conflicting identities go to **Unknown/Needs Review**, never mutable-current substitution. Current `SWITCHES.switch_model` is an identity lookup, not an immutable historical quality label. Station reporting is included, with nullable station bucket. Operator details require separate authorization; use event-appropriate run `tested_by` or measurement `written_by` only after approval, with no guessed person mapping, automatic employee ranking or unauthenticated identity disclosure (D11).

Saved measurement classification/source profile and timing-profile revision may distinguish procedures within the same model/mode/N. Historical snapshot precedence is approved; comparable pooling still needs technical review. A mode label alone does not certify identical acquisition procedures.

Each catalog item below specifies its question, formula/N-D, time/population, SQL evidence/keys, missing/limitations, drill-down, verification and status. Shared rules are inherited explicitly: counts are integer facts (no denominator); zero is valid only after complete query coverage. Missing evidence is null/unknown, never zero/pass. Ratios with zero denominator are null; publish numerator/denominator and unknown/excluded counts. Distinct units/channels are not additive across dates/configurations; means use sum/count, rates use pooled N/D. Display rounding follows calculation; classification rounding must follow the reconciled saved-profile rule (D04), not display convenience. Every drill-down is a future protected evidence view, not an authorized API/export.

First/latest selection follows **existing source behavior for valid records** (D15), including whole-pair compatibility/effective mapping; no competing analytics chronology is chosen. SQL/Python sort expressions differ (S05), but intended valid workflows should agree. Verify that consistency technically; do not flag ordinary valid records merely because expressions differ. Investigate demonstrably inconsistent data with provenance rather than silently overriding the source or choosing favorable losses. Before cross-run temporal attribution is implemented, verify that the required predecessor relation is supported by valid source histories.

Feasibility is independent of approval: **F1** existing scalar facts; **F2** existing history/JSON/projections plus rule/provenance review; **F3** authoritative data missing for the requested interpretation. All need future bounded query work and Stage B verification. Metric statuses below describe contract readiness: **Proposed** (owner-aligned definition still awaiting technical validation), **Needs owner decision** (remaining detail), **Deferred**, **Not supported by current data**. Owner approval is recorded separately in the dated register; no metric is certified production-ready. Sample sizes, exclusions and incomplete-result states are mandatory, including for otherwise valid incomplete records (D14). Threshold preferences do not resolve source conflicts.

## Volume catalog

### V01 — Unique units tested

Stable ID: `volume.unique_units_tested`.

- **Question / formula / N-D:** How many distinct physical products received accepted front-panel testing? Count distinct `unit_id` reached by A measurements in P; count, no denominator.
- **Time / population / keys / source:** `written_at_utc`; A; unit key across repeated runs/assignments. S01 joins above; G gives per-configuration views whose distinct counts can overlap.
- **Missing / limitations:** Missing assignment/identity/boundary is unknown/excluded. Extra-only work and zero-write runs do not qualify. Current disposition changes can restate old periods.
- **Drill / verification:** Unit→assignment→run→measurement IDs; E01, E03, E04, E13, E15. **Status: Proposed; feasibility F1.**

### V02 — Production runs started

Stable ID: `volume.production_runs_started`.

- **Question / formula / N-D:** How many production run records were created? Count distinct `run_id` in W, including voided/superseded categories; no denominator.
- **Time / population / keys / source:** `run_started_at_utc` in P; W; S01/S03; run key, group by G where known.
- **Missing / limitations:** Missing timestamp excludes with coverage count. Resume is the same run, not a new start; start metadata can precede accepted readings. This is recorded workload, not saleable-unit volume (D01).
- **Drill / verification:** Run start, disposition, accepted-row count; E01, E04–E06, E12. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F1.**

### V03 — Completed production runs

Stable ID: `volume.production_runs_completed`.

- **Question / formula / N-D:** How many currently qualifying run records are complete? Count distinct `run_id` in C with end in P; no denominator.
- **Time / population / keys / source:** `run_ended_at_utc`, C, run grain; S01/S03/S04. Does not use start-window membership for completion throughput.
- **Missing / limitations:** Null/invalid end is unknown. Complete short retests count; superseded/voided do not. Reopening removes the prior completion from this restated view; historical completion-event count is unavailable.
- **Drill / verification:** Plan, start/end, status/pointer; E01–E06, E12. **Status: Proposed; feasibility F1.**

### V04 — Currently stopped production runs

Stable ID: `volume.production_runs_stopped`.

- **Question / formula / N-D:** How many retained production runs are now stopped? Distinct W `run_id` with current `completion_status=stopped` and end in P; no denominator. Split validity categories.
- **Time / population / keys / source:** End time; W; run key; S01/S03. Pending is permitted for this workload metric.
- **Missing / limitations:** Null/invalid end is unknown. Counts current stopped records, not all stop events; resume/finish overwrites lifecycle evidence. Accepted samples remain activity.
- **Drill / verification:** Lifecycle plus retained attempts; E04, E12. **Status: Proposed; feasibility F1; historical stop-event version F3.**

### V05 — Currently failed production runs

Stable ID: `volume.production_runs_failed`.

- **Question / formula / N-D:** How many runs terminated with lifecycle failure? Distinct W `run_id` now `failed`, end in P; no denominator, validity split as V04.
- **Time / population / keys / source:** End; W; run; S01/S03. This is execution lifecycle, not a failed product/result.
- **Missing / limitations:** Missing end unknown; resume can restate history. Never derive failed-unit count or scrap from this status.
- **Drill / verification:** Failure closure and accepted samples; E04 variant `failed`, E12. **Status: Proposed; feasibility F1.**

### V06 — Distinct logical channels with activity

Stable ID: `volume.unique_logical_channels_tested`.

- **Question / formula / N-D:** How many distinct logical channels per unit received testing? Count distinct `(unit_id,logical_channel)` with A writes in P; no denominator. This is the primary channel KPI (D02).
- **Time / population / keys / source:** Measurement write time; A; historical assignment→unit join, S01/S05. Repeated attempts/runs/modes/assignments for the same unit and logical position do not increase this period's unique coverage. V12 preserves assignment/mode diagnostics.
- **Missing / limitations:** Missing N/role is unknown. Physical ports and wavelengths do not multiply channels. One channel tested on two days counts in each day but once in the combined period; call this activity coverage, not finished capacity (D02).
- **Drill / verification:** Unit/channel and contributing assignments/modes/attempts; E01, E07, E13/E18. **Status: Proposed; feasibility F1; D02 intent approved, joins/coverage unverified.**

### V07 — Accepted front-panel measurement attempts

Stable ID: `volume.accepted_logical_attempts`.

- **Question / formula / N-D:** How many persisted measurement actions were accepted? Count distinct `measurement_id` in A/P; no denominator. A paired two-wavelength row is one attempt.
- **Time / population / keys / source:** `written_at_utc`; A; measurement ID/unique UUID for retry diagnostics; S01/S05. Keep all accepted attempts, not only current views.
- **Missing / limitations:** Missing IDs/invalid roles excluded with diagnostics. Temporary/rejected/unwritten readings are absent, so this is not hardware request count. Superseded attempts within a valid run still count as activity.
- **Drill / verification:** Run/channel/attempt/paired wavelengths; E01, E07. **Status: Proposed; feasibility F1.**

### V08 — Run-channels retested

Stable ID: `volume.retested_run_channels`.

- **Question / formula / N-D:** Which run-channels received another accepted attempt? Count distinct `(run_id,logical_channel)` with an A attempt in P preceded by an accepted attempt in that same run/channel; no denominator.
- **Time / population / keys / source:** Later attempt write time; A; S01/S05 history with predecessor relations verified against existing source behavior (D15). Predecessor may predate P.
- **Missing / limitations:** Need actual prior evidence, not just `attempt_number>1`. Same channel in a new run is not a within-run retest; V13 labels cross-run remeasurement separately. Repeated later attempts count one run-channel.
- **Drill / verification:** First/later measurement IDs; E01, E07, E15. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### V09 — Retest-attempt share

Stable ID: `volume.retest_attempt_share`.

- **Question / formula / N-D:** What share of accepted workload is repeat attempts? N = A attempts in P with prior same-run/channel evidence; D = V07; ratio N/D, not V08/V06.
- **Time / population / keys / source:** Later write time; A; measurement ID for N/D, prior lookup as V08; S01/S05 and source report's per-run attempt grouping S04.
- **Missing / limitations:** Missing predecessor history makes coverage uncertain; zero D→null. Across-run repetitions are not included in N. Do not label as percentage of channels retested.
- **Drill / verification:** N/D attempt lists; E07 gives 2/3, not 1/3. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### V10 — Retested run-channel share

Stable ID: `volume.retested_run_channel_share`.

- **Question / formula / N-D:** What fraction of active run-channels were retested? N = V08; D = distinct `(run_id,logical_channel)` with A activity in P. This D differs from V06's unit/channel grain.
- **Time / population / keys / source:** Write-time P; A; run/channel keys; S01/S05. A prior attempt before P is allowed if a repeat occurs within P.
- **Missing / limitations:** Zero D→null; prior-history gaps unknown. Rates across groups require pooling N/D, not averaging displayed rates. Same unit/channel may appear in several run keys.
- **Drill / verification:** Numerator/denominator run-channels and predecessors; E01, E07, E15. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### V11 — Accepted extra-candidate attempts

Stable ID: `volume.accepted_extra_attempts`.

- **Question / formula / N-D:** How much recorded supplemental candidate testing occurred? Distinct measurement IDs with `measurement_role=extra_candidate`, physical port above a known positive run N, and A's parent-run validity/purpose, in P; no denominator.
- **Time / population / keys / source:** Written time; role-specific population (not A's logical-role predicate); S01/0006; measurement ID, group by assignment/physical port or G.
- **Missing / limitations:** Logical channel is NULL by design. Missing boundary/candidate context is unknown; unaccepted probing is not represented. Never add to V06 or treat as finished front-panel coverage.
- **Drill / verification:** Role, port, parent run, boundary; E14. **Status: Proposed; feasibility F1.**

### V12 — Assignment/mode/logical-channel activity coverage

Stable ID: `volume.assignment_mode_channel_coverage`.

- **Question / formula / N-D:** Which distinct technical coverage keys received accepted testing? Count distinct `(assignment_id,wavelength_mode,logical_channel)` with A writes in P; no denominator. Companion diagnostic, not the primary V06 channel total.
- **Time / population / keys / source:** Written time; A; S01/S05, historical assignment and saved mode. Repeated runs within a key count once.
- **Missing / limitations:** Unknown identity/boundary excluded with reason. Keys can overlap one unit/channel; never add this count to V06 or sum daily distincts for a period total.
- **Drill / verification:** Contributing runs/pairs per key; E13/E18. **Status: Proposed; feasibility F1; D02 aligned, technical validation pending.**

### V13 — Cross-run remeasurement observations

Stable ID: `volume.cross_run_remeasurements`.

- **Question / formula / N-D:** Which run-channels repeat prior testing in another run? Count distinct `(run_id,logical_channel)` with A activity in P and proven earlier A evidence in a different run for the same `(assignment_id,wavelength_mode,logical_channel)`; no denominator. Additional attempts in that run do not increase this count.
- **Time / population / keys / source:** First qualifying write in P for that run-channel; S01/S05 and D15 source-history consistency verification. Earlier evidence may be outside P; retain both IDs/times.
- **Missing / limitations:** This proposed diagnostic grain keeps technical assignment/mode context; it is not unit-level unique coverage or an extra-attempt count. Unknown predecessor/overlapping ambiguous histories→unknown. Do not invent a source effective-order algorithm. May overlap V08 if that run also contains within-run repeats; do not add them as disjoint attempts.
- **Drill / verification:** Earlier-run/current-run pairs with matching context; E01/E18. **Status: Proposed; feasibility F2; D02 approves separate scope, exact attribution needs verification.**

## Duration catalog

The original proposed comparison cohort is **OSX-150 / SM / 48 front-panel channels**, not reported SCPI routing count; it is not an approved default filter. Preserve model/mode/saved N cohorts; do not assume every combination exists. Station reporting is included; operator details still require authorization. Complete-short and composite tests are not full standalone timings.

SQL start/end measure persisted run-record wall-clock elapsed time. S10's snapshot has `timing_profile` **settings**, not measured durations. SQL repositories persist no `switch_test_sessions`/accumulated active duration; the local `SwitchTestTimer` measures session elapsed, not pure hardware busy time, and is not a SQL analytics source. Resume keeps original start, clears end, then later finish supplies a new end. Thus start→final end can include pauses, closure gaps, continuations and retests. Inter-write gaps cannot separate operator idle from hardware settling/processing. Station/operator recorded at run creation may not identify who performed every later continuation.

Elapsed arithmetic retains source timestamp millisecond resolution, converted to seconds. **Primary duration is running-state time excluding stopped intervals (D06/D14), not hardware acquisition-only time.** T09 requires missing authoritative intervals; no historical active values may be fabricated. T10 is explicitly labeled wall-clock fallback; T11 combines sources only with counts/warnings; T12 aggregates relevant runs per unit. T01–T04 remain the narrower full-plan elapsed statistics, not the primary active KPI. Apply metric-specific eligibility: an incomplete/stopped run with valid evidence can contribute to the appropriate timing series without qualifying for F. No default filter is inferred from the old full-plan proposal.

For every observed run or per-unit duration, flag **strictly >5400 seconds (90 minutes)**. Future UI must allow threshold configuration and flagged include/exclude control, preserve source records, and show n/exclusions. Neither the default toggle state nor a P90 algorithm/minimum-sample policy is approved (D07). Flagging applies to the selected duration definition, whose basis must be visible; it is not evidence of idle time or an administrative error.

### T01 — Mean completed full-plan run elapsed seconds

Stable ID: `duration.mean_full_plan_run_elapsed_seconds`.

- **Question / formula / N-D:** How long do recorded full-plan runs remain open? N = sum `(end-start)` in seconds; D = valid F run count, including passing and failing results. A secondary elapsed statistic, never active time or an approved default duration.
- **Time / population / keys / source:** End in P; F, matching saved model/mode/N; run key; S01/S03/S10 and plan/coverage JSON/history. Include resume gaps with explicit warning; absence of resume evidence cannot prove uninterrupted execution.
- **Missing / limitations:** Exclude null end, ongoing/non-C, nonpositive duration, unknown/conflicting config/plan/coverage, short/extra-only/composite cases from this F-only sample; valid incomplete observations may still qualify for T09/T10. Flag >5400 seconds; include/exclude default remains pending (D07). Show exclusions/n; per-unit weighting is different (T12).
- **Drill / verification:** Start/end, delta, plan, N, coverage and flags, no invented active time; E01–E04, E12, E16. **Status: Proposed; feasibility F2; elapsed scope aligned, filter details/technical verification pending.**

### T02 — Median completed full-plan elapsed seconds

Stable ID: `duration.median_full_plan_run_elapsed_seconds`.

- **Question / formula / N-D:** What is the typical elapsed observation? Median of T01's exact eligible per-run durations; for even n average the middle two. No ratio; n is sample count.
- **Time / population / keys / source:** Same end-time/F/G/run sample as T01; S01/S03/S10.
- **Missing / limitations:** Inherit T01 exclusions/gap caveat; no samples→null. Do not compute median of group medians. Small-sample display policy remains pending D07; no default suppression is approved.
- **Drill / verification:** Ordered duration sample and excluded counts; E01→930 seconds for [900,960]. **Status: Proposed; feasibility F2.**

### T03 — P90 completed full-plan elapsed seconds

Stable ID: `duration.p90_full_plan_run_elapsed_seconds`.

- **Question / formula / N-D:** How slow are the upper-tail observations? P90 of T01's eligible durations; no ratio. **Algorithm remains pending**: nearest-rank and interpolation are alternatives, neither approved. Histogram bins must count the same sample.
- **Time / population / keys / source:** Same sample/time/run grain as T01; S01/S03/S10.
- **Missing / limitations:** Empty→null; n and quantile convention visible. Do not average subgroup P90s or fit a synthetic normal curve as observed data. Method/minimum sample remain pending under D07.
- **Drill / verification:** Ordered sample/bin edges; E01's [900,960] does not have an approved P90 until the convention is selected. **Status: Needs owner decision; feasibility F2.**

### T04 — Elapsed seconds per front-panel channel

Stable ID: `duration.elapsed_seconds_per_front_panel_channel`.

- **Question / formula / N-D:** What normalized elapsed rate accompanies full plans? N = T01 duration sum; D = sum saved N over the same F runs; use ratio of sums. For a fixed 48-channel cohort this equals mean elapsed/48.
- **Time / population / keys / source:** End-time/F/run grain as T01, group G; S01/S10.
- **Missing / limitations:** Inherit exclusions; zero D→null. Includes run overhead/gaps and is not per-channel hardware cycle time. Cross-configuration weighting differs from an unweighted mean of per-run ratios.
- **Drill / verification:** Duration/N sample; E02→900/48=18.75 seconds. **Status: Proposed; feasibility F2.**

### T05 — Mean active hardware measurement seconds

Stable ID: `duration.mean_active_measurement_seconds`.

- **Question / formula / N-D:** How long was hardware actively acquiring IL? Desired N = measured acquisition-interval sums; D = approved completed full-test observations.
- **Time / population / keys / source:** Would require UTC session/acquisition events linked to run/attempt and F/cohort; S01/S10 establish that authoritative SQL intervals are absent.
- **Missing / limitations:** Null/unavailable for current SQL. Configured settling/sample timings and timestamp differences do not measure busy time. This ID retains acquisition-only meaning; it must not be repurposed as running-state duration (T09). Instrumentation/schema changes need separate authorization.
- **Drill / verification:** Future interval provenance, including overlap handling; E12/E16 must never yield fabricated active seconds. **Status: Not supported by current data; feasibility F3.**

### T06 — Operator interruption seconds

Stable ID: `duration.operator_interruption_seconds`.

- **Question / formula / N-D:** How much time was attributable to operator interruption? Desired sum of explicitly reason-coded interruption intervals; no denominator (mean would need an approved run/session D).
- **Time / population / keys / source:** Interval events by run/session/operator; S01/S03/S10 provide start/final end only, with no authoritative interruption ledger.
- **Missing / limitations:** Unavailable, not `elapsed - theoretical cycle time`, nor all inter-write gaps. No attribution of hardware waits or a resumed run's gap to an operator.
- **Drill / verification:** Future interruption event IDs/reasons; E12. **Status: Not supported by current data; feasibility F3.**

### T07 — Mean uninterrupted standalone full-test seconds

Stable ID: `duration.mean_uninterrupted_full_test_seconds`.

- **Question / formula / N-D:** How long does one uninterrupted full test take? Desired total first-session full-test durations / qualifying standalone full tests.
- **Time / population / keys / source:** First-session completion, F plus proven never-resumed/never-retested observation; S03/S10 show mutable ends and missing SQL session provenance.
- **Missing / limitations:** Plan=48 and complete are insufficient proof. Excluding only obvious long durations cannot establish an uninterrupted cohort. T01 is an explicitly different proposed elapsed proxy.
- **Drill / verification:** Future session/first-completion evidence; E03, E12. **Status: Not supported by current data; feasibility F3.**

### T08 — Mean unit workflow duration including retests

Stable ID: `duration.mean_unit_workflow_seconds`.

- **Question / formula / N-D:** How long from initial testing to an agreed final testing milestone? Desired summed workflow elapsed / unique completed workflow/session IDs; distinguish from an equal-weight mean of each unit's run means.
- **Time / population / keys / source:** Workflow completion and stable workflow ID→unit/assignments/runs; S01 has no authoritative manufacturing-session/final-release boundary.
- **Missing / limitations:** `max(end)-min(start)` across all unit history can span switch replacements/days and is not an approved session. No reliable current value; authoritative workflow identity/endpoint remains future scope under D14. This deferred workflow metric is distinct from T12's sums of testing runs.
- **Drill / verification:** Future session and constituent run timeline; E01, E12/E13. **Status: Deferred; feasibility F3 for the requested workflow.**

### T09 — Mean run-active seconds

Stable ID: `duration.mean_run_active_seconds`.

- **Question / formula / N-D:** How much running-state time did runs consume? For each eligible run r, `active(r) = sum(valid running intervals excluding stopped intervals)`; N = sum active(r), D = runs with complete, verified interval coverage for their observed history. Primary duration intent (D06/D14).
- **Time / population / keys / source:** Proposed period cohort: A-parent-valid production runs with observed end in P; lifecycle completion not required. For an explicitly labeled ongoing cohort, anchor at fixed T and close the current interval at T only with authoritative running-state evidence. Run ID; S01/S03/S10 identify missing session intervals. Period attribution/ongoing presentation need review; no default approved.
- **Missing / limitations:** Currently unavailable in authoritative SQL (F3). Partial interval sums are known subtotals, not complete run active duration; exclude from the complete-active mean and show counts/reasons. No interval double-counting; verify coverage, nonnegative intervals and lifecycle consistency. Running can include settling/processing; not T05 hardware-only. Never subtract guessed pauses from elapsed.
- **Drill / verification:** Interval IDs/bounds, stopped gaps, run totals and n/exclusions; E12/E19/E22. **Status: Not supported by current data; feasibility F3; owner intent approved, instrumentation unresolved.**

### T10 — Mean eligible run wall-clock elapsed seconds

Stable ID: `duration.mean_run_elapsed_seconds`.

- **Question / formula / N-D:** What wall-clock span is available for the selected run cohort? N = sum valid `observed_end - original_start`; D = eligible runs with valid bounds. Includes stopped gaps and resumed closures; label wall-clock elapsed explicitly.
- **Time / population / keys / source:** Same explicit cohort/anchor as T09/T11, but valid start/end are sufficient timing evidence: A-parent-valid production runs with terminal observed end in P, including stopped/failed or short tests. Ongoing age to fixed T is a separate labeled selection, not substituted silently. Run ID; S01/S03/S10. F is not required.
- **Missing / limitations:** Missing/invalid/nonpositive bounds excluded with n; missing historical config remains Unknown/Needs Review rather than substituted hardware. Do not silently apply F-only exclusions to general elapsed. Incomplete testing does not disqualify an otherwise valid bounded elapsed observation. No claim of active, uninterrupted or manufacturing workflow time.
- **Drill / verification:** Original start, observed end/anchor, lifecycle, flags and exclusions; E03/E04/E12/E19. **Status: Proposed; feasibility F1 for timestamps, F2 for cohort verification; D06/D14 aligned, cohort details pending.**

### T11 — Combined run duration average with source counts

Stable ID: `duration.mean_combined_run_seconds`.

- **Question / formula / N-D:** What duration can be reported with transparent fallback? For each run in the same explicit T09/T10 cohort, choose valid complete active(r), else valid elapsed(r), else missing. N = sum chosen durations; D = chosen run count. Publish active-only T09 and elapsed-only T10 averages separately, not as equivalent quantities.
- **Time / population / keys / source:** Same period/cohort/run key as T09/T10; S01/S03/S10. One source per run; active preferred even if elapsed also exists. Retain n_active, n_elapsed_fallback, n_missing and source labels.
- **Missing / limitations:** Clearly label **combined active/elapsed** with warning about mixed meanings. Currently no verified SQL active intervals: any available series would be entirely elapsed fallback, never claimed measured active. Flag/filter chosen durations with disclosed threshold and source-specific sample counts; default toggle unapproved. Do not average group means without weights.
- **Drill / verification:** Selected value/basis and unselected available bounds per run; E19/E22. **Status: Proposed; feasibility F2 for fallback, F3 for accurate active component; technical/cohort validation pending.**

### T12 — Per-unit testing totals and averages by duration basis

Stable ID: `duration.unit_testing_totals`.

- **Question / formula / N-D:** How much testing time belongs to each unit? Over the explicitly selected relevant T09/T10 run cohort, sum once per run separately as `unit_active`, `unit_elapsed`, `unit_combined`. Each total uses only its named basis; an active total is complete only when every relevant run has valid complete active coverage. Companion unit-weighted mean for each basis = sum complete unit totals / count units with complete totals for that basis. These are three labeled fields, not one interchangeable scalar.
- **Time / population / keys / source:** Cohort/clock inherited from T09–T11; historical assignment→unit S01, S03/S10. A run that overlaps P is not automatically clipped or allocated by write times. Proposed cohort-selected whole-run totals must be labeled; time-in-period clipping would be a different contract requiring interval evidence/review.
- **Missing / limitations:** Publish relevant-run count, missing counts, completeness and combined source counts per unit and overall. If one run lacks active data, known active subtotals can be shown as incomplete, never as the full total or included in complete-active unit means. Valid incomplete/stopped runs contribute when evidence for the chosen basis is valid. Sum testing durations, not `last end - first start`, T08 workflow or unique hardware busy time; concurrent runs can sum beyond wall-clock span.
- **Drill / verification:** Unit→historical assignments→constituent run values/bases, n/exclusions; E01/E12/E19. **Status: Proposed; feasibility F2 for elapsed/combined totals, F3 for complete active totals; explicit cohort selection remains pending.**

## Replacement catalog

Replacement event history X uses `replaced_at_utc` in P and historical assignment→unit. It includes valid recorded events even when a related run later becomes voided/superseded or `related_run_id` is NULL; show attribution/validity separately (D09). All valid events count regardless of recommendation linkage. Genuine reversals count as events. Exclude administrative errors **only when authoritative verification permits**, retaining the original record and exclusion evidence/count; notes or reversed mapping alone are insufficient. The reviewed schema has no established authoritative administrative-error classification; default factual counting cannot guess exclusions. These are replacement records, not independently verified physical operations. Production-attributed versus unclassified/other-purpose event categories must be explicit: only verified production-attributed events belong in a production workload subtotal (D03), while total X includes separately labeled unattributed history. Do not drop X solely because its related run fails C/A or silently inherit desktop report filtering. Model/mode attribution requires immutable context. No hardware operation is inferred.

### R01 — Recorded replacement events

Stable ID: `replacement.recorded_events`.

- **Question / formula / N-D:** How many valid replacement records document workload? Distinct `replacement_id` in X; no denominator. Primary replacement KPI; show total recorded, verified administrative exclusions and counted events separately.
- **Time / population / keys / source:** Event time, X, replacement ID; S01/S06. Repeated replacements of one channel remain separate events.
- **Missing / limitations:** Missing related run/link must not drop the event; missing event time is unknown. Saved recommendations are not events. Genuine return to the initial port still counts; no administrative-error exclusion without authoritative evidence. Production attribution remains explicit, not inferred from missing linkage.
- **Drill / verification:** Assignment, logical/old/new ports, event ID, optional recommendation and later verification; E08/E09. **Status: Proposed; feasibility F1.**

### R02 — Distinct logical channels replaced

Stable ID: `replacement.unique_logical_channels`.

- **Question / formula / N-D:** How many distinct assignment-scoped channels have recorded replacement activity? Count distinct `(assignment_id,logical_channel)` in X; no denominator.
- **Time / population / keys / source:** Replacement event P, X, assignment/channel; S01. Mode does not duplicate one shared physical replacement event.
- **Missing / limitations:** Two replacements count one channel; two assignments are two channels even for one unit. Not equivalent to current `is_replaced`, nor number of destination ports.
- **Drill / verification:** All events per key plus effective map; E08, E13. **Status: Proposed; feasibility F1.**

### R03 — Replacement events per tested unit

Stable ID: `replacement.events_per_tested_unit`.

- **Question / formula / N-D:** How much recorded replacement activity accompanies the tested cohort? D = V01's distinct units; N = X events in P for assignments belonging to those units. Report event count/unit count with ratio.
- **Time / population / keys / source:** Measurement time selects D; event time selects N; S01 joins. Denominator unit key, numerator event key; never divide failed-reading count by failing-unit count.
- **Missing / limitations:** Zero D→null. Excludes replacement-only units outside the tested cohort from N; not necessarily equal to all R01/V01. Match all identity/configuration filters to numerator and denominator; unclassifiable event context is shown separately. This is period activity, not lifetime replacements per manufactured unit (D09).
- **Drill / verification:** Tested unit cohort and linked events; E08 with one tested unit→2. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### R04 — Replacement events per unit with a replacement record

Stable ID: `replacement.events_per_replaced_unit`.

- **Question / formula / N-D:** How much repeat replacement work occurred among affected units? N = R01's events with valid historical assignment→unit linkage; D = distinct unit IDs reached by those same events, including replacement-only units. With complete identity coverage N equals R01; otherwise report unmatched events separately and mark coverage incomplete.
- **Time / population / keys / source:** Event-time P; X; events and unit grain; S01.
- **Missing / limitations:** Zero D→null. “Requiring replacement” is not equivalent to recorded replacement activity. Use events per unit with replacement activity; numerator and denominator use exactly the same X filters/validity and historical identity joins. Show unattributable events separately, not divided by known units as if matched.
- **Drill / verification:** Event histories and distinct units; E08→2/1, versus R02=1. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F1.**

### R05 — Confirmed-extra-port deployment fraction

Stable ID: `replacement.confirmed_extra_port_deployment_fraction`.

- **Question / formula / N-D:** What fraction of confirmed suitable extra candidates is deployed? At T, D = distinct confirmed suitable extra-candidate ports **including already deployed**; N = those same ports in the effective current front-panel map. Key `(assignment_id,physical_port)` within an explicitly selected compatible mode/criteria context. Deduplicate shared ports within that context.
- **Time / population / keys / source:** Current-at-T stock, not P event flow; same selected K/context for N/D; S01 extra/map views plus S06 eligibility/history. Do not pool incompatible qualifications or sum duplicate assignment ports across modes as physical capacity.
- **Missing / limitations:** Incomplete candidate-query/qualification coverage→unknown, zero known D→null. Confirm suitability/compatibility at T; designation alone is not proof. This is not total installed capacity. Distinguish known insufficient verified candidates, unknown availability and a proven lack of options under a complete evidenced allocation; none establishes final scrap (D10).
- **Drill / verification:** Measured role/port, criteria, current mapping, spare designation events; E08, E14. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2; total-physical-capacity utilization F3.**

### R06 — Saved recommendation linkage share

Stable ID: `replacement.saved_recommendation_usage_share`.

- **Question / formula / N-D:** Which saved recommendations have a recorded usage link? D = distinct recommendation IDs from analyses saved in P; N = those IDs referenced by a replacement by T. Split required/optional and analysis validity.
- **Time / population / keys / source:** Analysis `analyzed_at_utc` cohort, replacement linkage through T; S01/0004 `vw_ReplacementRecommendationUsage`, S09; recommendation ID, not analysis count or port.
- **Missing / limitations:** This ID retains the **all saved historical recommendation cohort**, not latest-only current guidance. Missing link is unknown usage, not operator noncompliance. Repeated analyses repeat opportunities; split validity/freshness and required/optional. Zero D→null. Current actionable recommendations are R07, not this historical share.
- **Drill / verification:** Analysis→recommendation→event IDs and time-to-link; E08/E10 plus repeat-snapshot verification. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### R07 — Current applicable recommendation inventory

Stable ID: `replacement.current_actionable_recommendations`.

- **Question / formula / N-D:** Which current recommendations are actionable? For each selected K at T, resolve the latest applicable analysis under S06/S09; count distinct recommendation IDs only when fully compatible and non-stale, split required/optional. No denominator. Also report configuration states and counts separately.
- **Time / population / keys / source:** Current-at-T stock; K plus analysis/recommendation IDs and full fingerprint; S01/S06/S09. Not the analyses saved in P cohort. A stale latest applicable analysis must show **Needs Reanalysis**, not silently fall back to an older favorable snapshot.
- **Missing / limitations:** Unknown fingerprint/compatibility→Unknown/Needs Review; missing analysis→not analyzed, not zero available options. Stale evidence is not current guidance and cannot prove noncompliance. Fresh required recommendations may still be partial; Q06 separately requires complete coverage. Non-actionable records remain visible as history.
- **Drill / verification:** Saved inputs versus effective state at T, source IDs and latest applicable selection; E10/E20. **Status: Proposed; feasibility F2; D09 aligned, applicability/freshness verification pending.**

## Quality catalog

Primary quality counts **configuration keys K**, not final unique-unit disposition (D08). One unit in two modes or assignments may contribute two K values; a unique-unit/required-mode rollup is not approved. Q04–Q06/Q08 are current-at-T stock; Q01/Q02/Q09 are historical testing flows and Q07 is saved analysis history. Full coverage, known criteria/wavelength profile, source compatibility and current effective physical mapping are necessary for a positive whole-map assessment; compatible composite evidence is allowed. Unknown/missing coverage, too-good/review and unsupported profile states remain visible rather than becoming pass/fail zeroes. Newer valid failures can reverse prior passing composite results. Under S06, `recommendations_available` may contain only optional or some required recommendations; it does not prove full recovery.

**Threshold conflict remains technical:** S08 fails strictly `>`; S07 `_formal_failures` rounds to four decimals and fails `>=`. At exactly 2.5000 dB with a 2.5 saved limit, classification differs. Owner preference is **rounded COC-style `>=` against saved profile limits** (D04, November 6); implementation/reconciliation is pending. Do not modify source rules, claim agreement, apply global 2.5 dB to other saved profiles or merge criteria revisions. Boundary-dependent failure/pass/candidate results remain unverified/blocked. COC support/export eligibility (including unsupported OSX-150 MM templates) must not become a product failure flag.

### Q01 — Logical channels with a failing accepted attempt

Stable ID: `quality.channels_with_failing_attempt`.

- **Question / formula / N-D:** Which front-panel channels exhibited formal failure evidence? Distinct `(assignment_id,mode,logical_channel)` among A attempts in P failing at either wavelength under that run's saved, approved criteria; no denominator.
- **Time / population / keys / source:** Written time; A; S01/S08 and D04 comparator. One failing pair/channel is not two failed channels or a failed unit.
- **Missing / limitations:** Missing criteria/boundary unknown, later passing attempts do not erase historical failure activity. Not current failure count or first-pass yield.
- **Drill / verification:** Failed pair, both wavelengths, saved limits and subsequent history; E07, E11. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### Q02 — First-observation run-channel failure fraction

Stable ID: `quality.first_observation_run_channel_failure_fraction`.

- **Question / formula / N-D:** What share of first recorded channel observations fail? D = first accepted logical pair per `(run_id,logical_channel)` whose first-write time is in P and parent satisfies A; N = those pairs failing either saved-limit comparison.
- **Time / population / keys / source:** First-ever write for the run/channel, then period filter; S01/S05/S08, D04. Prior-history lookup required; do not select first row only inside P.
- **Missing / limitations:** Exclude/identify unknown criteria/history; zero D→null. A new retest run has its own first observation, so this is explicitly not first-pass unit yield. Heatmaps can split N/D by logical position and G.
- **Drill / verification:** First measurement ID and criteria; E01, E07, E11/E15. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### Q03 — First-pass unit yield

Stable ID: `quality.first_pass_unit_yield`.

- **Question / formula / N-D:** What share pass the first full manufacturing test without retest/replacement? Desired D = unique unit/workflow first-full-test cohort; N = those first full evaluations passing every required channel/mode before any corrective action.
- **Time / population / keys / source:** Desired first-full-test completion, unit/workflow/mode policy; S01/S03/S10 lack immutable first-completion/session boundaries. Earliest accepted full-map observations could be a separately labeled proxy, not a proven first-test event.
- **Missing / limitations:** Distinct unit counts, completed runs, or “no replacement” alone cannot establish first pass. Resumed runs and prior partial tests complicate firstness; multi-mode requirements unknown (D08/D14).
- **Drill / verification:** Earliest evidence, full plan/coverage, prior actions, required modes; E01/E03/E07/E12. **Status: Deferred (D08); feasibility F3 for strict workflow yield. No first-pass proxy is approved.**

### Q04 — Evaluations passing without recorded replacement

Stable ID: `quality.evaluations_passing_without_replacement`.

- **Question / formula / N-D:** Which configurations currently pass without recorded replacement in their assignment history? Count selected Q keys K with full effective front-panel pass and no valid replacement event through T; no denominator. A fraction would require an explicit assessable-Q denominator, not all starts.
- **Time / population / keys / source:** Current stock at extraction T; S01/S06–S08. Zero-replacement history is assignment-scoped, not just events in P. Compatible composites allowed, including source-permitted other purposes with provenance; no completion-in-P/write cutoff.
- **Missing / limitations:** Unknown history/criteria/mapping→unknown. This is not first-pass yield: retests without replacement can produce a pass. Manufacturing release and unit/multi-mode rollup are not inferred.
- **Drill / verification:** Effective whole-pair provenance and action history; E01, E07, E13. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### Q05 — Evaluations passing after recorded replacement

Stable ID: `quality.evaluations_passing_after_replacement`.

- **Question / formula / N-D:** Which configurations currently have verified corrective recovery? Count selected Q keys K with documented prior formal failure, a valid corrective replacement after that failure, compatible later passing evidence on the effective port, and complete current configuration pass; no denominator. Optional optimization swaps alone do not qualify.
- **Time / population / keys / source:** Current stock at T, no P end cutoff; S01/S06–S09. Retain failure→event→verification IDs/times and current map per channel. Verify relevant current-map replacements; old verified swaps cannot validate a later unverified reversal. Count K once, not events.
- **Missing / limitations:** Missing prior failure/corrective provenance, awaiting retest, newer fail/review or incomplete coverage→unknown/not verified recovery as appropriate, never success. A pass before replacement is insufficient. A configuration passing after optional work may belong to neither Q04 nor Q05; these are not an exhaustive partition. No claim of manufacturing release or proven causal improvement beyond documented sequence.
- **Drill / verification:** Before/after pair, event timestamp, physical port, remaining channels; E08/E09. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### Q06 — Evaluations with a fully covered recovery proposal

Stable ID: `quality.evaluations_with_recovery_proposal`.

- **Question / formula / N-D:** Which currently failing configurations have an evidenced proposed path to passing? Count selected Q keys at T with known formal failures and a current compatible analysis whose source state matches effective evidence/map at T and whose distinct required candidate allocation covers every failing channel under reconciled saved criteria; no denominator.
- **Time / population / keys / source:** Current stock at T; S06/S09, analysis/recommendation/measurement provenance; K. Require R07 freshness and actual required-channel coverage, not merely `recommendations_available`; no historical cutoff.
- **Missing / limitations:** Stale latest applicable analysis→Needs Reanalysis. Legacy-watermark-only/unknown freshness or partial coverage→unknown/not fully covered. Optional optimization on an already passing configuration is not recovery. This is a proposal, not completed or guaranteed work.
- **Drill / verification:** Failed channels→distinct candidate ports, minimum improvement, fingerprint; E09 before work, E10/E14. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### Q07 — Saved no-viable-recovery analyses

Stable ID: `quality.saved_no_viable_recovery_analyses`.

- **Question / formula / N-D:** How many saved historical calculations reported this result? Distinct `analysis_id` where `result_status=fail_no_viable_recovery`, saved in P; no denominator. Show known current/stale/unknown separately.
- **Time / population / keys / source:** `analyzed_at_utc`; production-linked contexts, including retained later-void/superseded history with explicit categories; S01/0004–0005/S09; analysis ID.
- **Missing / limitations:** Repeat analyses are repeat records, not unique rejected units. Do not equate legacy `no_viable_recommendations` or `not_applicable_no_extra_ports` with formal failure. Full source fingerprint comparison is preferred; scalar watermark fallback cannot prove assignment-wide currentness.
- **Drill / verification:** Saved inputs/criteria, source IDs and later changes; E10. **Status: Proposed; feasibility F2.**

### Q08 — Evaluations lacking complete measured-candidate coverage

Stable ID: `quality.evaluations_with_insufficient_recorded_candidates`.

- **Question / formula / N-D:** Does the known candidate set fail to cover all required failing channels? Count Q keys with known full failing inputs and approved allocation evaluation that cannot supply distinct suitable measured candidates for every required failure; no denominator.
- **Time / population / keys / source:** Current stock at T; K; S06/S09 paired candidate/criteria/history evidence and current map. Simple candidate count can be a necessary bound, not a sufficient matching test.
- **Missing / limitations:** Distinguish insufficient confirmed suitable candidates under a completely evaluated recorded set, unknown wider availability, and proven lack of recovery options under complete evidenced constraints. Unmeasured/review/missing candidate evidence does not prove physical exhaustion. Stale allocation→Needs Reanalysis. No scalar authoritative “ran out of physical ports” reason exists; neither zero recommendations nor this count is total physical capacity or final scrap (D10).
- **Drill / verification:** Failure/candidate eligibility matrix, already-used ports, required/optional distinction; E14. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2 for recorded coverage, F3 for total physical-spare insufficiency.**

### Q09 — Accepted retest transition matrix

Stable ID: `quality.accepted_retest_transitions`.

- **Question / formula / N-D:** Do accepted retests improve or worsen observed quality? Count adjacent accepted pairs within a run/logical channel, classified fail→pass, pass→fail, fail→fail, pass→pass, with review/unknown separate. Optional row fractions use all assessable transitions from the same prior state as D.
- **Time / population / keys / source:** Later attempt write in P; A, same criteria; `(run_id,logical_channel,previous_measurement_id,current_measurement_id)`; S01/S05/S08. Physical-port-changing transitions are labeled replacement-associated, not compared as unchanged-port performance.
- **Missing / limitations:** Missing predecessor/criteria unknown; prior outside P needed. Follow source behavior/consistency verification under D15, not a new sort algorithm. Across-run activity is V13, not silently added to this within-run transition matrix. Repeated transitions are not independent unit outcomes or proof of operator causality.
- **Drill / verification:** Both pairs, port/criteria and event links; E07, E09, E11. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### Q10 — Final rejected or scrapped units

Stable ID: `quality.final_rejected_units`.

- **Question / formula / N-D:** Which products received an authoritative final manufacturing rejection? Desired distinct unit/workflow IDs with an approved final-disposition event in P; no denominator until a disposition cohort is defined.
- **Time / population / keys / source:** Would require disposition event/time/authority and stable unit/workflow linkage. S01 has no authoritative manufacturing release/reject/scrap ledger.
- **Missing / limitations:** Unavailable. Failed samples, failed lifecycle, voiding, stale/current no-recovery analyses and “no extras” do not establish disposition. Never populate this from the mock `bad` bucket.
- **Drill / verification:** Future disposition evidence; E04/E06/E10 must not increment it. **Status: Not supported by current data; feasibility F3.**

## Date, comparison and query-work contract

**Approved intent (D05/D13): America/Los_Angeles**, Monday–Sunday weeks, local calendar dates, initial ranges up to **366 calendar days**, daily/weekly/monthly/**yearly**/custom reporting. This explicit owner selection, not the workstation timezone, determines reporting boundaries. Resolve local boundaries to UTC `[S,E)` using timezone rules; 366 calendar dates need not equal 366×24 UTC hours. Yearly reports must handle leap years. Default preset, partial-period behavior, comparison periods and default cohort/filter selections are **still pending**; the following retained preset sketches are proposals only:

| Preset | Local-calendar definition, converted once to UTC [S,E) |
| --- | --- |
| Last 30 complete days (not approved as default) | From local midnight 30 dates before today through today's midnight; exclude the partial current day and label explicitly |
| Today | Local today's midnight through fixed extraction T; mark partial |
| Yesterday | Previous local midnight through today's midnight |
| This week | Monday local midnight through T; mark partial |
| This month | Local first-of-month midnight through T; mark partial |
| Last month | Previous month's first midnight through current month's first midnight |
| Custom dates | Inclusive first/last selected calendar dates become first midnight through midnight after last date; if last date is today cap at T and mark partial; reject future dates |

Never add fixed 86,400 UTC seconds to obtain local tomorrow. DST days can contain 23/25 hours; repeated-hour events remain unique by UTC instant/ID. Group in Z and retain UTC bounds. Any future partial-period/comparison implementation must disclose unequal exposure and resolve ambiguous/nonexistent local times explicitly. The prior draft's preceding-equal-dates, previous-month and matched-wall-clock comparison choices are **not approved defaults**. Compare percentage-point rate deltas from separate N/D; zero baseline percentage change is null/“new”, not infinity. Pool duration sum/count with comparable cohorts and show n.

Use each metric's clock: starts V02; ends V03–V05/T01–T04; writes V01/V06–V13/Q01/Q02/Q09; replacements R01–R04; saved-analysis times R06/Q07. T09–T12 have explicitly selected run-cohort/anchor semantics, not implicit F-only eligibility. R05/R07/Q04–Q06/Q08 are **current stock at T**, with no historical event-period evidence cutoff. A P-selected stock cohort must say “current quality of configurations tested in P, evaluated at T”; it is not quality as of E or monthly historical pass counts. Current snapshot history/as-of comparisons are Deferred until authoritative evidence/design exists. Distinct daily unit/channel counts must never be summed into larger-period distinct totals; configuration groups may overlap one unit/channel.

Current metadata pages do not supply totals: **≤31 UTC days, ≤100 rows/page, offset ≤1000** remain unchanged runtime guards, not a 366-day aggregation engine. Do not bypass them, scrape until a cap, broaden SELECTs or use the desktop read-all service. Future design may use bounded reviewed server aggregates or capped stable-key evidence queries; calendar windows must be split within UTC guards after DST conversion. Total query/row/time and supporting-history budgets still need technical selection and Stage B plan/cost evidence. Supporting history outside P is allowed only within approved bounds and with explicit completeness; for current stock it may include evidence after E through T. A budget hit, missing prior evidence or partial input yields **incomplete/unknown**, never a complete total or an inferred pass.

Plan a **user-initiated extended-report path** with a clear long-running warning, visible progress/status and safe time/query/row/concurrency limits, cancellation and completeness reporting. Exact budgets and status design remain pending. It must not silently bypass normal safeguards or launch automatically. Potential ranges beyond 366 dates are future scope requiring review; an extended path is not automatic approval of a longer calendar range. No engine, worker, query or report UI is implemented in 4A.

Across windows, add event counts once by IDs; globally union exact distinct keys under an approved bound or compute distinctness server-side. Combine average sums/counts and rate N/D, not displayed averages/rates. Medians/P90 require a bounded complete sample or an explicitly reviewed summary/sketch definition, never averaged quantiles. Physical scans remain possible with current indexes; no new indexes, queries or infrastructure are authorized in 4A. Stage B plan/cost verification remains pending.

## Synthetic owner-alignment and future verification examples

These cases are independent unless explicitly sharing a history. All IDs are fictional DEMO identifiers; no actual records or source exports were read. Assume the documented clocks/populations, known saved criteria (illustrative 2.5 limit), non-boundary valid pairs, full coverage where stated, and one assignment unless specified. Cases encode owner-aligned expected behavior plus explicitly pending technical/formula choices; they are not executed application tests or evidence of source instrumentation.

| Case | Fictional evidence | Proposed count/result |
| --- | --- | --- |
| E01 | DEMO-U-A has two sequential complete/included full-48 runs in P, each 48 accepted pairs; elapsed durations 900 and 960 seconds, no repeats within either run | V01=1, V02=2, V03=2, V06=48, V12=48, V07=96, V08=0; V13=48 later-run observations under its proposed attribution contract. T01=930, T02=930; T03 algorithm remains pending. No active duration inferred. |
| E02 | One complete/included 48-channel full plan, all 48 accepted pairs, 900 seconds | V03=1, V06=48, V07=48; T01 sample=900; T04=18.75 seconds/channel. “Complete” alone does not prove passing; require readings/criteria. |
| E03 | Complete/included two-channel plan [7,12], saved N=48, two accepted pairs, 120 elapsed seconds | V03=1, V06=2, V07=2; excluded from F/T01 but valid T10 elapsed sample=120. May contribute to a compatible composite; not a standalone full-48 timing or quality result. |
| E04 | Stopped/pending production run with ten accepted front-panel pairs and valid start/end | V01=1, V02=1, V03=0, V04=1, V06=10, V07=10; no F timing/finished quality claim. T10 may include valid elapsed and T09 could include verified active intervals if later available; incomplete lifecycle alone is not blanket timing exclusion. A `failed` variant increments V05, not scrap. |
| E05 | Complete run later marked superseded with another run's pointer | V02 audit category=1, but A/C contributions=0. Variant complete+included+pointer: helper Yes, report No, owner-approved C No; investigate contradictory state. No invented historical supersession timestamp. |
| E06 | Complete run marked excluded with void JSON | Retained W audit start=1; A/C contributions=0. No deletion, hardware failure or final rejection inferred. Q10 unavailable. |
| E07 | Same valid run/channel 7: day 1 accepted fail, then pass; day 2 accepted fail; both wavelengths stored per row | Combined V06=1, V07=3, V08=1, V09=2/3, V10=1/1; daily V06 totals sum to 2 but combined distinct remains 1. Day-2 repeat counts despite predecessor outside its period. Q01=1; Q02 first observation=1 failure/1; Q09 has one fail→pass and one pass→fail. Latest whole pair fails; do not keep the older pass. |
| E08 | One tested unit, same assignment/channel 19, recorded p19→p49 then p49→p50, followed by genuine p50→p19 reversal, all in P | After two events R01=2/R02=1/R03=2/1/R04=2/1, effective p50. After reversal R01=3/R02=1/R03=3/1/R04=3/1, effective p19; baseline mapping does not erase history. No missing-link exclusion or guessed administrative correction; no verification without later matching evidence. |
| E09 | Full effective 48-channel map, prior channel-19 failure, recorded p19→p49, later compatible passing pair on p49; other 47 pass | One Q05 evaluation; Q04=0; one replacement event. Recommendation alone or a pass before the event would not suffice. Not a final manufacturing release. |
| E10 | Saved DEMO analysis A1 reports `fail_no_viable_recovery`; later accepted measurement changes source fingerprint | Q07=1 historical analysis; A1 stale. Current R07/Q06/Q08 show Needs Reanalysis; no old favorable fallback or final disposition. R06 retains its saved cohort; missing usage link is not noncompliance. |
| E11 | Pair has a wavelength exactly 2.5000 with saved formal limit 2.5 | S08 strict classifier does not fail; S07 rounded COC does. Owner prefers the latter, but technical reconciliation remains pending; no source change or claim of agreement. Verify rounding/just-below/above and other saved profiles before final boundary results. |
| E12 | Completed/included run resumes, retains original start, clears end and remains included; hypothetical verified intervals run 0–10 minutes and 20–25 minutes | While ongoing helper No/report Yes/C-F No. After ending at minute 25, wall-clock=1500 seconds, hypothetical active=900, stopped gap=600; per-unit testing totals sum relevant run durations, not workflow span. Existing SQL lacks these interval facts, so actual active stays unavailable; gap is not automatically operator interruption. |
| E13 | Same unit has two assignments or two modes, each with logical channel 7 activity | Global V01=1, **V06=1**, V12=2. Replacement maps/history never cross assignment. Two K evaluations are not two unique units or one released product. |
| E14 | Two failing logical channels but only one confirmed suitable measured extra port; other installed ports unmeasured | Known candidate set cannot cover both. Current partial/optional `recommendations_available` is not full recoverability; Q08 may count only with known complete input/allocation evidence. Total physical capacity/“ran out” remains unknown; V11 counts only actual accepted extra attempts. |
| E15 | Event exactly S/E; prior attempt before S; zero denominator; Los Angeles spring/fall DST days | S included/E excluded; bounded prior evidence can establish V08/V09. Zero D→null. 2026-03-08 local date spans 08:00Z–next-day 07:00Z (23h); 2026-11-01 spans 07:00Z–next-day 08:00Z (25h). Monday–Sunday weeks; preset/comparison defaults pending. |
| E16 | Zero/negative or null duration; unknown plan/model; long resumed run; missing criteria; query budget exhausted | Metric-specific invalid/missing samples→excluded/unknown with reason; no fabricated active/pass/complete total. Unknown plan excludes F, not automatically valid generic elapsed. Positive duration >5400s flagged; default toggle remains pending. |
| E17 | Ordinary valid workflow with increasing attempts/timestamps; separate demonstrably inconsistent synthetic record with attempt 2 earlier than attempt 1 | Verify SQL/Python effective results agree for valid workflows; different sort expressions alone cause no flag. In inconsistent fixture, demonstrate divergent selected IDs, investigate source provenance and quarantine unresolved affected results; do not invent analytics chronology or favorable-loss override. |
| E18 | DEMO unit with saved N=50, all 50 logical channels in two sequential runs in one assignment/mode; first run has one extra accepted same-channel attempt | V06=50, V12=50, V07=101, V08=1, V09=1/101, V10=1/100, V13=50. Additional mode/assignment repeats keep V06=50 but add diagnostic V12 keys. No sum of daily distincts. |
| E19 | Same unit: run A has verified active=600s and elapsed=1200s; run B active unknown and elapsed=1800s | T09=600 (n=1, missing=1); T10=1500 (n=2); T11=1200 (n=2, active=1/fallback=1). T12 elapsed total=3000, combined total=2400; complete active total unknown, known subtotal=600. One-unit elapsed/combined means equal those totals; do not average per-run means for unit totals. Intervals are hypothetical, not current SQL evidence. |
| E20 | Compatible partial runs produce full passing K at T1; optional swap has no documented prior failure. Later valid failing retest after E, before T2, affects current effective port | Composite pass allowed at T1; optional work does not count Q05 corrective recovery. At T2 current pass is reversed even for a P-selected cohort; event stays at its true later timestamp, current quality is labeled at T2. Saved fingerprint becomes stale/Needs Reanalysis; historical as-of reconstruction remains Deferred. |
| E21 | Requested 366 calendar dates with bounded pre-period provenance; another request 367 dates; a required evidence slice hits budget | 366 is within approved initial range, not proof query budgets suffice. 367 is future longer-range scope, no bypass via extended path. Budget hit→explicit incomplete/unknown. Extended work requires user initiation, warning/status/resource controls; no engine implemented. |
| E22 | Eligible duration observations exactly 5400s and 5400.001s | First unflagged, second flagged at approved 90-minute threshold. Future configured threshold must be visible. Include mode n=2 versus exclude-flagged mode n=1/excluded=1; neither is approved as default. Keep both records; P90 algorithm remains pending. |

## Dashboard alignment recommendations

These are future mappings of owner-approved intent, **not implementation authorization or production-ready metrics**. All current screens and synthetic data remain unchanged.

| Existing panel / source | Owner-aligned future mapping | Clarification / gap |
| --- | --- | --- |
| Overview "Channels tested" / daily bars | V06 unit/logical-channel distinct; V12 technical coverage and V07 attempts separately | No sum of daily distincts for period totals. 50 repeatedly measured positions remain 50 per unit. |
| "Units completed" / configuration "units" | V01 tested units versus V03 completed runs | Separate labels/clocks; mock `unitsOf` adds outcome buckets, not distinct units. |
| "First-pass yield" | Q03 Deferred | No first-pass manufacturing yield from composite/no-replacement buckets. |
| "Channel failure rate" / heatmap | Q01 historical coverage or Q02 first-observation fraction, with N/D | Saved limits/profile; owner prefers rounded COC >=, technical classifier conflict pending. Fixed 2.5 dB/1310-1550 mock labels are not universal. |
| Average test time / histogram / query timing | T09 primary active when verified; T10 labeled elapsed fallback; T11 mixed average with source counts; T12 unit totals | T01–T04 remain F-only elapsed statistics. No active values from unavailable SQL intervals. Fixture 920 seconds and generated histogram are not observations. No default flagged toggle/P90 method approved. |
| Unit outcomes / Failures weekly stack / "Unrecoverable units" | Q04–Q06/Q08 current K stock at T; Q07 separate saved history | No exhaustive unit partition, historical cutoff or final scrap claim. Current pass can reverse after a later failure. Historical weekly quality snapshots require future evidence. |
| "Channels swapped per failing unit" | R01 events, R02 distinct assignment channels, R03 tested-unit and R04 replaced-unit ratios | Each ratio uses matching populations. Mock failed-channel/failed-unit ratio is not replacement workload. Genuine reversals count. |
| "Recovered after replacement" | Q05 verified corrective recovery | Prior failure, corrective event, later effective-port pass and full current configuration pass; optional optimization excluded. Percentage cohort still needs explicit review. |
| "Retested channels" / station retest rate | V08/V10 run-channel retests, V09 attempt share, V13 cross-run observations | Different grains; show n/context. Station included; operator details/ranking not authorized. |
| Failure hotspots / extra-port trend | Q01/Q02 for testing flows; R05/Q08 for current candidate context | Confirmed suitable candidates include deployed; unknown availability is not physical exhaustion. Fixed mock spare counts are illustrative. |
| "Are operators following the analysis?" | R06 historical linkage; R07 current fresh guidance | No behavior/noncompliance inference from missing link. Stale current guidance says Needs Reanalysis. |
| Unit explorer losses/map/history | Source S05/S06 effective behavior with Q/R provenance | Whole pairs/current map, historical assignments/criteria, Unknown/Needs Review and stale states. No competing chronology. Private evidence views require authorization. |
| Queries library/schema | Reviewed bounded reports only | Mock columns/SQL are illustrative. 366-day product intent does not bypass existing runtime guards. No arbitrary SQL or extended engine in 4A. |

## Owner decision register

**Source of approval: supplied owner decisions, dated 2026-11-06.** "Approved intent" below records that selection only. Partial approvals retain explicitly pending details; technical blockers and source gaps are not owner decisions resolved by implication. Affected shorthand maps to the stable IDs in the catalog. There are exactly 15 decision rows.

| Decision | Approval date / status | Approved intent | Affected metrics / contracts | Evidence limitations and remaining verification |
| --- | --- | --- | --- | --- |
| D01 | 2026-11-06 — Approved intent | Separate W recorded production workload, A accepted production activity, C completed production results; C = production/complete/included/no pointer. Audit voided/superseded history separately. | V01–V13; T01–T12 population gates; Q context | S02/S04 differ operationally after resume (S03/S11). Verify restated eligibility/joins; no universal completion gate on valid incomplete contributions. |
| D02 | 2026-11-06 — Approved intent | V06 distinct unit/logical-channel coverage per P; separate assignment/mode coverage, attempts, within-run repeats and cross-run remeasurement. Never sum daily distincts. | V06–V10/V12/V13; Q02/Q09 labels | S01/S05 support separate grains; verify exact cross-run attribution and bounded predecessors. No approved default diagnostic filter or invented chronology. |
| D03 | 2026-11-06 — Approved intent | Production workload uses production records only. Source-compatible other-purpose evidence may contribute technical evaluations with provenance; no manufacturing-yield claim. | W/A/C, all volume/timing workload; R production attribution; Q03–Q08/R05/R07 technical stock | S06/S07 purpose/completion are not technical compatibility gates. Verify provenance and production attribution of unlinked events; retain unclassified audit history. |
| D04 | 2026-11-06 — Preference approved; technical conflict open | Prefer rounded COC-style >= failure classification using saved profile limits. | Q01–Q09; R05/R07 candidate/recommendation qualification | S07 vs S08 conflict persists. Reconcile rounding/comparator/profile semantics and verify boundaries; no source rule change or resolved-classification claim. |
| D05 | 2026-11-06 — Calendar approved; defaults pending | America/Los_Angeles; Monday–Sunday weeks; local calendar/DST-safe UTC conversion. | All clocks, date filters/grouping/comparisons | Default preset, partial-period/comparison details remain owner questions. Verify 23/25h days, UTC boundaries and yearly/leap calendars; UTC storage alone is insufficient. |
| D06 | 2026-11-06 — Approved intent; data unavailable | Primary duration = sum running-state intervals excluding stopped intervals; separately sum relevant runs for unit testing totals. | T01–T12, especially T09/T12 | S01/S03/S10 lack reliable SQL interval history. Do not use first-start/final-end as active or repurpose acquisition-only T05. Instrumentation requires separate scope. |
| D07 | 2026-11-06 — Threshold/control intent approved; details pending | Flag strictly >90 minutes; future configurable threshold and flagged include/exclude control; preserve records and show n/exclusions. | T01–T04/T09–T12; duration presentation | Default toggle, P90 algorithm and minimum-sample display policy unapproved. Validate basis-specific flags and exclusion counts; no silent trim. |
| D08 | 2026-11-06 — Quality intent approved; first-pass Deferred | K configuration grain; current compatible composites/current map; later valid fail can reverse pass. Corrective recovery requires documented failure, replacement, later effective-port pass and full configuration pass. Optional work is not corrective recovery. | Q03–Q06/Q08; Q01/Q02/Q09 historical distinction | S06–S09 require compatibility, full coverage and provenance; D04 unresolved. Default K universe/unique-unit rollup not approved. Strict manufacturing first-pass yield Deferred; unknown/review states retained. |
| D09 | 2026-11-06 — Approved intent | Recorded replacement events primary; distinct assignment channels, both matched unit ratios, genuine reversals; exclude only verified administrative errors. Valid unlinked events count; historical analyses separate from current fresh guidance, stale -> Needs Reanalysis; no noncompliance inference. | R01–R04/R06/R07; Q05–Q07 | S01/S09 establish events/linkage/fingerprints, not administrative-error authority. Verify correction evidence, numerator membership, latest applicability and full freshness; missing links not proof of behavior. |
| D10 | 2026-11-06 — Approved intent | Denominator confirmed suitable candidates including deployed; distinguish insufficient verified candidates, unknown availability and proven lack of recovery options. No physical capacity/scrap inference. | R05/Q06/Q08; Q10 boundary | S06/S09 complete allocation and candidate suitability must be verified. Unmeasured ports/designation counts do not prove exhaustion; criteria and current stock at T must match. |
| D11 | 2026-11-06 — Approved intent; operator access unapproved | Historical assignment/configuration/model/mode/N/criteria override mutable hardware; missing/conflict Unknown/Needs Review. Station included; operator detail requires authorization, no automatic ranking/unauthenticated identities. | All G/groupings/drill-downs, V01/V06/V12, Q/R stock | S01/S06/S10 snapshot completeness/normalization needs review. Identity/disclosure controls not implemented. Do not silently fill missing historical values from current hardware. |
| D12 | 2026-11-06 — Current-state intent approved; as-of Deferred | Testing events retain actual times; current quality uses latest valid effective evidence/map at extraction T, labeled restated current-state. No historic cutoff on current KPI. | Q04–Q06/Q08/R05/R07; all event clocks; Q07 freshness | S03/S06/S09 mutable state and partial history cannot prove historical as-of quality. Verify P cohort membership separately from T evidence; historical as-of remains Deferred. |
| D13 | 2026-11-06 — Product scope approved; execution design pending | Up to 366 calendar dates; daily/weekly/monthly/yearly/custom; bounded supporting history, exact distincts, explicit incomplete results. Plan user-initiated extended report with warning/status/safe controls; longer ranges future. | All period totals, V01/V06/V12 distincts, duration distributions, Q supporting history | Existing ≤31-day/100-row/1000-offset metadata guards unchanged. Budgets/lookbacks, plans, aggregation and extended path design need verification/review; no unbounded work or engine in 4A. |
| D14 | 2026-11-06 — Approved intent; missing sources unresolved | Prefer accurate run-active, otherwise labeled elapsed; separate active/elapsed/combined averages, combined active-first with source counts/warnings. Metric-specific eligibility preserves valid incomplete contributions. Final disposition needs future evidence. | T01–T12/Q03/Q10; all n/exclusion rules | S01/S10 lack active/session/final disposition facts. T09 is not acquisition-only T05. Explicit run-cohort/ongoing anchor and unit weighting details need review; no invented active/final states. |
| D15 | 2026-11-06 — Approved intent; consistency verification pending | Follow existing source effective behavior for valid records; no competing chronology. Intended valid SQL/Python results agree. Different expressions alone do not justify flags; investigate demonstrated inconsistency without override. | V08–V10/V13; Q01–Q09; R05/R07 provenance | S05/S06/S07 have different projection scopes/order expressions. Verify valid workflow consistency and investigate actual contradictions; do not quarantine ordinary valid records solely from code differences. |

## Remaining owner details and technical gates

Owner details still pending: default preset/filter/cohort and partial-period/comparison behavior; default flagged include/exclude state; P90 algorithm/minimum-sample policy; explicit duration run cohort/ongoing anchoring and any quality unique-unit rollup or recovery-percentage denominator. These details were not approved by implication. Source interval instrumentation, final disposition and historical as-of quality need future source/architecture scope, not invented data.

Technical verification remains: threshold/rounding reconciliation; source-effective consistency for valid workflows; historical snapshot/identity integrity; active interval completeness; corrective recovery provenance; current recommendation applicability/full-fingerprint freshness; candidate suitability/allocation coverage; administrative-error evidence; bounded lookbacks/exact aggregation/incomplete status; non-production schema/privileges/TLS/query-cost acceptance. The source evidence above establishes code/schema facts, not real stored-record quality.

## Recommended first implementation batch — separate authorization required

Owner review of the supplied intent is complete; **Milestone 4B is not started**. After explicit 4B authorization, required remaining detail review and separately authorized Stage B evidence, consider V01–V07/V11/V12 with separate clocks/audit categories and exact period distincts, then V08–V10/V13 once predecessor behavior is verified. R01–R04 can follow with matched populations and authoritative correction handling. Any early duration display must use clearly labeled verified elapsed evidence, disclose unavailable active data and keep T01–T04 F-only versus T10 general eligibility distinct; combined/unit summaries require explicit cohorts/source counts.

Do not treat semantic approval as completed queries, boundary classification, current-quality verification or production readiness. Defer strict first-pass yield/historical as-of quality and unsupported acquisition/interruption/workflow/disposition metrics. Use E01–E22 as future acceptance fixtures; none were implemented as application tests here. No database connection, source change, real-data endpoint, extended engine, commit or push is part of this reconciliation.
