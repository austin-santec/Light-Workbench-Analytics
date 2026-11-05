# Production metric definitions — Milestone 4A

**Owner review draft, November 5, 2026. No new metric is Approved.** This is the canonical definition/decision document; it authorizes no implementation, database connection, schema change or real-record HTTP access. Milestone 3 Stage B remains pending. The dashboard's synthetic values/formulas are design examples, not evidence about manufacturing. Proposed verification examples below are entirely fictional.

## Evidence index

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

| Current production record | Lifecycle helper S02 | Default desktop report S04 | Proposed closed-result population C |
| --- | --- | --- | --- |
| complete + included + null superseding pointer | Yes | Yes | Yes |
| stopped/failed + pending | No | No | No; keep in operational activity |
| in_progress + included after a completed run is resumed | No | Yes | No |
| complete + pending | No | No | No; needs disposition review |
| stopped/failed + included via explicit disposition/lower-level API | No | Yes | No |
| complete + included + non-null superseding pointer | Yes | No | No; flag contradictory state |
| complete + superseded or excluded/voided | No | No | No |
| engineering/training/calibration + complete + included | No | No | No; technical projection treatment is a separate decision |

The rules began in different features/commits (S11); purpose separation is explicit, but intentionality of the completion omission is **not established**. The helper has test callers only in the reviewed tracked tree. The desktop Reports dialog reaches `DatabasePrimaryWorkflow.reporting → DatabaseReportingService.search → _matches`; the current analytics metadata repository independently reproduces the report rule. No source change is proposed here.

Normal new-run/close transitions largely align the rules: pending initially, complete becomes included, stopped/failed become pending. They do **not** make disagreement merely theoretical: desktop continuation/retest calls `resume_run`; SQL accepts reopening complete/stopped/failed, sets in-progress/end=NULL, and does not reset included. Reporting can include a reopened completed run. Lower-level `finish`/explicit `set_analysis_status`, historical records, and retained pointers after other operations can also diverge. SQL CHECKs validate each vocabulary and a non-self FK, not all lifecycle/disposition/pointer combinations. Standard supersession sets status and pointer together, but a pointer is still a useful defensive KPI exclusion. Historical prevalence and human intent remain unknown without an approved data review.

Proposed categories (D01–D03, not approved):

- **W — recorded workload:** all production run records, including zero accepted measurements, with voided/superseded categories shown separately. Do not equate physical effort with accepted output.
- **A — accepted front-panel activity:** production source run, not excluded/superseded and pointer NULL at extraction; any lifecycle/analysis inclusion state otherwise, including pending/stopped/ongoing. Require accepted logical-role pair, known positive run boundary N, logical channel `1..N`. This preserves incomplete work without calling it finished quality.
- **C — closed results:** production + complete + included + pointer NULL. Lifecycle complete can mean a complete two-channel plan; it does not imply a full unit test or a pass.
- **F — full-plan closed runs:** C plus valid immutable model/mode/N, explicit planned-channel set exactly `1..N`, a front-panel full plan (not extra-only/short retest), and accepted paired coverage of every required channel. Missing plan/coverage is unknown, not inferred from N or `complete`.
- **Q — effective-quality evaluations:** one latest qualifying C context per `(assignment_id, wavelength_mode, N, criteria signature)` with context completion in P, ordered by completion then run ID. Preserve this cohort key, called K. Proposed event cutoff is that context's end: no later-written measurements/replacements/spare events may influence its assessment. Dispositions still reflect current state at T, so this is a restated evaluation, not an immutable historical result. Source projectors load current state; they are not ready-made historical-cutoff analytics queries. D08/D12 must approve this proposal versus a separately labeled current-at-T stock view. Count K until a unique-unit rollup is approved; do not relabel K as unique units. Technical history may contain pending/partial or non-production runs under S06/S07; D03 must decide whether to permit that with provenance or restrict/relabel the result. Never silently change source technical rules to obtain production yield.

## Shared contract conventions

P is the half-open UTC interval `[S,E)` derived from an approved business timezone Z; T is extraction time. A/C predicates use the source's **current state at T**. Lifecycle/analysis-state history is not fully persisted, so these are restated reports of timestamped facts, not guaranteed historical “as known at E” reconstructions. Void JSON/saved analysis snapshots provide some history, not complete status/session history (D12).

Joins: runs→assignments via `assignment_id`; assignment→unit/switch by `unit_id`/`switch_id`; measurements→runs by `run_id`; replacements/spares→assignment; analyses→context run; recommendations→analysis; optional replacement→recommendation by `source_recommendation_id`. Aggregate each child grain before joins or count distinct event/measurement IDs; joining attempts × replacements × recommendations multiplies rows.

Grouping G: saved model from valid `limit_snapshot_json` and corroborating hardware snapshot; `wavelength_mode`; **run** `front_panel_channel_count` (24/36/48 where present, not assumed exhaustive). Do not use current unit count or SCPI count as historical capacity. Snapshot conflicts go to an unknown/review bucket. Current `SWITCHES.switch_model` is an identity lookup, not an immutable historical quality label. Station uses nullable run station; operator uses run `tested_by` or measurement `written_by` according to event grain, with no guessed person mapping or unauthenticated disclosure (D11).

Saved measurement classification/source profile and timing-profile revision may distinguish procedures within the same model/mode/N. D11 must decide comparable cohorts before pooling elapsed/quality results; a mode label alone does not certify a native, identical acquisition procedure.

Each catalog item below specifies its question, formula/N-D, time/population, SQL evidence/keys, missing/limitations, drill-down, verification and status. Shared rules are inherited explicitly: counts are integer facts (no denominator); zero is valid only after complete query coverage. Missing evidence is null/unknown, never zero/pass. Ratios with zero denominator are null; publish numerator/denominator and unknown/excluded counts. Distinct units/channels are not additive across dates/configurations; means use sum/count, rates use pooled N/D. Rounding is for display only after decimal comparison rules are approved. Every drill-down is a future protected evidence view, not an authorized API/export.

