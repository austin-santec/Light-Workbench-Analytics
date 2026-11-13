# Production metric definitions — Milestone 4A

**Final owner decisions incorporated November 6, 2026; V06/V07/V11 diagnostic implementation authorized November 13, 2026.** The prior reconciliation is committed at `7801ae409c0d2110834cf6b6aa4c53334c3437ba`. D05/D06/D07/D08/D14 below incorporate the final decisions; other approvals remain in force. Approval and a bounded test-database diagnostic do not certify source completeness, query cost or production readiness. Dashboard fixture values remain synthetic design examples, not manufacturing evidence.

All **42 existing stable IDs, including the 35 original IDs, are retained without renaming**. The prior seven companion contracts remain: V12 assignment/mode coverage; V13 cross-run remeasurement; T09–T12 run-active, general elapsed, combined run diagnostics and per-unit totals; R07 current recommendations. T12 now specifies the primary finished-unit cumulative duration. One additional companion, Q11, is necessary to specify a recovery percentage with its own resolved-configuration denominator without changing Q05's recovery-count meaning. The catalog now contains **43 contracts**. No other metric IDs are added. Technical feasibility remains separate from owner approval.

## Evidence index

Evidence below is retained from the initial 4A review. The previous reconciliation based on `270f829842c2f36913783c3f90bc2086b7f56f1e` was committed as `7801ae409c0d2110834cf6b6aa4c53334c3437ba`, the baseline for this final update. This update does not repeat source execution or establish live database facts.

Analytics baseline: `87579140fb5d6c51d8d41eb26875ebed945259bb`. Related source: `austin-santec/Light-Workbench`, local `ILM Python Testing`, branch `cleanup`, exact reviewed commit **`5d4972830e74cc1b1e718fb577916d132e58faf7`**. The migration 0007 timing evidence was read from committed blobs only; source was never imported/run and no live database was inspected. [Reporting database contract](REPORTING_DATABASE.md) records types/relationships and the separate integration acceptance checklist.

References S01–S12 identify files/symbols at that source commit; they are source facts, not proof of actual stored data quality or owner intent.

| Ref | Source path / locator | Established evidence |
| --- | --- | --- |
| S01 | `infrastructure/database/sql_migrations/0001_initial_schema.sql` through `0007_run_test_sessions.sql` | dbo units, switches, assignments, runs, accepted paired measurements, replacement/spare events, saved analyses/recommendations; UTC `DATETIME2(3)`, decimal losses, FKs and vocabularies. 0003 adds station, 0005 adds void JSON/removes exclusion-reason column, 0006 defines roles/current-extra projections, and 0007 adds prospective run timing sessions plus a summary view. |
| S02 | `domain/database_run_lifecycle.py:is_normal_production_analysis_eligible`; `domain/run_purpose.py:default_analysis_policy` | Helper requires production/complete/included; current purpose policy initially makes all purposes pending. |
| S03 | `application/run_lifecycle_workflow.py:prepare_start_spec,finish_run,resume_run,set_analysis_status`; `infrastructure/database/sql_repositories.py:finish,resume,set_analysis_status` | Normal close marks complete→included, otherwise pending; resume clears end/status completion but retains original start and analysis state. Lower-level APIs allow explicit dispositions. |
| S04 | `application/database_reporting.py:search,_matches,_run_row`; `application/database_primary_workflow.py:__init__`; `ui/database_reports.py:_filters,_date_value` | Desktop report service uses production/included/no superseding pointer, optional inclusive run-start UTC date filters; source report aggregates/read-all behavior is not an analytics query/performance contract. |
| S05 | `application/database_run_read_model.py:_measurement_recency_key,build_database_run_snapshot`; SQL `vw_CurrentILMeasurements` in 0006 | Python current view chooses written time/attempt/ID; SQL view orders attempt/ID within run and role/key. Neither alone is assignment-wide effective quality. |
| S06 | `domain/effective_replacement_analysis.py:_compatible_run,build_effective_replacement_projection` | Assignment/model/mode/count/criteria compatibility, exclusion of voided/superseded sources, current mapping, whole-pair recency, replacement verification, candidate coverage and source fingerprint. Purpose/completion are not technical compatibility gates. |
| S07 | `domain/coc_preparation.py:_compatibility_issues,_select_latest_records,_measurement_sort_key,_formal_failures` | Whole-pair composite selection, profile/assignment compatibility and strict COC publication requirements. COC template support is narrower than measurable model/mode combinations. |
| S08 | `domain/limit_profiles.py:LimitProfile.classify,resolve_loaded_run_profile` | Saved criteria/model/mode are authoritative; classifier fails `loss > fail_above_db`, flags too-good/review independently. |
| S09 | `domain/replacements.py:analyze_replacements`; `application/replacement_analysis_persistence.py:classify_result,PersistedReplacementAnalysis.is_current`; source SQL repository `_validate_analysis_source_snapshot` | Required/optional one-to-one recommendations, measured candidate constraints, append-only saved classifications, full-fingerprint versus legacy watermark freshness paths. |
| S10 | `infrastructure/database/sql_migrations/0007_run_test_sessions.sql`; `domain/run_sessions.py`; `infrastructure/database/run_sessions.py`; `application/run_session_timing.py`; `ilm_app.py:_database_measurement_hardware_snapshot` and resume branch | 0007 records active-duration checkpoints prospectively. The summary is `confirmed` only when sessions are closed with no partial/estimated quality; open is provisional, pre-0007/no-session is unavailable, and partial/estimated histories remain labeled. Desktop continuation/retest can reopen an existing run. |
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
- **Q — current effective-quality stock:** evaluate selected **K = `(assignment_id, wavelength_mode, N, criteria signature)`** against latest valid compatible evidence and current mapping **at extraction T** using S06/S07. **Default population: configurations with qualifying accepted production testing activity in P**, selected by A measurement writes and historical configuration evidence. Provide a separate **All Current Configurations** view, whose stock membership is independent of P. Do not silently merge the two populations. K is not a unit and does not require C completion in P. Compatible pending/partial and other-purpose evidence may contribute under source behavior, with provenance. P selects default cohort membership only; evidence through T determines current quality, including newer failures that reverse earlier passes. No end-of-P/context-end evidence cutoff. Label **restated current configuration quality**, population and extraction time. True historical as-of quality remains Deferred.

## Shared contract conventions

P is the half-open UTC interval `[S,E)` derived from factory timezone **Z = America/Los_Angeles**; T is extraction time. Weeks run Monday–Sunday. A/C predicates use the source's **current state at T**. Historical events retain their actual timestamps; a later retest is not moved into an earlier event period. Lifecycle/analysis-state history is not fully persisted, so timestamped activity with current eligibility is restated, not guaranteed historical “as known at E” reporting. Q is current stock at T, not an event flow. Void JSON/saved analysis snapshots provide some history, not complete status/session history (D12).

Joins: runs→assignments via `assignment_id`; assignment→unit/switch by `unit_id`/`switch_id`; measurements→runs by `run_id`; replacements/spares→assignment; analyses→context run; recommendations→analysis; optional replacement→recommendation by `source_recommendation_id`. Aggregate each child grain before joins or count distinct event/measurement IDs; joining attempts × replacements × recommendations multiplies rows.

Grouping G: historical assignment, saved model from valid `limit_snapshot_json` and corroborating hardware snapshot; `wavelength_mode`; **run** `front_panel_channel_count` (24/36/48 where present, not assumed exhaustive); saved criteria. Do not use current unit count or SCPI count as historical capacity. Missing/conflicting identities go to **Unknown/Needs Review**, never mutable-current substitution. Current `SWITCHES.switch_model` is an identity lookup, not an immutable historical quality label. Station reporting is included, with nullable station bucket. Operator details require separate authorization; use event-appropriate run `tested_by` or measurement `written_by` only after approval, with no guessed person mapping, automatic employee ranking or unauthenticated identity disclosure (D11).

Saved measurement classification/source profile and timing-profile revision may distinguish procedures within the same model/mode/N. Historical snapshot precedence is approved; comparable pooling still needs technical review. A mode label alone does not certify identical acquisition procedures.

A physical switch is **either SM or MM**. Preserve its actual historical model/mode and assignment evidence; mode comparisons across switches do not create a requirement to test each unit in both modes. Multiple assignments/configuration keys in history remain separate evidence; they do not imply mandatory configurations, testing episodes or new completion actions. Follow existing Light Workbench effective-measurement/replacement-analysis behavior. Mapping that evidence to a verified current unit outcome remains a technical task, not permission to invent a workflow.

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
- **Drill / verification:** Unit/channel and contributing assignments/modes/attempts; E01, E07, E13/E18. **Status: Implemented as a bounded test-database diagnostic; owner intent approved, offline semantics tested, live technical/query-plan verification pending; feasibility F1.**

### V07 — Accepted front-panel measurement attempts

Stable ID: `volume.accepted_logical_attempts`.

- **Question / formula / N-D:** How many persisted measurement actions were accepted? Count distinct `measurement_id` in A/P; no denominator. A paired two-wavelength row is one attempt.
- **Time / population / keys / source:** `written_at_utc`; A; measurement ID/unique UUID for retry diagnostics; S01/S05. Keep all accepted attempts, not only current views.
- **Missing / limitations:** Missing IDs/invalid roles excluded with diagnostics. Temporary/rejected/unwritten readings are absent, so this is not hardware request count. Superseded attempts within a valid run still count as activity.
- **Drill / verification:** Run/channel/attempt/paired wavelengths; E01, E07. **Status: Implemented as a bounded test-database diagnostic companion; offline semantics tested, live technical verification pending; feasibility F1.**

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
- **Drill / verification:** Role, port, parent run, boundary; E14. **Status: Implemented as a bounded test-database diagnostic companion; offline semantics tested, live technical verification pending; feasibility F1.**

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

SQL start/end measure persisted run-record wall-clock elapsed time. Migration 0007 additionally records prospective run-session active-duration checkpoints and exposes a timing summary, but it does not backfill earlier runs. Only `confirmed` session histories provide complete active time; open histories are provisional and partial/checkpoint-estimated histories remain labeled rather than silently treated as confirmed. Resume keeps original start, clears end, then later finish supplies a new end. Thus start→final end can include pauses, closure gaps, continuations and retests. Inter-write gaps cannot separate operator idle from hardware settling/processing. Station/operator recorded at run creation may not identify who performed every later continuation.

Elapsed arithmetic retains source millisecond resolution, converted to seconds. **Primary duration is T12's per-finished-unit cumulative testing duration**, not a run-weighted mean. Sum qualifying runs, preferring measured running-state intervals that exclude Stop/Continue idle gaps, with explicitly labeled elapsed fallback. Run-active is not acquisition-only T05. T09–T11 remain secondary run-level active/elapsed/combined diagnostics; T01–T04 remain the narrower F-only elapsed diagnostics. Valid incomplete/stopped runs may contribute known testing time, but unfinished units do not enter the finished-unit KPI.

**Finished-unit eligibility and full history (D06/D14):** at T, require a verified current passing outcome or a verified **conclusively unrecoverable** outcome, plus complete duration evidence for the selected source option. Exclude unfinished units, pending replacements, pending verification and uncertain recovery; display each exclusion/unknown count. Run completion alone is not unit completion. A passing result must be supported by current complete compatible effective evidence/map with no pending work; a terminal unrecoverable outcome needs authoritative conclusive evidence, not insufficient measured candidates, a stale analysis, or Q07/Q08 membership. These are reporting concepts, not new database/workflow states or completion actions. Terminal failure and verified finish timestamps may not be reconstructable from S01/S03/S06/S09; do not fabricate them or label a passing-only subset as complete overall coverage.

For each eligible unit, accumulate **all qualifying production testing runs linked through historical assignments**, including retests days/weeks apart, through T under source validity rules. Qualifying run membership uses A's parent production/not-excluded/not-superseded/no-pointer rules; F/completion/full-plan membership is not required. Verify the complete constituent-run inventory, including supplemental candidate testing and valid stopped/partial work; missing context or unverified membership means incomplete, not a guessed zero or omitted run. A run's diagnostic period membership does not restrict the unit history. Excluded/superseded evidence remains audit history. Preserve actual model/mode/assignment provenance; filtering must not silently turn a full unit total into a partial one. Cross-assignment attribution with conflicting history is Unknown/Needs Review. No mandatory multi-mode test, episode boundary, elapsed-days reset, or new completion workflow is introduced.

**Two clocks:** attribute a finished unit's **full accumulated duration once** to its **latest verified finished-outcome date** in P, determined from authoritative outcome evidence, not assumed to equal a run end or last measurement. Later testing that changes the current result triggers recalculation of cumulative duration and eligibility; pending/uncertain units leave the eligible population, and a later verified finish moves the current reporting date. Historical finished-unit summaries are therefore **restated current-state reports at T**, not immutable completion snapshots. Actual activity still belongs to dates work occurred (writes/events or verified interval attribution), not the finished date. Do not clip cumulative totals to P or count gaps between separate runs. Supporting history may exceed 366 calendar dates even though the selected reporting period is capped: use bounded verified retrieval or mark incomplete, never impose a hidden truncation or bypass query budgets.

**Duration statistics (D07):** include valid observations **over 90 minutes by default**, flag **strictly >5400 seconds**, and allow include/exclude control plus the previously approved configurable threshold. Apply the threshold to each series' own grain/value; a flagged run does not automatically remove its unit's constituent time. In primary T12 statistics, flag/filter complete unit totals, never remove one run and call the remaining partial total complete. Preserve underlying records and always show sample size/exclusions. Display average, median and **nearest-rank P90** for **n >= 1**; sort eligible observations ascending and select one-based rank `ceil(0.90*n)`. Median uses the middle value or mean of the two middle values. Show **Small Sample** when `1 <= n < 10`; for `n = 0`, show **No Data** (no numeric zero/quantile). The same rule applies separately to each outcome group/source option and secondary run diagnostics. Flags do not prove idle time or administrative error; normalized per-channel T04 inherits its underlying run flags rather than comparing seconds/channel to a run threshold.

### T01 — Mean completed full-plan run elapsed seconds

Stable ID: `duration.mean_full_plan_run_elapsed_seconds`.

- **Question / formula / N-D:** How long do recorded full-plan runs remain open? N = sum `(end-start)` in seconds; D = valid F run count, including passing and failing results. A secondary elapsed statistic, never active time or an approved default duration.
- **Time / population / keys / source:** End in P; F, matching saved model/mode/N; run key; S01/S03/S10 and plan/coverage JSON/history. Include resume gaps with explicit warning; absence of resume evidence cannot prove uninterrupted execution.
- **Missing / limitations:** Exclude null end, ongoing/non-C, nonpositive duration, unknown/conflicting config/plan/coverage, short/extra-only/composite cases from this F-only sample; valid incomplete observations may still qualify for T09/T10. Include valid >5400-second values by default with flags/control. Apply n/Small Sample/No Data rules above. T12 is the primary, unit-weighted KPI.
- **Drill / verification:** Start/end, delta, plan, N, coverage and flags, no invented active time; E01–E04, E12, E16. **Status: Proposed; feasibility F2; elapsed scope aligned, filter details/technical verification pending.**

### T02 — Median completed full-plan elapsed seconds

Stable ID: `duration.median_full_plan_run_elapsed_seconds`.

- **Question / formula / N-D:** What is the typical elapsed observation? Median of T01's exact eligible per-run durations; for even n average the middle two. No ratio; n is sample count.
- **Time / population / keys / source:** Same end-time/F/G/run sample as T01; S01/S03/S10.
- **Missing / limitations:** Inherit T01 exclusions/gap caveat; n=0→No Data, n=1–9→Small Sample with numeric median. Do not compute median of group medians or suppress a valid small sample.
- **Drill / verification:** Ordered duration sample and excluded counts; E01→930 seconds for [900,960]. **Status: Proposed; feasibility F2.**