First/latest selection also needs D15: SQL's per-run attempt/ID order and Python's written-time/attempt/ID order can disagree on anomalous historical timestamps. Proposed default is whole-pair UTC chronology with explicit anomaly flags; do not pick the most favorable loss or silently rely on the SQL current view for every metric.

Feasibility is independent of approval: **F1** existing scalar facts; **F2** existing history/JSON/projections plus rule/provenance review; **F3** authoritative data missing for the requested interpretation. All need future bounded query work and Stage B verification. Approval states are **Proposed**, **Needs owner decision**, **Approved**, **Deferred**, **Not supported by current data**; no catalog entry uses Approved.

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
- **Drill / verification:** Run start, disposition, accepted-row count; E01, E04–E06, E12. **Status: Needs owner decision; feasibility F1.**

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

- **Question / formula / N-D:** How much distinct front-panel coverage occurred? Count distinct `(assignment_id,wavelength_mode,logical_channel)` with A writes in P; no denominator.
- **Time / population / keys / source:** Measurement write time; A; S01/S05. Repeated attempts/runs within an assignment/mode count once per selected period; different assignments remain separate.
- **Missing / limitations:** Missing N/role is unknown. Physical ports and wavelengths do not multiply channels. One channel tested on two days counts in each day but once in the combined period; call this activity coverage, not finished capacity (D02).
- **Drill / verification:** Assignment/channel and contributing attempts; E01, E07, E13. **Status: Needs owner decision; feasibility F1.**

### V07 — Accepted front-panel measurement attempts

Stable ID: `volume.accepted_logical_attempts`.

- **Question / formula / N-D:** How many persisted measurement actions were accepted? Count distinct `measurement_id` in A/P; no denominator. A paired two-wavelength row is one attempt.
- **Time / population / keys / source:** `written_at_utc`; A; measurement ID/unique UUID for retry diagnostics; S01/S05. Keep all accepted attempts, not only current views.
- **Missing / limitations:** Missing IDs/invalid roles excluded with diagnostics. Temporary/rejected/unwritten readings are absent, so this is not hardware request count. Superseded attempts within a valid run still count as activity.
- **Drill / verification:** Run/channel/attempt/paired wavelengths; E01, E07. **Status: Proposed; feasibility F1.**

### V08 — Run-channels retested

Stable ID: `volume.retested_run_channels`.

- **Question / formula / N-D:** Which run-channels received another accepted attempt? Count distinct `(run_id,logical_channel)` with an A attempt in P preceded by an accepted attempt in that same run/channel; no denominator.
- **Time / population / keys / source:** Later attempt write time; A; S01/S05 history, ordered written-time/attempt/ID. Predecessor may predate P.
- **Missing / limitations:** Need actual prior evidence, not just `attempt_number>1`. Same channel in a new run is not a within-run retest here; a separate cross-run definition needs D02 approval. Repeated later attempts count one run-channel.
- **Drill / verification:** First/later measurement IDs; E01, E07, E15. **Status: Needs owner decision; feasibility F2.**

### V09 — Retest-attempt share

Stable ID: `volume.retest_attempt_share`.

- **Question / formula / N-D:** What share of accepted workload is repeat attempts? N = A attempts in P with prior same-run/channel evidence; D = V07; ratio N/D, not V08/V06.
- **Time / population / keys / source:** Later write time; A; measurement ID for N/D, prior lookup as V08; S01/S05 and source report's per-run attempt grouping S04.
- **Missing / limitations:** Missing predecessor history makes coverage uncertain; zero D→null. Across-run repetitions are not included in N. Do not label as percentage of channels retested.
- **Drill / verification:** N/D attempt lists; E07 gives 2/3, not 1/3. **Status: Needs owner decision; feasibility F2.**

### V10 — Retested run-channel share

Stable ID: `volume.retested_run_channel_share`.

- **Question / formula / N-D:** What fraction of active run-channels were retested? N = V08; D = distinct `(run_id,logical_channel)` with A activity in P. This D differs from V06's assignment-channel grain.
- **Time / population / keys / source:** Write-time P; A; run/channel keys; S01/S05. A prior attempt before P is allowed if a repeat occurs within P.
- **Missing / limitations:** Zero D→null; prior-history gaps unknown. Rates across groups require pooling N/D, not averaging displayed rates. Same unit/channel may appear in several run keys.
- **Drill / verification:** Numerator/denominator run-channels and predecessors; E01, E07, E15. **Status: Needs owner decision; feasibility F2.**

### V11 — Accepted extra-candidate attempts

Stable ID: `volume.accepted_extra_attempts`.