### T03 — P90 completed full-plan elapsed seconds

Stable ID: `duration.p90_full_plan_run_elapsed_seconds`.

- **Question / formula / N-D:** How slow are upper-tail full-plan elapsed observations? Nearest-rank P90 of T01's eligible run durations: one-based sorted observation at `ceil(0.90*n)`, n>=1; no ratio. Histogram bins count the same sample.
- **Time / population / keys / source:** Same sample/time/run grain as T01; S01/S03/S10.
- **Missing / limitations:** n=0→No Data; 1<=n<10→Small Sample with P90 shown. Include valid flagged durations by default; always disclose n/exclusions. Never average subgroup P90s or fit a synthetic normal curve as observed data. Source sample completeness still needs verification.
- **Drill / verification:** Ordered sample/rank/bin edges; E01's [900,960] gives P90=960; E22/E26 cover threshold/small samples. **Status: Proposed; D07 method/display approved, technical verification pending; feasibility F2.**

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

### T08 — Superseded unit workflow-span proposal

Stable ID: `duration.mean_unit_workflow_seconds`.

- **Question / formula / N-D:** Retained stable ID for the earlier workflow-span proposal, which is superseded by final D06/D14 for the primary KPI. No approved formula or denominator; do not implement `max(end)-min(start)` or invent testing episodes.
- **Time / population / keys / source:** S01/S03/S10 lack the former workflow/session boundary. Existing run/unit/assignment history supports investigation only; T12 uses a verified current outcome date and sums run time without a new workflow ID.
- **Missing / limitations:** Gaps between separate runs must not become testing duration. This retained proposal is not a request to add completion actions, episodes or session instrumentation; do not revive it as the primary duration contract.
- **Drill / verification:** Compare gap-spanning history with T12's constituent-run sums; E12/E23. **Status: Deferred; superseded workflow-span proposal, feasibility F3.**

### T09 — Mean run-active seconds

Stable ID: `duration.mean_run_active_seconds`.

- **Question / formula / N-D:** How much running-state time did runs consume? For each run r, `active(r) = sum(valid running intervals excluding stopped intervals)`; N = sum active(r), D = runs with complete verified interval coverage. Secondary run diagnostic; T12 is the per-unit primary.
- **Time / population / keys / source:** Secondary bounded-run diagnostic: A-parent-valid production runs with observed terminal end in P, completion not required. An ongoing diagnostic must be separately labeled/anchored at T with authoritative running-state evidence; precise display remains technical design. Run ID; S01/S03/S10 provide prospective session timing for runs covered by 0007. These diagnostic date selections do not limit T12's all-history run inventory or define dates of actual work.
- **Missing / limitations:** Active time is prospectively available for runs whose complete session history is `confirmed`. Pre-0007/no-session runs and partial, checkpoint-estimated or provisional histories do not provide confirmed complete active duration; use labeled elapsed fallback where allowed or exclude with counts/reasons. No interval double-counting; verify coverage, nonnegative intervals and lifecycle consistency. Running can include settling/processing; not T05 hardware-only. Never subtract guessed pauses from elapsed.
- **Drill / verification:** Interval IDs/bounds, stopped gaps, run totals and n/exclusions; E12/E19/E22. **Status: Proposed; feasibility F2 prospectively for confirmed sessions and F3 for missing/nonconfirmed active coverage; owner intent approved, coverage validation pending.**

### T10 — Mean eligible run wall-clock elapsed seconds

Stable ID: `duration.mean_run_elapsed_seconds`.

- **Question / formula / N-D:** What wall-clock span is available for the selected run cohort? N = sum valid `observed_end - original_start`; D = eligible runs with valid bounds. Includes stopped gaps and resumed closures; label wall-clock elapsed explicitly.
- **Time / population / keys / source:** Same explicit cohort/anchor as T09/T11, but valid start/end are sufficient timing evidence: A-parent-valid production runs with terminal observed end in P, including stopped/failed or short tests. Ongoing age to fixed T is a separate labeled selection, not substituted silently. Run ID; S01/S03/S10. F is not required.
- **Missing / limitations:** Missing/invalid/nonpositive bounds excluded with n; missing historical config remains Unknown/Needs Review rather than substituted hardware. Do not apply F-only exclusions to general elapsed. Incomplete testing can supply a valid run diagnostic or constituent duration without proving finished-unit eligibility. Elapsed may include Stop/Continue gaps inside one run; label/warn explicitly. Never count gaps between separate runs or claim active/uninterrupted/workflow time.
- **Drill / verification:** Original start, observed end/anchor, lifecycle, flags and exclusions; E03/E04/E12/E19. **Status: Proposed; feasibility F1 for timestamps, F2 for cohort verification; D06/D14 aligned, cohort details pending.**

### T11 — Combined run duration average with source counts

Stable ID: `duration.mean_combined_run_seconds`.

- **Question / formula / N-D:** What duration can be reported with transparent fallback? For each run in the same explicit T09/T10 cohort, choose valid complete active(r), else valid elapsed(r), else missing. N = sum chosen durations; D = chosen run count. Publish active-only T09 and elapsed-only T10 averages separately, not as equivalent quantities.
- **Time / population / keys / source:** Same period/cohort/run key as T09/T10; S01/S03/S10. One source per run; active preferred even if elapsed also exists. Retain n_active, n_elapsed_fallback, n_missing and source labels.
- **Missing / limitations:** Clearly label **combined active/elapsed** with warnings/source counts. Use prospective active time only for `confirmed` session histories; pre-0007/no-session, partial, checkpoint-estimated and provisional runs remain labeled elapsed fallback or missing. Include valid flagged durations by default, with control, n/exclusions and Small Sample/No Data rules. This is secondary run-weighted diagnostics, not primary T12. Do not average group means without weights.
- **Drill / verification:** Selected value/basis and unselected available bounds per run; E19/E22. **Status: Proposed; feasibility F2 for confirmed prospective active time and elapsed fallback, F3 where active coverage is missing/nonconfirmed; technical/cohort validation pending.**

### T12 — Primary finished-unit cumulative testing duration

Stable ID: `duration.unit_testing_totals`.

- **Question / formula / N-D:** What accumulated testing time did each currently finished unit require? For each verified eligible unit u, R(u) is its complete qualifying run inventory through T, independent of P's run dates. Separately calculate `unit_active=sum(active(r))`, `unit_elapsed=sum(elapsed(r))`, and `unit_combined=sum(active(r) if valid else elapsed(r))` for r in R(u). A basis is complete only if every qualifying run has valid evidence for that basis. Mean for basis b = sum complete eligible unit_b totals / distinct eligible units with complete b totals. Each unit contributes once regardless of run count. Show separate passed/conclusively-unrecoverable means; **default overall includes both finished groups**, pooled by unit counts, not average of group means. Preserve active-only/elapsed-only/combined source options; combined prefers active per run and explicitly labels elapsed fallback. Default overall population is approved; no additional default source-selector setting is inferred beyond active preference/fallback.
- **Time / population / keys / source:** Include units whose **latest verified current finished-outcome date** is in P and whose current eligibility is verified at T under the rules above. Attribute the **full accumulated total**, including retests weeks earlier/outside P, to that date. Historical assignment→unit/run IDs and actual model/mode evidence: S01/S03/S06/S09/S10. Preserve the verified outcome's actual switch/configuration attribution for filters and constituent provenance; do not use mutable hardware or remove old qualifying runs to manufacture a filtered complete total. Conflicting attribution stays Unknown/Needs Review. Later changed results recalculate totals/eligibility; a later verified finish changes the date. Label restated current-state at T; actual activity dates remain separate. This clock does not inherit the run diagnostic end-in-P filter.
- **Missing / limitations:** Exclude unfinished, pending replacement/verification, uncertain recovery, unknown terminal outcome/date or incomplete duration; report each reason, outcome counts and basis-specific n/exclusions. Known subtotals remain explicitly incomplete, not whole totals. Active time is available prospectively only for runs with `confirmed` sessions; pre-0007/no-session and partial, checkpoint-estimated or provisional histories require labeled elapsed fallback or make the selected active basis incomplete. Authoritative conclusive failure/finished timestamps and all-history inventory may still be unreconstructable. Do not infer them from C, Q07/Q08, a last run/write, or inadequate candidates. Do not call a passing-only observed subset a complete overall average. Combined reports active-run/fallback-run counts, units using any fallback and missing-run coverage. Include valid >90-minute unit totals by default with flags/control; mean/median/nearest-rank P90 use eligible unit totals and D07 display rules. Never drop one constituent run to lower a unit's total, count inter-run gaps, reset for elapsed weeks, require both SM/MM, or introduce episodes/completion actions.
- **Drill / verification:** Unit→historical assignments→all constituent runs/bases, verified current outcome/date provenance, source/sample/exclusion counts; E19/E23–E25/E27. **Status: Proposed; owner semantics approved, pending technical verification; feasibility F2 for confirmed prospective active and evidenced elapsed/combined sums but F3 where active coverage, terminal outcome/date or complete history cannot be established. Not production-ready.**

## Replacement catalog

Replacement event history X uses `replaced_at_utc` in P and historical assignment→unit. It includes valid recorded events even when a related run later becomes voided/superseded or `related_run_id` is NULL; show attribution/validity separately (D09). All valid events count regardless of recommendation linkage. Genuine reversals count as events. Exclude administrative errors **only when authoritative verification permits**, retaining the original record and exclusion evidence/count; notes or reversed mapping alone are insufficient. The reviewed schema has no established authoritative administrative-error classification; default factual counting cannot guess exclusions. These are replacement records, not independently verified physical operations. Production-attributed versus unclassified/other-purpose event categories must be explicit: only verified production-attributed events belong in a production workload subtotal (D03), while total X includes separately labeled unattributed history. Do not drop X solely because its related run fails C/A or silently inherit desktop report filtering. Model/mode attribution requires immutable context. No hardware operation is inferred.

### R01 — Recorded replacement events

Stable ID: `replacement.recorded_events`.

- **Question / formula / N-D:** How many valid replacement records document workload? Distinct `replacement_id` in X; no denominator. Primary replacement KPI; show total recorded, verified administrative exclusions and counted events separately.
- **Time / population / keys / source:** Event time, X, replacement ID; S01/S06. Repeated replacements of one channel remain separate events.
- **Missing / limitations:** Missing related run/link must not drop the event; missing event time is unknown. Saved recommendations are not events. Genuine return to the initial port still counts; no administrative-error exclusion without authoritative evidence. Production attribution remains explicit, not inferred from missing linkage.
- **Drill / verification:** Assignment, logical/old/new ports, event ID, optional recommendation and later verification; E08/E09. **Status: Implemented as a bounded replacement-activity diagnostic for all/production/engineering/training/calibration/unattributed buckets; offline semantics verified, live technical/query-plan verification pending; feasibility F1.**

### R02 — Distinct logical channels replaced

Stable ID: `replacement.unique_logical_channels`.

- **Question / formula / N-D:** How many distinct assignment-scoped channels have recorded replacement activity? Count distinct `(assignment_id,logical_channel)` in X; no denominator.
- **Time / population / keys / source:** Replacement event P, X, assignment/channel; S01. Mode does not duplicate one shared physical replacement event.
- **Missing / limitations:** Two replacements count one channel; two assignments are two channels even for one unit. Not equivalent to current `is_replaced`, nor number of destination ports.
- **Drill / verification:** All events per key plus effective map; E08, E13. **Status: Implemented as a bounded replacement-activity diagnostic with direct exact distincts; offline semantics verified, live technical/query-plan verification pending; feasibility F1.**

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
- **Drill / verification:** Event histories and distinct units; E08→2/1, versus R02=1. **Status: Implemented as a bounded replacement-activity diagnostic returning event and unit counts plus the ratio; offline semantics verified, live technical/query-plan verification pending; feasibility F1.**

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

Primary quality counts **configuration keys K**, not final unique-unit disposition (D08). Historical assignments/criteria can create multiple K values for one unit; do not impose mandatory SM-and-MM testing on one physical switch. **Default: K with A activity written in P; separate All Current Configurations view.** Q04–Q06/Q08/Q11 evaluate that selected population at T; Q01/Q02/Q09 are historical testing flows and Q07 saved analysis history. Full coverage, known criteria/wavelength profile, source compatibility and current effective mapping are necessary for a whole-map pass; compatible composites are allowed. Unknown/missing coverage, too-good/review and unsupported profiles stay visible. Newer valid failures can reverse prior passes. `recommendations_available` (S06) may contain only optional or some required recommendations, not full recovery. Unit eligibility for T12 requires separately verified current unit outcome/date and no pending work; it is not obtained by counting K or treating Q04/Q05 as an exhaustive outcome partition.

**Threshold rule (D04, revised November 13, 2026):** S08 fails strictly `>`; S07 `_formal_failures` rounds to four decimals and fails `>=`. At exactly 2.5000 dB with a 2.5 saved limit, classification differs. On November 13, 2026 the owner chose the **source application's strict `>` rule (`LimitProfile.classify`) against each run's saved profile limits** for analytics, replacing the November 6 rounded `>=` preference. Unit lookup already uses this rule. Do not modify source rules, apply a global 2.5 dB to other saved profiles or merge criteria revisions. COC export behavior is separate and unchanged; labels must say which rule applied. COC support/export eligibility (including unsupported OSX-150 MM templates) must not become a product failure flag.

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
- **Drill / verification:** First measurement ID and criteria; E01, E07, E11/E15. **Status: Implemented for the authorized test-database diagnostic with strict D04; offline verified, live reconciliation and query-cost verification pending; feasibility F2.**

### Q03 — First-pass unit yield

Stable ID: `quality.first_pass_unit_yield`.

- **Question / formula / N-D:** What share pass the first full manufacturing test without retest/replacement? Retained Deferred question: D would be a verified unique-unit first-full-test cohort; N those passing required channels for the actual switch model/mode before corrective action. No mandatory second mode or new episode/completion action is implied.
- **Time / population / keys / source:** S01/S03/S10 lack immutable first-completion boundaries. Earliest accepted full-map observations are not proof of an immutable first manufacturing test; no proxy is approved.
- **Missing / limitations:** Distinct unit counts, C, Q04 or T12 finished eligibility alone cannot establish first pass. Resumed runs and prior partial tests complicate firstness. Final decisions do not revive this deferred metric or authorize a new workflow.
- **Drill / verification:** Earliest evidence, actual configuration, plan/coverage and prior actions; E01/E03/E07/E12. **Status: Deferred (D08); feasibility F3 for strict first-pass yield.**

### Q04 — Evaluations passing without recorded replacement

Stable ID: `quality.evaluations_passing_without_replacement`.

- **Question / formula / N-D:** Which configurations currently pass without recorded replacement in their assignment history? Count selected Q keys K with full effective front-panel pass and no valid replacement event through T; no denominator. A fraction would require an explicit assessable-Q denominator, not all starts.
- **Time / population / keys / source:** Current stock at extraction T; S01/S06–S08. Zero-replacement history is assignment-scoped, not just events in P. Compatible composites allowed, including source-permitted other purposes with provenance; no completion-in-P/write cutoff.
- **Missing / limitations:** Unknown history/criteria/mapping→unknown. Not first-pass yield: retests without replacement can produce a pass. Does not alone prove T12 unit eligibility/finished timestamp or manufacturing release; no mandatory multi-mode rollup.
- **Drill / verification:** Effective whole-pair provenance and action history; E01, E07, E13. **Status: Proposed; owner intent aligned, technical verification pending; feasibility F2.**

### Q05 — Evaluations passing after recorded replacement