- **Question / formula / N-D:** How much recorded supplemental candidate testing occurred? Distinct measurement IDs with `measurement_role=extra_candidate`, physical port above a known positive run N, and A's parent-run validity/purpose, in P; no denominator.
- **Time / population / keys / source:** Written time; role-specific population (not A's logical-role predicate); S01/0006; measurement ID, group by assignment/physical port or G.
- **Missing / limitations:** Logical channel is NULL by design. Missing boundary/candidate context is unknown; unaccepted probing is not represented. Never add to V06 or treat as finished front-panel coverage.
- **Drill / verification:** Role, port, parent run, boundary; E14. **Status: Proposed; feasibility F1.**

## Duration catalog

Priority cohort is **OSX-150 / SM / 48 front-panel channels**, not the switch's reported SCPI routing count. Preserve separate OSX-100/150, SM/MM and saved N cohorts; do not assume all configuration combinations exist. Nullable station/operator grouping needs D11 approval. Complete-short and composite tests are not full standalone timings.

SQL start/end measure persisted run-record wall-clock elapsed time. S10's snapshot has `timing_profile` **settings**, not measured durations. SQL repositories persist no `switch_test_sessions`/accumulated active duration; the local `SwitchTestTimer` measures session elapsed, not pure hardware busy time, and is not a SQL analytics source. Resume keeps original start, clears end, then later finish supplies a new end. Thus start→final end can include pauses, closure gaps, continuations and retests. Inter-write gaps cannot separate operator idle from hardware settling/processing. Station/operator recorded at run creation may not identify who performed every later continuation.

Proposed elapsed arithmetic retains the source timestamp's millisecond resolution, converted to seconds; do not copy the mock SQL's integer second-boundary counting as an exact subsecond duration definition.

### T01 — Mean completed full-plan run elapsed seconds

Stable ID: `duration.mean_full_plan_run_elapsed_seconds`.

- **Question / formula / N-D:** How long do recorded full-plan runs remain open? N = sum `(end-start)` in seconds; D = valid F run count. Proposed default: per run, priority cohort above, including passing and failing results; never call this active measurement time.
- **Time / population / keys / source:** End in P; F, matching saved model/mode/N; run key; S01/S03/S10 and plan/coverage JSON/history. Include resume gaps with explicit warning; absence of resume evidence cannot prove uninterrupted execution.
- **Missing / limitations:** Exclude null end, ongoing/non-C, nonpositive duration, unknown/conflicting config/plan/coverage, short/extra-only/composite cases. Flag long outliers; do not silently trim (D06/D07). Need excluded counts and sample size. Per-unit means would weight repeat runs differently and are not the proposed default.
- **Drill / verification:** Start/end, delta, plan, N, coverage and flags, no invented active time; E01–E04, E12, E16. **Status: Needs owner decision; feasibility F2.**

### T02 — Median completed full-plan elapsed seconds

Stable ID: `duration.median_full_plan_run_elapsed_seconds`.

- **Question / formula / N-D:** What is the typical elapsed observation? Median of T01's exact eligible per-run durations; for even n average the middle two. No ratio; n is sample count.
- **Time / population / keys / source:** Same end-time/F/G/run sample as T01; S01/S03/S10.
- **Missing / limitations:** Inherit T01 exclusions/gap caveat; no samples→null. Do not compute median of group medians. Small-sample display policy is pending D07.
- **Drill / verification:** Ordered duration sample and excluded counts; E01→930 seconds for [900,960]. **Status: Proposed; feasibility F2.**

### T03 — P90 completed full-plan elapsed seconds

Stable ID: `duration.p90_full_plan_run_elapsed_seconds`.

- **Question / formula / N-D:** How slow are the upper-tail observations? Proposed nearest-rank sorted duration at `ceil(0.90*n)`; no ratio. Histogram bins must count the same sample.
- **Time / population / keys / source:** Same sample/time/run grain as T01; S01/S03/S10.
- **Missing / limitations:** Empty→null; n and quantile convention visible. Do not average subgroup P90s or fit a synthetic normal curve as observed data. D07 must approve method/minimum sample.
- **Drill / verification:** Ordered sample/bin edges; E01→960 with nearest rank. **Status: Needs owner decision; feasibility F2.**

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
- **Missing / limitations:** Null/unavailable for current SQL. Configured settling/sample timings and timestamp differences do not measure busy time. Instrumentation/schema changes would need separate authorization.
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
- **Missing / limitations:** `max(end)-min(start)` across all unit history can span switch replacements/days and is not an approved session. No reliable current value; D06/D14 must settle workflow identity and endpoint before new data design.
- **Drill / verification:** Future session and constituent run timeline; E01, E12/E13. **Status: Deferred; feasibility F3 for the requested workflow.**

## Replacement catalog

Replacement event history X uses `replaced_at_utc` in P and assignment→unit. It includes recorded events even when a related run later becomes voided/superseded or `related_run_id` is NULL; show attribution/validity separately (D09). This preserves physical-work documentation. Do not inherit the desktop report's filtered-run linkage silently. Corrections/reversals still produce records; X is recorded events, not verified physical operations. Model/mode attribution needs a linked immutable context; unlinked events stay unclassified. No hardware operation is inferred.

### R01 — Recorded replacement events

Stable ID: `replacement.recorded_events`.

- **Question / formula / N-D:** How many replacement records were appended? Distinct `replacement_id` in X; no denominator.
- **Time / population / keys / source:** Event time, X, replacement ID; S01/S06. Repeated replacements of one channel remain separate events.
- **Missing / limitations:** Missing related run must not drop the event; missing event time is unknown. Saved recommendations are not events. Correction/verification interpretations need D09.
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
- **Missing / limitations:** Zero D→null. Excludes replacement-only units outside the tested cohort from N; not necessarily equal to all R01/V01. This is period activity, not lifetime replacements per manufactured unit (D09).
- **Drill / verification:** Tested unit cohort and linked events; E08 with one tested unit→2. **Status: Needs owner decision; feasibility F2.**

### R04 — Replacement events per unit with a replacement record

Stable ID: `replacement.events_per_replaced_unit`.

- **Question / formula / N-D:** How much repeat replacement work occurred among affected units? N = R01; D = distinct unit IDs reached by X, including replacement-only units.
- **Time / population / keys / source:** Event-time P; X; events and unit grain; S01.
- **Missing / limitations:** Zero D→null. “Requiring replacement” could instead mean a recommendation/failed result; that population is not equivalent to performed-record membership. Use this explicit label unless D09 chooses another metric.
- **Drill / verification:** Event histories and distinct units; E08→2/1, versus R02=1. **Status: Needs owner decision; feasibility F1.**

### R05 — Confirmed-extra-port deployment fraction

Stable ID: `replacement.confirmed_extra_port_deployment_fraction`.

- **Question / formula / N-D:** How many measured/qualifying extra ports are currently deployed? At one Q/context cutoff, D = distinct confirmed eligible extra-candidate ports, including those now in use; N = those ports used in the effective current front-panel map. Key `(assignment_id,physical_port)`.
- **Time / population / keys / source:** Context evaluation/end P, not event-flow total; S01 extra/map views plus S06 eligibility/history. Compare N/D for the same cohort/criteria/cutoff.
- **Missing / limitations:** Incomplete candidate-query/qualification coverage→unknown, zero known D→null. This labeled ratio does not require or claim total installed capacity. `DESIGNATED_SPARES` is an independent event projection; emergency spare designations are not proof of passing candidates. D10 must approve denominator/label.
- **Drill / verification:** Measured role/port, criteria, current mapping, spare designation events; E08, E14. **Status: Needs owner decision; feasibility F2; total-physical-capacity utilization F3.**

### R06 — Saved recommendation linkage share

Stable ID: `replacement.saved_recommendation_usage_share`.

- **Question / formula / N-D:** Which saved recommendations have a recorded usage link? D = distinct recommendation IDs from analyses saved in P; N = those IDs referenced by a replacement by T. Split required/optional and analysis validity.
- **Time / population / keys / source:** Analysis `analyzed_at_utc` cohort, replacement linkage through T; S01/0004 `vw_ReplacementRecommendationUsage`, S09; recommendation ID, not analysis count or port.
- **Missing / limitations:** Missing link is unknown usage, not proof of noncompliance. Repeated saved analyses repeat opportunities; latest-only versus all saved cohorts needs D09. Unknown freshness is separate. Zero D→null.
- **Drill / verification:** Analysis→recommendation→event IDs and time-to-link; E08/E10 plus repeat-snapshot verification. **Status: Needs owner decision; feasibility F2.**

## Quality catalog

Q counts **evaluation cohorts K**, not final unique-unit disposition. One unit in two modes or assignments may contribute two K values; D08 must define required modes and a unique-unit rollup. Full coverage, known criteria/wavelength profile, source compatibility and effective physical mapping are necessary for a positive whole-map assessment. Unknown/missing coverage, too-good/review and unsupported profile states must remain visible rather than becoming pass/fail zeroes. Under S06, `recommendations_available` may contain only optional or only some required recommendations; it does not prove full recovery.

**Threshold conflict:** S08 fails strictly `>`; S07 `_formal_failures` rounds to four decimals and fails `>=`. At exactly 2.5000 dB with a 2.5 saved limit, classification differs. Do not silently choose a comparator, use a global 2.5 dB limit for OSX-100/MM, or merge mixed criteria revisions. D04 blocks final quality formulas at boundaries. COC support/export eligibility (including unsupported OSX-150 MM templates) must not become a product failure flag.

### Q01 — Logical channels with a failing accepted attempt

Stable ID: `quality.channels_with_failing_attempt`.

- **Question / formula / N-D:** Which front-panel channels exhibited formal failure evidence? Distinct `(assignment_id,mode,logical_channel)` among A attempts in P failing at either wavelength under that run's saved, approved criteria; no denominator.
- **Time / population / keys / source:** Written time; A; S01/S08 and D04 comparator. One failing pair/channel is not two failed channels or a failed unit.
- **Missing / limitations:** Missing criteria/boundary unknown, later passing attempts do not erase historical failure activity. Not current failure count or first-pass yield.
- **Drill / verification:** Failed pair, both wavelengths, saved limits and subsequent history; E07, E11. **Status: Needs owner decision; feasibility F2.**

### Q02 — First-observation run-channel failure fraction

Stable ID: `quality.first_observation_run_channel_failure_fraction`.

- **Question / formula / N-D:** What share of first recorded channel observations fail? D = first accepted logical pair per `(run_id,logical_channel)` whose first-write time is in P and parent satisfies A; N = those pairs failing either saved-limit comparison.
- **Time / population / keys / source:** First-ever write for the run/channel, then period filter; S01/S05/S08, D04. Prior-history lookup required; do not select first row only inside P.
- **Missing / limitations:** Exclude/identify unknown criteria/history; zero D→null. A new retest run has its own first observation, so this is explicitly not first-pass unit yield. Heatmaps can split N/D by logical position and G.
- **Drill / verification:** First measurement ID and criteria; E01, E07, E11/E15. **Status: Needs owner decision; feasibility F2.**

### Q03 — First-pass unit yield

Stable ID: `quality.first_pass_unit_yield`.

- **Question / formula / N-D:** What share pass the first full manufacturing test without retest/replacement? Desired D = unique unit/workflow first-full-test cohort; N = those first full evaluations passing every required channel/mode before any corrective action.
- **Time / population / keys / source:** Desired first-full-test completion, unit/workflow/mode policy; S01/S03/S10 lack immutable first-completion/session boundaries. Earliest accepted full-map observations could be a separately labeled proxy, not a proven first-test event.
- **Missing / limitations:** Distinct unit counts, completed runs, or “no replacement” alone cannot establish first pass. Resumed runs and prior partial tests complicate firstness; multi-mode requirements unknown (D08/D14).
- **Drill / verification:** Earliest evidence, full plan/coverage, prior actions, required modes; E01/E03/E07/E12. **Status: Needs owner decision; feasibility F3 for strict workflow yield, F2 for an explicitly approved observation proxy.**

### Q04 — Evaluations passing without recorded replacement

Stable ID: `quality.evaluations_passing_without_replacement`.

- **Question / formula / N-D:** Which evaluated configurations pass at the selected cutoff without recorded replacement in their assignment history? Count Q keys K with full effective front-panel pass and no replacement event through context cutoff; no denominator. A fraction would use all assessable Q, not all starts.
- **Time / population / keys / source:** Q context completion in P; S01/S06–S08. Zero-replacement history is assignment-scoped, not just events in P.
- **Missing / limitations:** Unknown history/criteria/mapping→unknown. This is not first-pass yield: retests without replacement can produce a pass. Manufacturing release and unit/multi-mode rollup are not inferred.
- **Drill / verification:** Effective whole-pair provenance and action history; E01, E07, E13. **Status: Needs owner decision; feasibility F2.**

### Q05 — Evaluations passing after recorded replacement

Stable ID: `quality.evaluations_passing_after_replacement`.

- **Question / formula / N-D:** Which configurations have passing evidence after recorded corrective work at the selected cutoff? Count Q keys K with full effective pass, a recorded assignment replacement, and later compatible accepted passing readings on the effective replacement ports; no denominator.
- **Time / population / keys / source:** Context completion P; S01/S06–S08; K plus latest event/channel mapping and verification measurement IDs. Use latest event per channel; two old events do not create two successes.
- **Missing / limitations:** Awaiting retest, failing/review readings or unknown coverage are not successes. Earlier pass before a replacement cannot verify it. D08 must define how to treat optional optimization swaps and “recovered” causality.
- **Drill / verification:** Before/after pair, event timestamp, physical port, remaining channels; E08/E09. **Status: Needs owner decision; feasibility F2.**

### Q06 — Evaluations with a fully covered recovery proposal

Stable ID: `quality.evaluations_with_recovery_proposal`.

- **Question / formula / N-D:** Which failing evaluations have an evidenced proposed path to passing at the selected cutoff? Count Q keys with known formal failures and a compatible analysis whose source state matches that cutoff and whose distinct required candidate allocation covers every failing channel under approved criteria; no denominator.
- **Time / population / keys / source:** Context evaluation P; S06/S09, analysis/recommendation/measurement provenance; K. Require freshness and actual required-channel coverage, not merely `recommendations_available`.
- **Missing / limitations:** Stale/legacy-watermark-only or partial coverage→unknown/not fully covered. Optional optimization on an already passing unit is not recovery. This is a proposal, not completed or guaranteed work.
- **Drill / verification:** Failed channels→distinct candidate ports, minimum improvement, fingerprint; E09 before work, E10/E14. **Status: Needs owner decision; feasibility F2.**

### Q07 — Saved no-viable-recovery analyses

Stable ID: `quality.saved_no_viable_recovery_analyses`.

- **Question / formula / N-D:** How many saved historical calculations reported this result? Distinct `analysis_id` where `result_status=fail_no_viable_recovery`, saved in P; no denominator. Show known current/stale/unknown separately.
- **Time / population / keys / source:** `analyzed_at_utc`; production-linked contexts, including retained later-void/superseded history with explicit categories; S01/0004–0005/S09; analysis ID.
- **Missing / limitations:** Repeat analyses are repeat records, not unique rejected units. Do not equate legacy `no_viable_recommendations` or `not_applicable_no_extra_ports` with formal failure. Full source fingerprint comparison is preferred; scalar watermark fallback cannot prove assignment-wide currentness.
- **Drill / verification:** Saved inputs/criteria, source IDs and later changes; E10. **Status: Proposed; feasibility F2.**

### Q08 — Evaluations lacking complete measured-candidate coverage

Stable ID: `quality.evaluations_with_insufficient_recorded_candidates`.

- **Question / formula / N-D:** Does the known candidate set fail to cover all required failing channels? Count Q keys with known full failing inputs and approved allocation evaluation that cannot supply distinct suitable measured candidates for every required failure; no denominator.
- **Time / population / keys / source:** Context evaluation P; K; S06/S09 paired candidate/criteria/history evidence. Simple candidate count can be a necessary bound, not a sufficient matching test.
- **Missing / limitations:** Incomplete/unmeasured/review evidence→unknown. No scalar authoritative “ran out of physical ports” reason exists; zero recommendations or candidate count < failures does not describe total installed spare capacity. D10 must approve allocation/reason vocabulary.
- **Drill / verification:** Failure/candidate eligibility matrix, already-used ports, required/optional distinction; E14. **Status: Needs owner decision; feasibility F2 for recorded coverage, F3 for total physical-spare insufficiency.**

### Q09 — Accepted retest transition matrix

Stable ID: `quality.accepted_retest_transitions`.

- **Question / formula / N-D:** Do accepted retests improve or worsen observed quality? Count adjacent accepted pairs within a run/logical channel, classified fail→pass, pass→fail, fail→fail, pass→pass, with review/unknown separate. Optional row fractions use all assessable transitions from the same prior state as D.
- **Time / population / keys / source:** Later attempt write in P; A, same criteria; `(run_id,logical_channel,previous_measurement_id,current_measurement_id)`; S01/S05/S08. Physical-port-changing transitions are labeled replacement-associated, not compared as unchanged-port performance.
- **Missing / limitations:** Missing predecessor/criteria unknown; prior outside P needed. No automatic across-run predecessor inference; D02 governs expansion. Repeated transitions are not independent unit outcomes or proof of operator causality.
- **Drill / verification:** Both pairs, port/criteria and event links; E07, E09, E11. **Status: Needs owner decision; feasibility F2.**

### Q10 — Final rejected or scrapped units

Stable ID: `quality.final_rejected_units`.

- **Question / formula / N-D:** Which products received an authoritative final manufacturing rejection? Desired distinct unit/workflow IDs with an approved final-disposition event in P; no denominator until a disposition cohort is defined.
- **Time / population / keys / source:** Would require disposition event/time/authority and stable unit/workflow linkage. S01 has no authoritative manufacturing release/reject/scrap ledger.
- **Missing / limitations:** Unavailable. Failed samples, failed lifecycle, voiding, stale/current no-recovery analyses and “no extras” do not establish disposition. Never populate this from the mock `bad` bucket.
- **Drill / verification:** Future disposition evidence; E04/E06/E10 must not increment it. **Status: Not supported by current data; feasibility F3.**

## Date, comparison and query-work proposals

Z must be an owner-approved named factory/reporting timezone, not inferred from this workstation/chat timezone. UTC storage does not select the factory calendar. Propose Monday-based calendar weeks, calendar days including weekends and these presets (D05):

| Preset | Local-calendar definition, converted once to UTC [S,E) |
| --- | --- |
| Default / Last 30 complete days | From local midnight 30 dates before today through today's midnight; exclude the partial current day and label explicitly |
| Today | Local today's midnight through fixed extraction T; mark partial |
| Yesterday | Previous local midnight through today's midnight |
| This week | Monday local midnight through T; mark partial |
| This month | Local first-of-month midnight through T; mark partial |
| Last month | Previous month's first midnight through current month's first midnight |
| Custom dates | Inclusive first/last selected calendar dates become first midnight through midnight after last date; if last date is today cap at T and mark partial; reject future dates |

Resolve each boundary in Z before conversion; never add fixed 86,400 UTC seconds to get a local tomorrow. DST days can contain 23/25 hours; repeated-hour events remain unique by UTC instant/ID. Group in Z and retain UTC bucket bounds. Default complete-period comparisons use the immediately preceding equal number of local dates; “last month” compares to its previous calendar month and discloses unequal lengths. Partial day/week/month comparisons use the corresponding prior day/week/month through the same local wall-clock cutoff (month cutoff clipped when needed), explicitly flag DST/nonexistent/repeated-time resolution and unequal elapsed exposure (D05). No fabricated prior bucket where time mapping is ambiguous. Alternative elapsed-hour comparisons need a separate label.

Use each metric's own clock: starts V02; ends V03–V05/T/Q contexts; writes V01/V06–V11/Q01/Q02/Q09; replacements R01–R04; saved-analysis times R06/Q07; evaluation cutoffs R05/Q04–Q08. These cohorts do not automatically reconcile to one total. Business day/week/month/custom grouping applies to all with their stated clock, G and scope. Distinct daily unit/channel counts must not be summed into monthly distinct totals; a unit may span model/mode/assignment groups. Zero baseline counts give a null percentage change/“new”; rates compare percentage-point deltas from separately calculated N/D, and duration differences use equal definitions plus sample n.

Current metadata pages do not supply complete totals: 100 rows and offset 1000 are caps, not a complete aggregation strategy. Do not bypass guards, repeatedly scrape until a cap, broaden SELECTs or use the source desktop's read-all service. Proposed multi-month work (D13), **not implemented**: bounded reviewed server aggregates or capped stable-key evidence queries, with an explicit maximum product range (suggest ≤366 calendar days), per-window UTC span ≤31 days, total query/row/time budgets, cancellation and plan review. Split by UTC span after calendar conversion so DST does not exceed the existing guard. Incomplete/capped work must report incomplete, never a partial “total”. Do not recompute historical quality from only measurements whose writes lie inside P: context evaluation needs bounded compatible pre-period provenance, or a reviewed saved snapshot, with an explicit lookback/completeness policy. A budget hit yields unknown.

Across windows, add event counts once by IDs; globally union exact distinct keys under an approved bound or compute distinctness server-side. Combine average sums/counts and rate N/D, not displayed averages/rates. Medians/P90 require a bounded complete sample or an explicitly reviewed summary/sketch definition, never averaged quantiles. Physical scans remain possible with current indexes; no new indexes, queries or infrastructure are authorized in 4A. Stage B plan/cost verification remains pending.

## Synthetic approval and future verification examples

These cases are independent unless a row explicitly shares a history. All IDs are fictional DEMO identifiers; no actual records or source exports were read. Assume the proposed clocks/populations, one known OSX-150/SM criteria snapshot with formal limit 2.5, non-boundary valid passing pairs, full coverage where stated, and one assignment unless specified. Numbers illustrate proposals only.

| Case | Fictional evidence | Proposed count/result |
| --- | --- | --- |
| E01 | DEMO-U-A has two distinct complete/included full-48 runs in P, each 48 accepted pairs; durations 900 and 960 seconds, no repeats within either run | V01=1, V02=2, V03=2, V06=48, V07=96, V08=0 under within-run retest definition. T01=930, T02=930, proposed nearest-rank T03=960. A cross-run retest policy would differ and is not silently substituted. |
| E02 | One complete/included 48-channel full plan, all 48 accepted pairs, 900 seconds | V03=1, V06=48, V07=48; T01 sample=900; T04=18.75 seconds/channel. “Complete” alone does not prove passing; require readings/criteria. |
| E03 | Complete/included two-channel plan [7,12], saved N=48, two accepted pairs, 120 seconds | V03=1, V06=2, V07=2; excluded from F/T01. Not a standalone 48-channel quality result; may contribute to a reviewed compatible composite. |
| E04 | Stopped/pending production run with ten accepted front-panel pairs | V01=1, V02=1, V03=0, V04=1, V06=10, V07=10; no F timing/finished quality claim. A `failed` variant increments V05, not a failed-unit or scrap count. |
| E05 | Complete run later marked superseded with another run's pointer | V02 audit category=1, but A/C contributions=0. Variant complete+included+pointer: helper Yes, report No, proposed C No and inconsistency flag. No invented historical supersession timestamp. |
| E06 | Complete run marked excluded with void JSON | Retained W audit start=1; A/C contributions=0. No deletion, hardware failure or final rejection inferred. Q10 unavailable. |
| E07 | Same valid run/channel 7: day 1 accepted fail, then pass; day 2 accepted fail; both wavelengths stored per row | Combined V06=1, V07=3, V08=1, V09=2/3, V10=1/1; daily V06 totals sum to 2 but combined distinct remains 1. Day-2 repeat counts despite predecessor outside its period. Q01=1; Q02 first observation=1 failure/1; Q09 has one fail→pass and one pass→fail. Latest whole pair fails; do not keep the older pass. |
| E08 | One tested unit, same assignment/channel 19, recorded p19→p49 then p49→p50 | R01=2, R02=1, R03=2/1, R04=2/1. Current destination is p50, not both 49 and 50. No passing verification without a later matching pair. |
| E09 | Full effective 48-channel map, prior channel-19 failure, recorded p19→p49, later compatible passing pair on p49; other 47 pass | One Q05 evaluation; Q04=0; one replacement event. Recommendation alone or a pass before the event would not suffice. Not a final manufacturing release. |
| E10 | Saved DEMO analysis A1 reports `fail_no_viable_recovery`; later accepted measurement changes source fingerprint | Q07=1 saved historical analysis; A1 is stale against the changed source state. Current Q06/Q08 require reevaluation; do not increment Q10 or declare the unit unrecoverable. |
| E11 | Pair has a wavelength exactly 2.5000 with saved formal limit 2.5 | S08 strict classifier does not fail that value; S07 rounded COC check does. Quality result remains blocked by D04; no silent tie resolution. Also verify just-below/just-above and OSX-100 saved criteria. |
| E12 | Completed/included run resumes, retains original start, clears end and remains included | Helper No, default report Yes, proposed C/F No while ongoing. After later completion, elapsed includes the gap. No valid active/idle/uninterrupted time can be manufactured. |
| E13 | Same unit has two assignments or two modes, each with logical channel 7 activity | Global V01=1; V06=2 for distinct assignment/mode keys. Replacement maps/history never cross assignment. Two Q cohorts are not automatically two unique units or one released product. |
| E14 | Two failing logical channels but only one confirmed suitable measured extra port; other installed ports unmeasured | Known candidate set cannot cover both. Current partial/optional `recommendations_available` is not full recoverability; Q08 may count only with known complete input/allocation evidence. Total physical capacity/“ran out” remains unknown; V11 counts only actual accepted extra attempts. |
| E15 | Event exactly S, event exactly E, channel first attempted before S, no denominator in another cohort, DST boundary | S included/E excluded; earlier predecessor can establish V08/V09. Zero denominator→null. Explicit timezone conversion and complete query coverage required; no 24-hour assumption. |
| E16 | Zero/negative or null duration; unknown plan/model; long resumed run; missing criteria; query budget exhausted | Invalid/missing sample→excluded/unknown with reason; never zero duration, pass, active time or complete total. Long positive durations are flagged pending D07, not silently trimmed. |
| E17 | Same run/channel: attempt 2 has an earlier written timestamp than attempt 1 | SQL current view chooses attempt 2; Python timestamp projection chooses attempt 1. Flag inconsistent chronology; apply no hidden favorable-reading selection. D15 governs future resolution. |

## Dashboard alignment recommendations

No metric is approved yet, so this is a **conditional future mapping**, not a redesign or implementation plan authorized for execution. All current cards/charts remain synthetic and unchanged.

| Existing panel / source | Candidate mapping after approval | Clarification / gap |
| --- | --- | --- |
| Overview “Channels tested” / daily bars | V06 distinct activity coverage, or explicitly choose V07 attempts via D02 | A retest can count again per day; period distinct ≠ sum of daily distinct. Need new bounded measurement queries. |
| “Units completed” / configuration “units” | V01 for tested units or V03 for completed runs; choose a label/clock, not a mixture | Mock `unitsOf` adds three synthetic outcome buckets; it does not query unique units. Counts by configuration can overlap. |
| “First-pass yield” | Q03 only after workflow/proxy decision | Mock first-pass bucket / outcome total is unapproved; no authoritative first-completion/session cohort currently established. |
| “Channel failure rate” / failure line / logical-channel heatmap | Q02 first-observation fraction or Q01 historical failing coverage, with explicit N/D/criteria | Mock rate=failed channels/fixture channels; hardcoded 2.5 dB, 1310/1550 labels do not generalize to models/MM. Fixed historical series are unrelated to summary filters. |
| Average test time / configuration table / histogram / Queries timing results | T01–T04 with clear elapsed label, sample n and exclusions | Fixture 920 seconds for OSX-150 SM48 is not measured evidence. Mock histogram is generated from mean/P90-shaped values, not observed bins. Displayed SQL averages runs but counts distinct units and omits full-plan/supersession checks. |
| Unit outcomes / Failures weekly stack / “Unrecoverable units” table | Q04/Q05 evaluations plus explicitly labeled Q07 saved analyses and unknown/review categories | No approved mutually exclusive exhaustive unit outcome partition; Q07 has another grain. Never map no-recovery to Q10. Mock `bad`, “Ran out of extras” and latest-status summaries overclaim disposition/capacity. |
| “Channels swapped per failing unit” / replacement KPIs | R01/R02/R03/R04 with chosen numerator and matching D | Mock uses 1,991 failed channels / 838 failing units ≈2.4, not replacement events or unique replaced channels. “Units needing” is not the same cohort as performed work. |
| “Recovered after replacement” percentage | Q05 / an explicitly approved failing-evaluation cohort | Mock 811/838 cannot establish causal recovery, observation cutoff or fresh evidence. Do not mix all tested units with failing units or saved analyses. |
| “Retested channels” / station retest rate | V10 channels or V09 attempt share, labeled accordingly | Mock 5.8% has no underlying histories; source report's attempt-based rate is a different denominator. Operator/station normalization and privacy need D11. |
| “Failed channels per unit”, failure hotspots / extra-port trend | Q01/Q02 by G/channel/physical-port grain; R05/Q08 for candidate context | Fixed 2/3/4 usable extras by 24/36/48 is not real installed capacity. Physical-port and logical-channel heatmaps require separate denominators. |
| “Are operators following the analysis?” | R06 saved recommendation linkage share | Linkage measures recorded references, not behavior/compliance or successful verification. Repeated analyses need cohort review. |
| Unit explorer current losses/map/attempts/history | S05/S06 provenance supporting Q/R and Q09 | Preserve whole pairs, chronological evidence, mapping and stale-state flags. Mock 2.25/2.5 and “Unrecoverable” history are illustrative. Future private drill-down only. |
| Queries library and schema | Reviewed bounded report definitions only | Mock `physical_channel_count` is renamed in migration 0006; displayed JSON types are illustrative NVARCHAR storage. No arbitrary SQL execution or new query implementation in 4A. |

## Owner decision register

All rows are **Needs owner decision**; recommendations are proposals, not approvals. A future approval must record owner/team, date, selected option, definition version and affected metric IDs. Refer to IDs below rather than silently replacing formulas.

| Decision | Question and proposed default | Affected definitions |
| --- | --- | --- |
| D01 | Approve separate workload W, accepted activity A and closed C (production/complete/included/no superseding pointer), rather than one universal eligibility rule? Keep voided/superseded workload visible in audit categories. | V01–V05, T01, Q context |
| D02 | Should “channels tested” mean distinct assignment/mode/channel coverage (V06), run-channel observations or attempts (V07)? Propose V06 for coverage and explicit attempt/retest views; count again in each day's activity, deduplicate the combined period. Approve within-run versus cross-run retest scope. | V06–V10, Q02/Q09 |
| D03 | Can production quality use technically compatible engineering/training/calibration or pending/partial measurements as source app projections do? Propose preserve/label technical provenance and publish no production-yield claim until a policy is agreed. | Q03–Q08, effective population |
| D04 | Which saved-profile comparison/rounding governs analytics at exact limits: strict classifier `>` or COC rounded `>=`? Propose surface the conflict and block final boundary classification; do not fix source logic in analytics. | Q01–Q09, candidate qualification |
| D05 | Select factory timezone, week start and default range; approve partial/comparison/DST rules. Propose named Z, Monday, last 30 complete dates and explicit partial presets. | All time filters/trends |
| D06 | Approve per-full-plan-run elapsed mean (including continuation gaps) as the available default, or require unavailable uninterrupted/active/session timing? Per-unit weighting is an alternative, not interchangeable. | T01–T08 |
| D07 | What invalid/outlier/sample/percentile policy is appropriate? Propose exclude nonpositive/missing/incompatible records, flag long positives, show n/coverage, nearest-rank P90; no arbitrary maximum-duration trim or hidden small-sample suppression until approved. | T01–T04 |
| D08 | Should quality tiles count K evaluations or unique units? Which modes/assignments constitute one required full product evaluation? Define first-pass proxy, observation cutoff, prior replacement horizon, optional swaps and pass/review/composite treatment. | Q03–Q06, outcome denominators |
| D09 | Approve event versus unique-channel counts, correction/reversal treatment, tested-unit versus replaced-unit denominator, unlinked event attribution, and all-saved versus latest recommendation cohorts? Propose factual recorded-event/link labels. | R01–R04/R06 |
| D10 | Define “spare utilization” and “insufficient candidates”: measured qualifying stock, designated emergency spares, or physical capacity? Propose measured-candidate evidence only; do not infer total installed capacity or optimal allocation from a count/status alone. | R05/Q08 |
| D11 | Approve historical snapshot precedence, unknown configuration/station/operator buckets, identity normalization, privacy and exposure minimums; no person ranking from mutable identities or workload mix. | G; station/operator groupings |
| D12 | Should reports restate current dispositions, or freeze historical “as known then” results? Propose mark current-state extraction/version explicitly; exact historical lifecycle/evaluation snapshots need additional authoritative evidence. | All historical results, Q07 freshness |
| D13 | Approve maximum report range, query/row/time budgets, exact distinctness, percentile strategy and pre-period provenance limits after Stage B plans? Suggested product cap ≤366 calendar days; retain current per-query safeguards. | Multi-month metrics and Q context |
| D14 | Is true first manufacturing session, final acceptance/rejection/scrap or active time required? Identify authoritative owners/events before requesting new source data; none may be inferred from current SQL statuses. | T05–T08/Q03/Q10 |
| D15 | Approve first/latest whole-pair ordering and timestamp/attempt anomalies: propose UTC written-time, attempt, ID with visible anomaly quarantine/review, rather than silently switching between SQL view and Python recency. | V08–V10, Q01–Q09 and technical evidence |

## Recommended first implementation batch — separate authorization required

After D01/D02/D05/D11/D12 approval and Stage B evidence, begin with V01/V02/V03/V04/V05/V06/V07/V11 metadata/activity counts, preserving their different clocks and audit categories. Existing scalar fields support these, but current repository pages are not aggregate endpoints. Next consider R01/R02 and T01–T04 once denominator, snapshot/plan parsing and elapsed-label/outlier decisions are approved. Use E01–E17 as future acceptance fixtures, including guardrail and unknown-state cases.

Defer final yield/recovery/spare percentages, current effective-quality rollups and multi-month performance implementation until D03/D04/D08–D10/D13 are resolved. Accurate active/idle/uninterrupted/workflow/disposition metrics require missing authoritative data or a separately approved proxy; they are not a shortcut for the first batch. No implementation, app test changes, real-data endpoint, database connection or Milestone 4B work was performed in 4A.