Stable ID: `quality.evaluations_passing_after_replacement`.

- **Question / formula / N-D:** Which configurations currently have verified corrective recovery? Count selected Q keys K with documented prior formal failure, a valid corrective replacement after that failure, compatible later passing evidence on the effective port, and complete current configuration pass; no denominator. Optional optimization swaps alone do not qualify. This remains a count; Q11 defines the separate recovery percentage.
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

### Q11 — Verified corrective recovery percentage

Stable ID: `quality.corrective_recovery_fraction`.

- **Question / formula / N-D:** What share of definitively resolved corrective-replacement configurations recovered? N = verified corrective recoveries (Q05 keys) in the selected quality population; D = distinct K with documented corrective failure/replacement and a **definitively resolved current corrective outcome**, including verified recovered passes and authoritatively conclusively unrecoverable corrective cases. N must be a subset of D. Fraction=N/D; percentage=100*N/D, not recovered/all-tested, recovered/all-recommended, events or unit counts. Pending/uncertain cases are separate and excluded from D, never treated as failures or successes.
- **Time / population / keys / source:** Default K cohort has qualifying A writes in P; separate All Current Configurations selection. Evaluate corrective provenance/outcomes/current map at T, without an E evidence cutoff, under S01/S06–S09. Count K once despite repeated events/analyses. A newer fail or pending verification can remove a previously recovered K from resolved membership until source evidence conclusively resolves it again.
- **Missing / limitations:** D=0→No Data/null, always show N/D and pending/uncertain/unknown counts. Conclusive terminal evidence may be unavailable; Q07/Q08, insufficient candidates, a failing retest or a saved no-recovery status alone do not establish it. Missing terminal evidence means unknown membership/coverage, never a complete denominator or a falsely complete 100% from the known passing subset. Distinguish verified pending work from unverified resolution data. Do not infer final manufacturing reject/scrap (Q10). D04 classification and D15 consistency remain technical gates.
- **Drill / verification:** K→documented failure/event/later verification or conclusive-outcome evidence, current-state provenance, N/D/excluded key lists; E09/E14/E20/E27. **Status: Proposed; D08 numerator/denominator approved, pending technical verification; feasibility F2 for verified recoveries, F3 where conclusive resolution evidence is missing. Not production-ready.**

## Date, comparison and query-work contract

**Approved (D05/D13): America/Los_Angeles**, Monday–Sunday weeks, local calendar dates, initial ranges up to **366 calendar days**, daily/weekly/monthly/**yearly**/custom reporting. Resolve boundaries to UTC `[S,E)` using timezone rules; 366 calendar dates need not equal 366×24 UTC hours. Yearly reports handle leap years. **Default date range: last 30 complete Pacific Time calendar days**, excluding the partial current day. Remember the user's last selected model/mode filters between visits, while the date range still defaults to those 30 complete dates. For a new user, all-models/all-modes is a **proposal only, not separately approved**; do not claim this fallback is settled or silently save a previous date range as the default. Exact persistence mechanism remains future UI design.

| Preset | Local-calendar definition, converted once to UTC [S,E) |
| --- | --- |
| Last 30 complete days — approved default | From local midnight 30 dates before today through today's midnight; exclude the partial current day and label explicitly |
| Today | Local today's midnight through fixed extraction T; mark partial |
| Yesterday | Previous local midnight through today's midnight |
| This week | Monday local midnight through T; mark partial |
| This month | Local first-of-month midnight through T; mark partial |
| Last month | Previous month's first midnight through current month's first midnight |
| Custom dates | Inclusive first/last selected calendar dates become first midnight through midnight after last date; if last date is today cap at T and mark partial; reject future dates |

**Context-aware comparisons are approved:** equal-length rolling periods (default 30 complete dates versus preceding 30 complete dates), matching calendar periods for calendar selections, and matched partial periods where feasible. Preserve local date/week/month/year context rather than assuming equal UTC-hour exposure. Exact clipping, leap-day and ambiguous/nonexistent partial-time resolution need technical design/verification; disclose unequal exposure or comparison unavailable when no sound match is feasible. Other preset sketches above do not independently approve every edge-case behavior. Never add fixed 86,400 UTC seconds to obtain local tomorrow. DST dates can span 23/25 hours; repeated-hour events remain unique by UTC instant/ID. Group in Z and retain UTC bounds. Compare rates by percentage-point deltas from separate N/D; zero baseline percentage change is null/“new”. Pool duration sum/count with matching basis/cohort and n. Current-quality comparisons require verified past snapshots/as-of evidence and remain unavailable where that evidence is absent; choosing a comparison period does not manufacture it.

Use each metric's clock: starts V02; ends V03–V05/T01–T04; writes V01/V06–V13/Q01/Q02/Q09; replacements R01–R04; saved-analysis times R06/Q07. Secondary T09–T11 diagnostics use their explicit run selection, not actual work-date allocation. **Primary T12 uses latest verified current finished-outcome date for the whole all-history unit total**, restated at T; actual testing activity keeps its occurrence dates. R05/R07/Q04–Q06/Q08/Q11 are current stock at T, without a historical evidence cutoff. The default P-selected quality cohort must say “current quality of configurations with accepted production testing in P, evaluated at T”; All Current Configurations is separate. Neither is quality as of E or monthly historical pass counts. True historical as-of quality remains Deferred. Finished-unit period comparisons may restate both periods at the same T; show shifted outcome dates, population/source counts and incomplete results rather than immutable completion claims. Never sum daily distincts into period distinct totals; groups may overlap one unit/channel.

Current metadata pages do not supply totals: **≤31 UTC days, ≤100 rows/page, offset ≤1000** remain unchanged runtime guards, not a 366-day aggregation engine. Do not bypass them, scrape until a cap, broaden SELECTs or use the desktop read-all service. Future design may use bounded reviewed server aggregates or capped stable-key evidence queries; calendar windows must fit UTC guards after DST conversion. Total query/row/time and supporting-history budgets need technical selection and Stage B cost evidence. Supporting history outside P is allowed within approved bounds, including evidence after E through T for current stock and all qualifying earlier runs for T12. A bounded history that cannot establish a complete unit inventory yields incomplete/unknown, not a truncated complete total or a new testing episode. The product period cap does not erase older retests. No unbounded query is authorized.

Plan a **user-initiated extended-report path** with a clear long-running warning, visible progress/status and safe time/query/row/concurrency limits, cancellation and completeness reporting. Exact budgets and status design remain pending. It must not silently bypass normal safeguards or launch automatically. Potential ranges beyond 366 dates are future scope requiring review; an extended path is not automatic approval of a longer calendar range. No engine, worker, query or report UI is implemented in 4A.

Across windows, count events once by IDs; union exact distinct keys under a reviewed bound or compute distinctness server-side. Combine average sums/counts and rate N/D, not displayed means/rates. T12 counts each eligible unit once at its current verified finish date and computes statistics over full unit totals. Median/nearest-rank P90 require complete observations for the stated sample; never average group quantiles or silently replace the approved exact rank with a sketch/approximation. Query strategy remains unimplemented. Physical scans are possible with existing indexes; no new indexes, queries or infrastructure are authorized in 4A. Stage B plan/cost verification remains pending.

## Synthetic owner-alignment and future verification examples

These cases are independent unless explicitly sharing a history. All IDs are fictional DEMO identifiers; no actual records or source exports were read. Assume the documented clocks/populations, known saved criteria (illustrative 2.5 limit), non-boundary valid pairs, full coverage where stated, and one assignment unless specified. Cases encode owner-aligned expected behavior plus explicitly pending technical/formula choices; they are not executed application tests or evidence of source instrumentation.

| Case | Fictional evidence | Proposed count/result |
| --- | --- | --- |
| E01 | DEMO-U-A has two sequential complete/included full-48 runs in P, each 48 accepted pairs; elapsed durations 900 and 960 seconds, no repeats within either run | V01=1, V02=2, V03=2, V06=48, V12=48, V07=96, V08=0; V13=48 later-run observations under its proposed attribution contract. Secondary T01/T02=930, nearest-rank T03=960, n=2/Small Sample. T12 eligibility is not proved by C; if separately verified with complete inventory, unit elapsed total=1860, not 930. No active time inferred. |
| E02 | One complete/included 48-channel full plan, all 48 accepted pairs, 900 seconds | V03=1, V06=48, V07=48; T01 sample=900; T04=18.75 seconds/channel. “Complete” alone does not prove passing; require readings/criteria. |
| E03 | Complete/included two-channel plan [7,12], saved N=48, two accepted pairs, 120 elapsed seconds | V03=1, V06=2, V07=2; excluded from F/T01 but valid T10 elapsed sample=120. May contribute to a compatible composite; not a standalone full-48 timing or quality result. |
| E04 | Stopped/pending production run with ten accepted front-panel pairs and valid start/end | V01=1, V02=1, V03=0, V04=1, V06=10, V07=10; no F timing/finished quality claim. T10 may include valid elapsed and T09 could include verified active intervals if later available; incomplete lifecycle alone is not blanket timing exclusion. A `failed` variant increments V05, not scrap. |
| E05 | Complete run later marked superseded with another run's pointer | V02 audit category=1, but A/C contributions=0. Variant complete+included+pointer: helper Yes, report No, owner-approved C No; investigate contradictory state. No invented historical supersession timestamp. |
| E06 | Complete run marked excluded with void JSON | Retained W audit start=1; A/C contributions=0. No deletion, hardware failure or final rejection inferred. Q10 unavailable. |
| E07 | Same valid run/channel 7: day 1 accepted fail, then pass; day 2 accepted fail; both wavelengths stored per row | Combined V06=1, V07=3, V08=1, V09=2/3, V10=1/1; daily V06 totals sum to 2 but combined distinct remains 1. Day-2 repeat counts despite predecessor outside its period. Q01=1; Q02 first observation=1 failure/1; Q09 has one fail→pass and one pass→fail. Latest whole pair fails; do not keep the older pass. |
| E08 | One tested unit, same assignment/channel 19, recorded p19→p49 then p49→p50, followed by genuine p50→p19 reversal, all in P | After two events R01=2/R02=1/R03=2/1/R04=2/1, effective p50. After reversal R01=3/R02=1/R03=3/1/R04=3/1, effective p19; baseline mapping does not erase history. No missing-link exclusion or guessed administrative correction; no verification without later matching evidence. |
| E09 | Full effective 48-channel map, prior channel-19 failure, recorded p19→p49, later compatible passing pair on p49; other 47 pass | One Q05 evaluation; Q04=0; one replacement event. Recommendation alone or a pass before the event would not suffice. Not a final manufacturing release. |
| E10 | Saved DEMO analysis A1 reports `fail_no_viable_recovery`; later accepted measurement changes source fingerprint | Q07=1 historical analysis; A1 stale. Current R07/Q06/Q08 show Needs Reanalysis; no old favorable fallback or final disposition. R06 retains its saved cohort; missing usage link is not noncompliance. |
| E11 | Pair has a wavelength exactly 2.5000 with saved formal limit 2.5 | S08 strict classifier does not fail; S07 rounded COC does. Analytics follows S08 (D04, revised 2026-11-13), so this pair passes in analytics; COC export behavior is unchanged. |
| E12 | Completed/included run resumes, retains original start, clears end and remains included; hypothetical verified intervals run 0–10 minutes and 20–25 minutes | While ongoing helper No/report Yes/C-F No. After ending at minute 25, wall-clock=1500 seconds, hypothetical active=900, stopped gap=600; per-unit testing totals sum relevant run durations, not workflow span. Existing SQL lacks these interval facts, so actual active stays unavailable; gap is not automatically operator interruption. |
| E13 | Same unit has two historical switch assignments, each with logical channel 7 activity; each physical switch retains its actual SM or MM mode | Global V01=1, **V06=1**, V12=2. Replacement maps/history never cross assignment. Two K keys do not imply two units, mandatory multi-mode testing, two T12 contributions or verified finished eligibility; preserve attribution evidence. |
| E14 | Two failing logical channels but only one confirmed suitable measured extra port; other installed ports unmeasured | Known candidate set cannot cover both. Current partial/optional `recommendations_available` is not full recoverability; Q08 may count only with known complete input/allocation evidence. Total physical capacity/“ran out” remains unknown; V11 counts only actual accepted extra attempts. |
| E15 | Event exactly S/E; prior attempt before S; zero denominator; Los Angeles spring/fall DST days; dashboard visited on local 2026-11-06 | S included/E excluded; prior evidence can establish repeats. 2026-03-08 spans 08:00Z–next-day 07:00Z (23h); 2026-11-01 spans 07:00Z–next-day 08:00Z (25h). Default local dates Oct 7–Nov 5 become [Oct 7 07:00Z, Nov 6 08:00Z), 721h; compare preceding 30 complete dates. Remember model/mode, reset date default each visit; new-user all-models/modes remains only proposed. |
| E16 | Zero/negative or null elapsed duration; unknown plan/model; long resumed run; missing criteria; query budget exhausted | Metric-specific invalid/missing samples→excluded/unknown with reason. Unknown plan excludes F, not automatically valid generic elapsed. >5400s valid durations are flagged and included by default. Unverified unit outcome/date or missing constituent duration prevents a complete T12 value even when a run diagnostic exists. |
| E17 | Ordinary valid workflow with increasing attempts/timestamps; separate demonstrably inconsistent synthetic record with attempt 2 earlier than attempt 1 | Verify SQL/Python effective results agree for valid workflows; different sort expressions alone cause no flag. In inconsistent fixture, demonstrate divergent selected IDs, investigate source provenance and quarantine unresolved affected results; do not invent analytics chronology or favorable-loss override. |
| E18 | DEMO unit with saved N=50, all 50 channels in two sequential runs in one assignment/mode; first run has one extra accepted same-channel attempt | V06=50, V12=50, V07=101, V08=1, V09=1/101, V10=1/100, V13=50. Additional historical-assignment coverage keeps V06=50 but adds V12 keys; no mandatory second mode for a physical switch. No sum of daily distincts. |
| E19 | Same unit: run A has hypothetical verified active=600s/elapsed=1200s; run B active unknown/elapsed=1800s; complete two-run inventory and verified passing unit outcome/date in P, no pending work | Secondary T09=600 (n=1, missing=1), T10=1500 (n=2), T11=1200 (n=2, active=1/fallback=1). Primary T12 elapsed total/mean=3000 and combined total/mean=2400 (one unit), active total unknown/subtotal=600 excluded from complete-active mean. Unit n=1/Small Sample; combined active runs=1/fallback=1, units with fallback=1. Not current SQL interval evidence. |
| E20 | Compatible partial runs produce full passing K at T1; optional swap has no documented prior failure. Later valid failing retest after E, before T2, affects current effective port | Composite pass allowed at T1; optional work does not count Q05 corrective recovery. At T2 current pass is reversed even for a P-selected cohort; event stays at its true later timestamp, current quality is labeled at T2. Saved fingerprint becomes stale/Needs Reanalysis; historical as-of reconstruction remains Deferred. |
| E21 | Requested 366 calendar dates with bounded pre-period provenance; another request 367 dates; a required evidence slice hits budget | 366 is within approved initial range, not proof query budgets suffice. 367 is future longer-range scope, no bypass via extended path. Budget hit→explicit incomplete/unknown. Extended work requires user initiation, warning/status/resource controls; no engine implemented. |
| E22 | Complete eligible duration observations exactly 5400s and 5400.001s | First unflagged, second flagged. Default includes both: n=2/excluded=0, P90=5400.001, Small Sample. Exclude-flagged control gives n=1/excluded=1/P90=5400. For T12 apply to full unit totals, never remove constituent runs to lower a total. Keep both records and disclose configured threshold. |
| E23 | One verified finished unit has qualifying runs 21 days apart, durations 600s and 1200s, earlier run outside P; complete inventory, verified latest finish in P | T12 total=1800, n=1, not mean-run=900 or 21-day wall-clock span. Include both runs despite elapsed weeks. No episodes, reset or completion action; active-only unavailable if intervals absent, labeled elapsed/combined fallback allowed only with valid complete bounds. |
| E24 | Hypothetical authoritative outcomes/dates and complete totals: two passed units have 600s/2400s, one conclusively unrecoverable has 3000s; other unfinished/pending/uncertain units present | Passed mean=1500 (n=2); conclusively-unrecoverable mean=3000 (n=1); default overall=(600+2400+3000)/3=2000 (n=3), Small Sample. Each unit once regardless of run count. Other units excluded/reason-counted. Q07/Q08 cannot supply the hypothetical conclusive evidence. |
| E25 | Unit has verified passing finish Oct 20 with 600s. New Nov 4 testing changes current result to pending verification; later verified passing finish Nov 5 adds a 900s qualifying run | At pending extraction, remove from eligible finished summaries; activity stays Oct/Nov on actual dates. After verified finish, cumulative 1500 belongs once to Nov 5, including Oct's run; Oct finished summary restates without that unit. If new finish timestamp/outcome cannot be verified, no fabricated date/eligibility. No immutable snapshot invented. |
| E26 | Eligible series n=0, [600], values 1–9, and values 1–10; valid values shown despite small samples | n=0→No Data with exclusions; n=1→mean/median/P90=600, Small Sample. n=9→mean/median=5, rank=9/P90=9, Small Sample. n=10→mean/median=5.5, rank=9/P90=9, no Small Sample warning. Always display n/exclusions separately for each source/outcome group. |
| E27 | Selected K cohort has three verified corrective recoveries, one authoritatively conclusive unrecoverable corrective case, two verified pending/uncertain corrective cases and optional-only work | Q11 N=3/D=4=75%; pending/uncertain=2 separately, optional-only excluded. Default K membership comes from A writes in P, evidence evaluated through T. If conclusive evidence for the fourth resolved case is missing, resolution coverage becomes unknown/incomplete; do not fabricate D=4 or claim a complete 100% from the passing subset. No scrap inference. |

## Dashboard alignment recommendations

These are future mappings of owner-approved intent, **not implementation authorization or production-ready metrics**. All current screens and synthetic data remain unchanged.

| Existing panel / source | Owner-aligned future mapping | Clarification / gap |
| --- | --- | --- |
| Overview "Channels tested" / daily bars | V06 unit/logical-channel distinct; V12 technical coverage and V07 attempts separately | No sum of daily distincts for period totals. 50 repeatedly measured positions remain 50 per unit. |
| "Units completed" / configuration "units" | V01 tested units, V03 completed runs, T12 verified finished-unit sample distinctly labeled | C/run completion does not establish a finished unit. T12 requires verified unit outcome/date and complete duration; mock `unitsOf` adds buckets, not distinct units. |
| "First-pass yield" | Q03 Deferred | No first-pass manufacturing yield from composite/no-replacement buckets. |
| "Channel failure rate" / heatmap | Q01 historical coverage or Q02 first-observation fraction, with N/D | Saved limits/profile; strict `>` source classifier (D04, revised 2026-11-13). Fixed 2.5 dB/1310-1550 mock labels are not universal. |
| Average test time / histogram / query timing | **T12 primary per-finished-unit totals/statistics**, split passed/conclusively unrecoverable, default overall both; active/elapsed/combined sources | T09–T11 secondary run diagnostics, T01–T04 F-only elapsed. Include flagged valid durations by default; nearest-rank P90, Small Sample n<10, No Data n=0. No complete unit KPI without verified outcome/date/history; mock 920 seconds is not evidence. |
| Unit outcomes / Failures weekly stack / "Unrecoverable units" | Q04–Q06/Q08 current K stock at T; Q07 separate saved history | No exhaustive unit partition, historical cutoff or final scrap claim. Current pass can reverse after a later failure. Historical weekly quality snapshots require future evidence. |
| "Channels swapped per failing unit" | R01 events, R02 distinct assignment channels, R03 tested-unit and R04 replaced-unit ratios | Each ratio uses matching populations. Mock failed-channel/failed-unit ratio is not replacement workload. Genuine reversals count. |
| "Recovered after replacement" | Q05 recovery count; Q11 percentage of definitively resolved corrective K | Verified corrective recoveries / definitively resolved corrective-replacement configurations; show pending/uncertain and unknown coverage separately. Optional-only work and inadequate candidates do not establish recovery or terminal failure. |
| "Retested channels" / station retest rate | V08/V10 run-channel retests, V09 attempt share, V13 cross-run observations | Different grains; show n/context. Station included; operator details/ranking not authorized. |
| Failure hotspots / extra-port trend | Q01/Q02 for testing flows; R05/Q08 for current candidate context | Confirmed suitable candidates include deployed; unknown availability is not physical exhaustion. Fixed mock spare counts are illustrative. |
| "Are operators following the analysis?" | R06 historical linkage; R07 current fresh guidance | No behavior/noncompliance inference from missing link. Stale current guidance says Needs Reanalysis. |
| Unit explorer losses/map/history | Source S05/S06 effective behavior with Q/R provenance | Whole pairs/current map, historical assignments/criteria, Unknown/Needs Review and stale states. No competing chronology. Private evidence views require authorization. |
| Queries library/schema | Reviewed bounded reports only | Mock columns/SQL are illustrative. 366-day product intent does not bypass existing runtime guards. No arbitrary SQL or extended engine in 4A. |

## Owner decision register

**Source of approval: supplied owner decisions and final owner update, dated 2026-11-06.** D05/D06/D07/D08/D14 reflect the final update superseding earlier proposals; other approvals are preserved. Approval records intended behavior, not production readiness. Technical blockers and missing evidence remain open. Affected shorthand maps to stable IDs above. There are exactly 15 decision rows.

| Decision | Approval date / status | Approved intent | Affected metrics / contracts | Evidence limitations and remaining verification |
| --- | --- | --- | --- | --- |
| D01 | 2026-11-06 — Approved intent | Separate W recorded production workload, A accepted production activity, C completed production results; C = production/complete/included/no pointer. Audit voided/superseded history separately. | V01–V13; T01–T12 population gates; Q context | S02/S04 differ operationally after resume (S03/S11). Verify restated eligibility/joins; no universal completion gate on valid incomplete contributions. |
| D02 | 2026-11-06 — Approved intent | V06 distinct unit/logical-channel coverage per P; separate assignment/mode coverage, attempts, within-run repeats and cross-run remeasurement. Never sum daily distincts. | V06–V10/V12/V13; Q02/Q09 labels | S01/S05 support separate grains; verify exact cross-run attribution and bounded predecessors. No approved default diagnostic filter or invented chronology. |
| D03 | 2026-11-06 — Approved intent | Production workload uses production records only. Source-compatible other-purpose evidence may contribute technical evaluations with provenance; no manufacturing-yield claim. | W/A/C, all volume/timing workload; R production attribution; Q03–Q08/Q11/R05/R07 technical stock | S06/S07 purpose/completion are not technical compatibility gates. Verify provenance and production attribution of unlinked events; retain unclassified audit history. |
| D04 | 2026-11-06 preference; **revised 2026-11-13 — decided** | Analytics uses the source application's strict `>` classification (`LimitProfile.classify`) against each run's saved profile limits. The November 6 rounded COC `>=` preference is withdrawn for analytics; COC export behavior is unchanged. | Q01–Q09/Q11; T12 outcome evidence; R05/R07 candidate/recommendation qualification | S07 (COC) and S08 still differ at exact-limit values; analytics follows S08. Label the rule on every classified value; no source rule change. |
| D05 | 2026-11-06 — Final defaults/comparison intent approved | America/Los_Angeles, Monday–Sunday/DST-safe boundaries. Default last 30 complete local dates each visit; remember last model/mode filters. Context-aware equal rolling, matching calendar and matched partial comparisons where feasible. | All clocks/filters/comparisons; default quality P membership | New-user all-models/all-modes fallback remains proposed, not separately approved. Verify DST/leap/partial alignment and persistence semantics. No historical quality comparison without authoritative snapshots. |
| D06 | 2026-11-06 — Final per-unit intent approved; source gaps open | T12 primary: sum all qualifying runs per verified finished unit, including retests days/weeks apart; no inter-run gaps or episodes. Prefer run-active excluding Stop/Continue idle, else labeled elapsed. Secondary run diagnostics retained. | T01–T12; primary T12 | S01/S03/S10 lack reliable active intervals; unit outcome/date/history completeness also needs verification. Do not use first-start/final-end across runs or fabricate totals; no new completion actions. |
| D07 | 2026-11-06 — Final statistics/defaults approved | Include valid >90-minute values by default, strictly > threshold flag, configurable threshold/control retained. Average/median/nearest-rank P90 ceil(0.90*n) for n>=1; Small Sample n<10, No Data n=0; always n/exclusions. | T01–T04/T09–T12; all duration presentation | Verify complete basis-specific run/unit samples, rank and exclusion arithmetic. Never drop constituent runs to make a unit total appear complete; no averaged quantiles or approximate substitute. |
| D08 | 2026-11-06 — Final cohort/recovery intent approved; first-pass Deferred | Default K with accepted production testing activity in P; separate All Current Configurations. Current effective evidence/map at T, compatible composites, later failure reversal. Q05 documented corrective recovery; Q11 recovered / definitively resolved corrective K, pending/uncertain separate; optional work excluded. | Q03–Q06/Q08/Q11; Q01/Q02/Q09 historical distinction | S06–S09 provenance, full coverage/freshness and conclusive resolution need verification; inadequate candidates do not prove unrecoverability. D04 remains open. No mandatory multi-mode testing; first-pass yield Deferred. |
| D09 | 2026-11-06 — Approved intent | Recorded replacement events primary; distinct assignment channels, both matched unit ratios, genuine reversals; exclude only verified administrative errors. Valid unlinked events count; historical analyses separate from current fresh guidance, stale -> Needs Reanalysis; no noncompliance inference. | R01–R04/R06/R07; Q05–Q07/Q11 | S01/S09 establish events/linkage/fingerprints, not administrative-error authority. Verify correction evidence, numerator membership, latest applicability and full freshness; missing links not proof of behavior. |
| D10 | 2026-11-06 — Approved intent | Denominator confirmed suitable candidates including deployed; distinguish insufficient verified candidates, unknown availability and proven lack of recovery options. No physical capacity/scrap inference. | R05/Q06/Q08; Q10 boundary | S06/S09 complete allocation and candidate suitability must be verified. Unmeasured ports/designation counts do not prove exhaustion; criteria and current stock at T must match. |
| D11 | 2026-11-06 — Approved intent; operator access unapproved | Historical assignment/configuration/model/mode/N/criteria override mutable hardware; missing/conflict Unknown/Needs Review. Station included; operator detail requires authorization, no automatic ranking/unauthenticated identities. | All G/groupings/drill-downs, V01/V06/V12, Q/R stock | S01/S06/S10 snapshot completeness/normalization needs review. Identity/disclosure controls not implemented. Do not silently fill missing historical values from current hardware. |
| D12 | 2026-11-06 — Current-state intent approved; as-of Deferred | Testing events retain actual times; quality uses latest valid effective evidence/map at T, labeled restated current-state. No historical cutoff. Final D06/D14 makes finished-unit summaries restated by latest verified finish date. | Q04–Q06/Q08/Q11/R05/R07; T12; event clocks/Q07 freshness | S03/S06/S09 mutable state cannot prove historical as-of quality. Verify P cohort separately from T evidence and unit finish-date provenance; no immutable completion snapshot inferred. |
| D13 | 2026-11-06 — Product scope approved; execution design pending | Up to 366 calendar dates; daily/weekly/monthly/yearly/custom; bounded supporting history, exact distincts, explicit incomplete results. Plan user-initiated extended report with warning/status/safe controls; longer ranges future. | All period totals, V01/V06/V12 distincts, duration distributions, Q supporting history | Existing ≤31-day/100-row/1000-offset metadata guards unchanged. Budgets/lookbacks, plans, aggregation and extended path design need verification/review; no unbounded work or engine in 4A. |
| D14 | 2026-11-06 — Final finished-unit intent approved; missing sources unresolved | Primary per-unit KPI: passed and conclusively unrecoverable finished units, separate means/default overall both, each unit once; exclude unfinished/pending/uncertain. Attribute full accumulated duration to latest verified finish, recalculate on changed results. Active/elapsed/combined options and source counts; actual SM or MM/history, no required extra configurations/episodes/actions. | T12 primary, T01–T11 diagnostics/unsupported proposals; Q03/Q10/Q11 | S01/S03/S06/S09/S10 may not establish terminal outcome/finish date or duration completeness. Run completion, Q07/Q08 or insufficient candidates cannot prove eligibility; no manufactured outcome, active value or complete total. Final manufacturing disposition needs future source evidence. |
| D15 | 2026-11-06 — Approved intent; consistency verification pending | Follow existing source effective behavior for valid records; no competing chronology. Intended valid SQL/Python results agree. Different expressions alone do not justify flags; investigate demonstrated inconsistency without override. | V08–V10/V13; Q01–Q09/Q11; T12 outcome evidence; R05/R07 provenance | S05/S06/S07 have different projection scopes/order expressions. Verify valid workflow consistency and investigate actual contradictions; do not quarantine ordinary valid records solely from code differences. |

## Remaining owner details and technical gates

Owner item not separately approved: the proposed all-models/all-modes fallback for a new user without saved filters. Default 30 complete dates, context-aware comparisons, remembered model/mode, duration include-flagged default/P90/sample policy, primary finished-unit population/date and quality/recovery denominator are now settled in intent. Exact comparison edge-case handling and secondary ongoing-run presentation remain technical design, not permission to invent another primary cohort or episode workflow.

Technical verification remains: threshold/rounding reconciliation; valid-workflow source-effective consistency; historical identity and full unit-run inventory, including long-separated retests and supplemental work; verified current unit outcomes/latest finished dates and resolved corrective outcomes; missing active intervals; corrective sequence/current-map evidence; current recommendation applicability/freshness; candidate suitability/full allocation; authoritative administrative-error evidence; All Current Configurations inventory semantics; DST/comparison/persistence behavior; bounded history/exact aggregation/incomplete status and non-production acceptance. Source evidence establishes code/schema facts, not real stored-record quality. Missing conclusive failure/date or complete history can block T12/Q11 even when elapsed diagnostics or recovery counts are available; active-only T05/T09/T12, interruption T06, uninterrupted T07, final disposition Q10 and historical as-of remain unsupported/deferred as specified. T08's episode/workflow-span proposal is superseded, not a planned requirement.

## Implementation sequence

The first authorized Milestone 4B slice implements V06 with V07/V11 and distinct-unit/run companions as a bounded diagnostic. Live technical/query-plan verification remains pending. Every other catalog item still requires its own authorization and evidence; V08–V10/V13 require predecessor verification, and R01–R04 require matched populations/correction evidence. T12 remains the primary duration contract and must stay unavailable/incomplete wherever unit outcome/date or full history cannot be verified; the earlier elapsed run diagnostic cannot substitute for it. Current quality/recovery still requires threshold, resolution, provenance, candidate and freshness acceptance.

Do not treat semantic approval as completed queries, classification or production readiness. First-pass yield/historical as-of remain Deferred; no episodes, extra configurations or completion actions are authorized. Use E01–E27 as future fixtures; no application tests were changed. Prior reconciliation is committed at the reference baseline; this final documentation update introduces no database connection, source change, real-data endpoint, extended engine, commit or push.
