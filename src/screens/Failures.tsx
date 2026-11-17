import { CHANNEL_OPTIONS } from '../mock/presentation';
import { PreviewButton, PreviewSelect } from '../components/PreviewControl';
import { SegmentedControl } from '../components/SegmentedControl';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { css } from '../lib/css';
import { getFailuresValues } from '../mock/failures';
import type { FailuresState } from '../types';
import { LiveReplacementActivityPanel, type LiveReplacementRange } from '../components/LiveReplacementActivityPanel';
import { loadUnitStatus, type UnitStatus, type UnitStatusConnectedResponse } from '../lib/api/unitStatus';
import { loadRecommendationUsage, type RecommendationUsageConnectedResponse } from '../lib/api/recommendationUsage';
import { loadFailureConcentration, topConcentration, type FailureConcentrationConnectedResponse } from '../lib/api/failureConcentration';
import { UNIT_STATUS_LABEL } from '../lib/unitStatusPresentation';
import { groupFailingUnitReasons } from '../lib/failingUnitReasons';

const STATUS_PERIOD: Record<LiveReplacementRange, 'today' | 'yesterday' | 'this_week' | 'last_30_days'> = {
  today: 'today', yesterday: 'yesterday', week: 'this_week', month: 'last_30_days',
};
const RANGE_LABEL: Record<LiveReplacementRange, string> = {
  today: 'Today', yesterday: 'Yesterday', week: 'This week', month: 'Last 30 days',
};
const HISTOGRAM_RANGE_LABEL: Record<LiveReplacementRange, string> = {
  today: 'today', yesterday: 'yesterday', week: 'this week', month: 'in the last 30 days',
};
const FAILING_STATUS: UnitStatus[] = ['failing_no_measured_recovery', 'failing_needs_analysis', 'failing_recovery_available'];
const EVALUATED_STATUS: UnitStatus[] = ['passing', ...FAILING_STATUS];
type LiveChannelCount = 'all' | number;
const STATUS_TONE: Record<UnitStatus, { bg: string; fg: string }> = {
  review_required: { bg: 'var(--warn-bg)', fg: 'var(--warn-fg)' },
  not_evaluated: { bg: 'var(--panel2)', fg: 'var(--muted)' },
  passing: { bg: 'var(--ok-bg)', fg: 'var(--ok-fg)' },
  failing_recovery_available: { bg: 'var(--info-bg)', fg: 'var(--info-fg)' },
  failing_needs_analysis: { bg: 'var(--warn-bg)', fg: 'var(--warn-fg)' },
  failing_no_measured_recovery: { bg: 'var(--bad-bg)', fg: 'var(--bad-fg)' },
};

export default function Failures() {
 const [state, setState] = useState<FailuresState>({ ch: 48 });
 const [liveRange, setLiveRange] = useState<LiveReplacementRange>('month');
 const [unitStatus, setUnitStatus] = useState<UnitStatusConnectedResponse | null>(null);
 const [unitStatusRefresh, setUnitStatusRefresh] = useState(0);
 const [liveChannelCount, setLiveChannelCount] = useState<LiveChannelCount>('all');
 const [recommendationUsage, setRecommendationUsage] = useState<RecommendationUsageConnectedResponse | null>(null);
 const [recommendationUsageRefresh, setRecommendationUsageRefresh] = useState(0);
 const [failureConcentration, setFailureConcentration] = useState<FailureConcentrationConnectedResponse | null>(null);
 const [failureConcentrationRefresh, setFailureConcentrationRefresh] = useState(0);
 const values = getFailuresValues(state);
 const { accent, kpis, weeks, wGrid, reasons, fbars, fp, topCh, topPort, units } = values;
 useEffect(() => {
   const controller = new AbortController();
   loadUnitStatus(STATUS_PERIOD[liveRange], ['production'], controller.signal)
     .then(result => {
       if (result.data_source !== 'test_database') {
         setUnitStatus(null);
         return;
       }
       setUnitStatus(result);
       setLiveChannelCount(selected => selected === 'all' || result.units.some(unit => unit.channel_count === selected) ? selected : 'all');
     })
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setUnitStatus(null); });
   return () => controller.abort();
 }, [liveRange, unitStatusRefresh]);
 useEffect(() => {
   const controller = new AbortController();
   loadRecommendationUsage(STATUS_PERIOD[liveRange], ['production'], controller.signal)
     .then(result => setRecommendationUsage(result.data_source === 'test_database' ? result : null))
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setRecommendationUsage(null); });
   return () => controller.abort();
 }, [liveRange, recommendationUsageRefresh]);
 useEffect(() => {
   const controller = new AbortController();
   loadFailureConcentration(STATUS_PERIOD[liveRange], ['production'], controller.signal)
     .then(result => setFailureConcentration(result.data_source === 'test_database' ? result : null))
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setFailureConcentration(null); });
   return () => controller.abort();
 }, [failureConcentrationRefresh, liveRange]);
 const changeLiveRange = (range: LiveReplacementRange) => {
   setUnitStatus(null);
   setRecommendationUsage(null);
   setFailureConcentration(null);
   setLiveRange(range);
 };
 const refreshUnitStatus = () => {
   setUnitStatus(null);
   setUnitStatusRefresh(value => value + 1);
 };
 const refreshRecommendationUsage = () => {
   setRecommendationUsage(null);
   setRecommendationUsageRefresh(value => value + 1);
 };
 const refreshFailureConcentration = () => {
   setFailureConcentration(null);
   setFailureConcentrationRefresh(value => value + 1);
 };
 const liveFailingUnits = useMemo(() => {
   if (!unitStatus) return [];
   const priority = new Map(FAILING_STATUS.map((status, index) => [status, index]));
   return unitStatus.units
     .filter(unit => FAILING_STATUS.includes(unit.status))
     .sort((left, right) => (priority.get(left.status) ?? 9) - (priority.get(right.status) ?? 9) || left.unit_id - right.unit_id);
 }, [unitStatus]);
 const liveChannelCountOptions = useMemo(() => {
   const counts = unitStatus
     ? [...new Set(unitStatus.units.flatMap(unit => unit.channel_count === null ? [] : [unit.channel_count]))].sort((left, right) => left - right)
     : [];
   return [{ value: 'all' as const, label: 'All' }, ...counts.map(count => ({ value: count, label: String(count) }))];
 }, [unitStatus]);
 const liveHistogram = useMemo(() => {
   if (!unitStatus) return null;
   const selectedCount = liveChannelCountOptions.some(option => option.value === liveChannelCount) ? liveChannelCount : 'all';
   const selectedUnits = unitStatus.units.filter(unit => selectedCount === 'all' || unit.channel_count === selectedCount);
   const evaluated = selectedUnits.filter(unit => EVALUATED_STATUS.includes(unit.status));
   const counts = Array.from({ length: 8 }, () => 0);
   evaluated.forEach(unit => { counts[Math.min(unit.failing_channels.length, 7)] += 1; });
   const FX0 = 40, FX1 = 664, FY1 = 180, FH = 130;
   const fmax = Math.max(...counts, 1);
   const fstep = (FX1 - FX0) / counts.length;
   const bars = counts.map((count, index) => {
     const height = Math.max(FH * count / fmax, 1.5);
     const x = FX0 + index * fstep + (fstep - 52) / 2;
     return {
       x: x.toFixed(1), cx: (x + 26).toFixed(1), y: (FY1 - height).toFixed(1), h: height.toFixed(1),
       vy: (FY1 - height - 6).toFixed(1), count: String(count), label: index === 7 ? '7+' : String(index),
       fill: index === 0 ? 'color-mix(in srgb,var(--accent) 35%,var(--panel))' : 'var(--accent)',
     };
   });
   const failing = evaluated.filter(unit => FAILING_STATUS.includes(unit.status)).length;
   return {
     bars,
     evaluated: evaluated.length,
     failing,
     excluded: selectedUnits.filter(unit => unit.status === 'review_required' || unit.status === 'not_evaluated').length,
     caption: evaluated.length === 0
       ? 'No evaluated units in this range.'
       : `${evaluated.length.toLocaleString('en-US')} evaluated ${evaluated.length === 1 ? 'unit' : 'units'} tested ${HISTOGRAM_RANGE_LABEL[liveRange]} · ${failing.toLocaleString('en-US')} currently failing.`,
     aria: `Histogram of currently failing channels per unit: ${counts[0]} ${counts[0] === 1 ? 'unit' : 'units'} with none, ${counts[1]} with 1, ${counts[2]} with 2, ${counts[3]} with 3, ${counts[4]} with 4, ${counts[5]} with 5, ${counts[6]} with 6, ${counts[7]} with 7 or more.`,
   };
 }, [liveChannelCount, liveChannelCountOptions, liveRange, unitStatus]);
 const histogramBars = liveHistogram?.bars ?? fbars;
 const liveReasons = useMemo(
   () => unitStatus ? groupFailingUnitReasons(unitStatus.units) : null,
   [unitStatus],
 );
 const liveConcentration = useMemo(
   () => failureConcentration ? topConcentration(failureConcentration) : null,
   [failureConcentration],
 );
 return (<>

    <header style={css("display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px")}>
      <div style={css("display:flex;flex-direction:column;gap:4px")}>
        <span style={css("font-size:12.5px;color:var(--muted);font-weight:500")}>Last 30 days · Oct 7 to Nov 5, 2026</span>
        <h1 style={css("margin:0;font-size:28px;line-height:1.15;font-weight:650;letter-spacing:-0.02em")}>Failures & replacements</h1>
        <p style={css("margin:0;font-size:13.5px;color:var(--muted);max-width:640px")}>How often channels fail, how many get swapped to extra ports, and why some units can't be recovered.</p>
      </div>
      <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:8px")}>
        <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Period
          <PreviewSelect style={css("min-height:44px;padding:0 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >Last 30 days</option><option >This week</option><option >Yesterday</option><option >Today</option></PreviewSelect>
        </label>
        <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Run purpose
          <PreviewSelect style={css("min-height:44px;padding:0 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >Production</option><option >Engineering</option><option >Production + engineering</option><option >Training</option><option >Calibration</option><option >All purposes</option></PreviewSelect>
        </label>
        <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Model
          <PreviewSelect style={css("min-height:44px;padding:0 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >All models</option><option >OSX-150</option><option >OSX-100</option></PreviewSelect>
        </label>
        <PreviewButton type="button" style={css("min-height:44px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:8px")}>
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>
          Export CSV
        </PreviewButton>
      </div>
    </header>

    <LiveReplacementActivityPanel range={liveRange} onRangeChange={changeLiveRange} />

    <p className="preview-note">Fixed synthetic periods: the header filters and export are disabled previews.</p>
    <section aria-label="Key metrics" style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px")}>
      {kpis.map((k, index0) => <Fragment key={index0}>
        <div style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:6px")}>
          <span style={css("font-size:12.5px;color:var(--muted);font-weight:500")}>{k.label}</span>
          <span style={css("font-size:30px;line-height:1.05;font-weight:650;letter-spacing:-0.025em;font-variant-numeric:tabular-nums;color:" + String(k.color))}>{k.value}</span>
          <span style={css("font-size:12.5px;color:var(--ink2)")}>{k.sub}</span>
          <div style={css("height:5px;border-radius:3px;background:var(--line2);overflow:hidden;margin-top:4px")}><div style={css("height:5px;border-radius:3px;width:" + String(k.pct) + "%;background:" + String(k.bar))}></div></div>
        </div>
      </Fragment>)}
    </section>

    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:2 1 560px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Unit outcomes by week</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>Units finished each week, last 8 weeks. The current week is partial.</span>
          </div>
          <div style={css("display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--ink2)")}>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--o1)")}></span>Passed first time</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--o2)")}></span>Passed after replacement</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--o3)")}></span>Unrecoverable</span>
          </div>
        </div>
        <svg viewBox="0 0 680 250" role="img" aria-label="Stacked bars of unit outcomes per week. About 270 to 310 units per full week, roughly a third passing first time and 2 percent unrecoverable." style={css("width:100%;height:auto;display:block")}>
          {wGrid.map((g, index1) => <Fragment key={index1}>
            <g >
              <line x1="44" x2="664" y1={g.y} y2={g.y} style={css("stroke:var(--grid);stroke-width:1")}></line>
              <text x="36" y={g.ty} style={css("font-size:11px;fill:var(--muted);text-anchor:end;font-family:'Geist Mono',monospace")}>{g.label}</text>
            </g>
          </Fragment>)}
          {weeks.map((w, index2) => <Fragment key={index2}>
            <g >
              <rect x={w.x} y={w.y1} width="44" height={w.h1} style={css("fill:var(--o1)")}></rect>
              <rect x={w.x} y={w.y2} width="44" height={w.h2} style={css("fill:var(--o2)")}></rect>
              <rect x={w.x} y={w.y3} width="44" height={w.h3} style={css("fill:var(--o3)")}></rect>
              <text x={w.cx} y={w.ty} style={css("font-size:11.5px;font-weight:600;fill:var(--ink);text-anchor:middle;font-family:'Geist Mono',monospace")}>{w.total}</text>
              <text x={w.cx} y="222" style={css("font-size:11.5px;fill:var(--ink2);text-anchor:middle;font-weight:500")}>{w.label}</text>
              <text x={w.cx} y="242" style={css("font-size:11px;fill:var(--bad-fg);text-anchor:middle;font-family:'Geist Mono',monospace;font-weight:600")}>{w.unrec}</text>
            </g>
          </Fragment>)}
        </svg>
      </div>

      <div role="region" aria-label="Failing unit reasons" style={css("flex:1 1 340px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")}>{liveReasons ? "Why failing units aren't recovered" : 'Why units were unrecoverable'}</h2>
          {liveReasons && <span className="live-unit-badge" style={css("align-self:flex-start;font-size:10px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent-ink)")}>Live · test database</span>}
          <span style={css("font-size:12.5px;color:var(--muted)")}>{liveReasons
            ? `${liveReasons.total.toLocaleString('en-US')} currently failing ${liveReasons.total === 1 ? 'unit' : 'units'} ${HISTOGRAM_RANGE_LABEL[liveRange]}, by each unit's latest saved analysis.`
            : "27 units, from each run's latest replacement analysis."}</span>
        </div>
        {liveReasons?.total === 0 && <p style={css("margin:0;padding:12px 0;border-top:1px solid var(--line2);font-size:12.5px;color:var(--muted)")}>No currently failing units in this range.</p>}
        {(liveReasons?.groups ?? reasons).map((r, index3) => <Fragment key={'key' in r ? r.key : index3}>
          <div style={css("display:flex;flex-direction:column;gap:7px;padding:12px 0;border-top:1px solid var(--line2)")}>
            <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}>
              <span style={css("font-weight:600")}>{r.title}</span>
              <span style={css("display:flex;align-items:baseline;gap:8px;font-variant-numeric:tabular-nums")}><span style={css("font-size:22px;font-weight:650")}>{r.count}</span><span style={css("font-size:12px;color:var(--muted)")}>{'key' in r ? `${r.share}%` : r.share}</span></span>
            </div>
            <div style={css("height:6px;border-radius:3px;background:var(--line2);overflow:hidden")}><div data-reason-bar={'key' in r ? r.key : undefined} style={css("height:6px;border-radius:3px;width:" + String('key' in r ? r.width : r.w) + "%;background:" + String(r.color))}></div></div>
            <span style={css("font-size:12.5px;color:var(--ink2);line-height:1.5")}>{'key' in r ? r.description : r.text}</span>
            {'key' in r
              ? r.resultStatuses.length > 0 && <code style={css("align-self:flex-start;font-family:'Geist Mono',monospace;font-size:11.5px;color:var(--muted);background:var(--panel2);padding:2px 7px;border-radius:5px")}>result_status = '{r.resultStatuses.join("', '")}'</code>
              : <code style={css("align-self:flex-start;font-family:'Geist Mono',monospace;font-size:11.5px;color:var(--muted);background:var(--panel2);padding:2px 7px;border-radius:5px")}>result_status = '{r.code}'</code>}
          </div>
        </Fragment>)}
        {liveReasons && unitStatus && <p style={css("margin:0;font-size:11.5px;color:var(--muted);line-height:1.5")}>
          Current status at extraction time. A saved analysis is not a final manufacturing disposition.
          {unitStatus.counts.review_required > 0 && ` ${unitStatus.counts.review_required.toLocaleString('en-US')} review-required ${unitStatus.counts.review_required === 1 ? 'unit' : 'units'} not shown.`}
          {unitStatus.incomplete && <span style={css("color:var(--warn-fg)")}> Bounded cohort is incomplete.</span>}
        </p>}
      </div>
    </section>

    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:2 1 560px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Failed channels per unit</h2>
            {unitStatus && <span className="live-unit-badge" style={css("align-self:flex-start;font-size:10px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent-ink)")}>Live · test database</span>}
            <p id="failure-scope" className="preview-note">{unitStatus ? 'Channel count filters this histogram only.' : 'Channel count changes this histogram only.'}</p>
            <span style={css("font-size:12.5px;color:var(--muted)")}>{liveHistogram?.caption ?? fp.caption}</span>
          </div>
          {unitStatus
            ? <SegmentedControl label="Channel count" options={liveChannelCountOptions} value={liveChannelCount} onChange={setLiveChannelCount} describedBy="failure-scope" />
            : <SegmentedControl label="Channel count" options={CHANNEL_OPTIONS} value={state.ch} onChange={ch => setState({ ch })} describedBy="failure-scope" />}
        </div>
        <svg viewBox="0 0 680 230" role="img" aria-label={liveHistogram?.aria ?? fp.aria} style={css("width:100%;height:auto;display:block")}>
          <line x1="40" x2="664" y1="180" y2="180" style={css("stroke:var(--line);stroke-width:1")}></line>
          {!unitStatus && <>
            <rect x={fp.zoneX} y="16" width={fp.zoneW} height="164" style={css("fill:var(--o3);fill-opacity:0.07")}></rect>
            <line x1={fp.zoneX} x2={fp.zoneX} y1="16" y2="180" style={css("stroke:var(--o3);stroke-width:1.5;stroke-dasharray:4 3")}></line>
            <text x={fp.zoneLX} y="30" style={css("font-size:11.5px;font-weight:600;fill:var(--warn-fg)")}>More failures than usable extras ({fp.extras})</text>
          </>}
          {histogramBars.map((b, index5) => <Fragment key={index5}>
            <g >
              <rect x={b.x} y={b.y} width="52" height={b.h} rx="4" style={css("fill:" + String(b.fill))}></rect>
              <text x={b.cx} y={b.vy} style={css("font-size:12px;font-weight:600;fill:var(--ink);text-anchor:middle;font-family:'Geist Mono',monospace")}>{b.count}</text>
              <text x={b.cx} y="198" style={css("font-size:12px;fill:var(--ink2);text-anchor:middle;font-weight:500")}>{b.label}</text>
            </g>
          </Fragment>)}
          <text x="352" y="222" style={css("font-size:11.5px;fill:var(--muted);text-anchor:middle")}>{unitStatus ? 'currently failing channels in one unit' : 'failed channels in one unit, first pass'}</text>
        </svg>
        {unitStatus && liveHistogram && <p style={css("margin:0;font-size:11.5px;color:var(--muted);line-height:1.5")}>
          Current measured status at extraction time, not first-pass results.
          {liveHistogram.excluded > 0 && ` ${liveHistogram.excluded.toLocaleString('en-US')} review-required or not-evaluated ${liveHistogram.excluded === 1 ? 'unit' : 'units'} not shown.`}
          {unitStatus.incomplete && <span style={css("color:var(--warn-fg)")}> Bounded cohort is incomplete.</span>}
        </p>}
      </div>

      <div role="region" aria-label="Failure concentration" style={css("flex:1 1 340px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:8px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Where failures concentrate</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>Logical channel is the front-panel position; physical port is the switch output behind it.</span>
            {failureConcentration && <span style={css("font-size:11.5px;color:var(--muted)")}>Failed first observations, {HISTOGRAM_RANGE_LABEL[liveRange]} · {failureConcentration.totals.failed.toLocaleString('en-US')} of {failureConcentration.totals.observed.toLocaleString('en-US')} failed.</span>}
          </div>
          {failureConcentration && <div style={css("display:flex;align-items:center;gap:8px")}>
            <span style={css("font-size:10px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent-ink)")}>Live · test database</span>
            <button type="button" aria-label="Refresh failure concentration" onClick={refreshFailureConcentration} className="lnk" style={css("min-height:28px;border:0;background:transparent;padding:0;font-size:12px")}>Refresh</button>
          </div>}
        </div>
        <div style={css("display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px")}>
          <div style={css("display:flex;flex-direction:column")}>
            <span style={css("font-size:12px;font-weight:600;color:var(--muted);padding-bottom:6px")}>Logical channel</span>
            {failureConcentration ? (liveConcentration && liveConcentration.channels.length > 0 ? liveConcentration.channels.map(channel => <div key={channel.logical_channel} title={`${channel.failed} of ${channel.observed} first observations failed (${((channel.rate ?? 0) * 100).toFixed(1)}%)`} style={css("display:flex;flex-direction:column;gap:4px;padding:7px 0;border-top:1px solid var(--line2)")}>
              <div style={css("display:flex;justify-content:space-between;font-variant-numeric:tabular-nums")}><span style={css("font-weight:500")}>Ch {channel.logical_channel}</span><span style={css("font-weight:650")}>{channel.failed.toLocaleString('en-US')}</span></div>
              <div style={css("height:5px;border-radius:3px;background:var(--line2)")}><div style={css(`height:5px;border-radius:3px;width:${channel.failed / liveConcentration.channels[0].failed * 100}%;background:${accent}`)}></div></div>
            </div>) : <span style={css("padding:7px 0;border-top:1px solid var(--line2);font-size:12px;color:var(--muted);line-height:1.45")}>No failed first observations in this range.</span>) : topCh.map((c, index6) => <Fragment key={index6}>
              <div style={css("display:flex;flex-direction:column;gap:4px;padding:7px 0;border-top:1px solid var(--line2)")}>
                <div style={css("display:flex;justify-content:space-between;font-variant-numeric:tabular-nums")}><span style={css("font-weight:500")}>Ch {c.n}</span><span style={css("font-weight:650")}>{c.count}</span></div>
                <div style={css("height:5px;border-radius:3px;background:var(--line2)")}><div style={css("height:5px;border-radius:3px;width:" + String(c.w) + "%;background:" + String(accent))}></div></div>
              </div>
            </Fragment>)}
          </div>
          <div style={css("display:flex;flex-direction:column")}>
            <span style={css("font-size:12px;font-weight:600;color:var(--muted);padding-bottom:6px")}>Physical port</span>
            {failureConcentration ? (liveConcentration && liveConcentration.ports.length > 0 ? liveConcentration.ports.map(port => <div key={`${port.physical_port}-${port.extra}`} title={`${port.failed} of ${port.observed} first observations failed (${((port.rate ?? 0) * 100).toFixed(1)}%)`} style={css("display:flex;flex-direction:column;gap:4px;padding:7px 0;border-top:1px solid var(--line2)")}>
              <div style={css("display:flex;justify-content:space-between;gap:6px;font-variant-numeric:tabular-nums")}><span style={css("font-weight:500")}>Port {port.physical_port} {port.extra && <span style={css("font-size:11px;font-weight:600;color:var(--warn-fg)")}>EXTRA</span>}</span><span style={css("font-weight:650")}>{port.failed.toLocaleString('en-US')}</span></div>
              <div style={css("height:5px;border-radius:3px;background:var(--line2)")}><div style={css(`height:5px;border-radius:3px;width:${port.failed / liveConcentration.ports[0].failed * 100}%;background:${port.extra ? 'var(--o3)' : accent}`)}></div></div>
            </div>) : <span style={css("padding:7px 0;border-top:1px solid var(--line2);font-size:12px;color:var(--muted);line-height:1.45")}>No failed first observations in this range.</span>) : topPort.map((c, index7) => <Fragment key={index7}>
              <div style={css("display:flex;flex-direction:column;gap:4px;padding:7px 0;border-top:1px solid var(--line2)")}>
                <div style={css("display:flex;justify-content:space-between;gap:6px;font-variant-numeric:tabular-nums")}><span style={css("font-weight:500")}>Port {c.n} <span style={css("font-size:11px;font-weight:600;color:" + String(c.tagFg))}>{c.tag}</span></span><span style={css("font-weight:650")}>{c.count}</span></div>
                <div style={css("height:5px;border-radius:3px;background:var(--line2)")}><div style={css("height:5px;border-radius:3px;width:" + String(c.w) + "%;background:" + String(c.bar))}></div></div>
              </div>
            </Fragment>)}
          </div>
        </div>
        {failureConcentration ? <p style={css("margin:0;font-size:11.5px;color:var(--muted);line-height:1.5")}>First observation per run-channel; a port's count follows the channel it was measured for. EXTRA marks a port above the run's front panel.{failureConcentration.totals.unknown_criteria > 0 && ` ${failureConcentration.totals.unknown_criteria.toLocaleString('en-US')} observations with unknown limits not counted.`}{failureConcentration.incomplete && <span style={css("color:var(--warn-fg)")}> Run cap reached; results are incomplete.</span>}</p> : <div style={css("display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:var(--warn-bg);color:var(--warn-fg);font-size:12.5px")}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={css("flex:0 0 auto;margin-top:1px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M12 3l9.5 17h-19z"></path><path d="M12 10v4M12 17.5v.01"></path></svg>
          <span >Extra port 50 fails as a replacement candidate 31% of the time, about 3× the other extras.</span>
        </div>}
      </div>
    </section>

    <section aria-label="Recommendation usage" style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-wrap:wrap;gap:18px 28px;align-items:center")}>
      <div style={css("flex:1 1 260px;display:flex;flex-direction:column;gap:3px")}>
        <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Are operators following the analysis?</h2>
        <span style={css("font-size:12.5px;color:var(--muted)")}>{recommendationUsage ? `Saved recommendations from analyses in ${RANGE_LABEL[liveRange]} · replacement links recorded through now.` : 'From vw_ReplacementRecommendationUsage: recommended swaps that were recorded as replacements.'}</span>
        {recommendationUsage && <span style={css("align-self:flex-start;margin-top:3px;font-size:10px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent-ink)")}>Live · test database</span>}
        {recommendationUsage && <button type="button" onClick={refreshRecommendationUsage} className="lnk" style={css("align-self:flex-start;min-height:28px;border:0;background:transparent;padding:0;font-size:12px")}>Refresh</button>}
      </div>
      <div style={css("flex:2 1 480px;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px")}>
        {recommendationUsage ? <>
          <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Recommendations</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>{recommendationUsage.recommendations.total.toLocaleString()}</div><div style={css("font-size:11.5px;color:var(--ink2)")}>{recommendationUsage.recommendations.required.toLocaleString()} required · {recommendationUsage.recommendations.optional.toLocaleString()} optional{recommendationUsage.recommendations.other > 0 ? ` · ${recommendationUsage.recommendations.other.toLocaleString()} other` : ''}</div></div>
          <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Linked to a replacement</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>{recommendationUsage.linked.total.toLocaleString()} <span style={css("font-size:13px;color:var(--ok-fg)")}>{recommendationUsage.linked_share === null ? '—' : `${(Number(recommendationUsage.linked_share) * 100).toFixed(1)}%`}</span></div><div style={css("font-size:11.5px;color:var(--ink2)")}>required {recommendationUsage.linked.required.toLocaleString()} · optional {recommendationUsage.linked.optional.toLocaleString()}</div></div>
          <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Swaps without a linked recommendation</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>{recommendationUsage.unlinked_events.toLocaleString()}</div>{recommendationUsage.unlinked_unattributed > 0 && <div style={css("font-size:11.5px;color:var(--ink2)")}>+ {recommendationUsage.unlinked_unattributed.toLocaleString()} unattributed</div>}</div>
          <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Avg predicted improvement</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>{recommendationUsage.avg_improvement_linked_db.value === null ? '—' : `${Number(recommendationUsage.avg_improvement_linked_db.value).toFixed(2)} dB`}</div><div style={css("font-size:11.5px;color:var(--ink2)")}>{recommendationUsage.avg_improvement_linked_db.n.toLocaleString()} linked · all recommendations {recommendationUsage.avg_improvement_all_db.value === null ? '—' : `${Number(recommendationUsage.avg_improvement_all_db.value).toFixed(2)} dB`} ({recommendationUsage.avg_improvement_all_db.n.toLocaleString()})</div></div>
        </> : <>
          <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Recommendations</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>2,036</div></div>
          <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Used as recommended</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>1,812 <span style={css("font-size:13px;color:var(--ok-fg)")}>89%</span></div></div>
          <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Manual swaps</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>145</div></div>
          <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Avg improvement</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>0.42 dB</div></div>
        </>}
      </div>
      {recommendationUsage && <p className="preview-note" style={css("flex:1 1 100%;margin:0")}>A missing link means usage wasn't recorded, not that the recommendation was ignored. Repeated analyses count as repeated opportunities. Improvements are the analysis's predictions, not measured results.{recommendationUsage.analyses.on_invalid_runs > 0 ? ` ${recommendationUsage.analyses.on_invalid_runs.toLocaleString()} analyses on voided or superseded runs not counted.` : ''}</p>}
    </section>

    <section style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 18px 8px;display:flex;flex-direction:column;gap:10px")}>
      <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")} title={unitStatus ? 'Current measured status; this is not a scrap or reject record.' : undefined}>Unrecoverable units</h2>
          <span style={css("font-size:12.5px;color:var(--muted)")}>{unitStatus ? `Currently failing units · ${liveFailingUnits.length.toLocaleString('en-US')} in the bounded production cohort.` : 'Showing 7 of 27, newest first. Usable extras pass at both wavelengths and are not already in use.'}</span>
          {unitStatus && <span style={css("align-self:flex-start;font-size:10px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent-ink)")}>Live · test database</span>}
          {unitStatus && <span style={css("font-size:11.5px;color:var(--muted)")}>{unitStatus.counts.review_required.toLocaleString('en-US')} review required · {unitStatus.counts.not_evaluated.toLocaleString('en-US')} not evaluated{unitStatus.incomplete ? ' · bounded result incomplete' : ''}</span>}
        </div>
        {unitStatus ? <button type="button" onClick={refreshUnitStatus} className="lnk" style={css("font-size:13px;display:inline-flex;align-items:center;min-height:32px;border:0;background:transparent;padding:0")}>Refresh unit status</button> : <PreviewButton className="lnk" style={css("font-size:13px;display:inline-flex;align-items:center;min-height:32px;border:0;background:transparent;padding:0")}>Open all in console</PreviewButton>}
      </div>
      <div className="table-scroll" role="region" tabIndex={0} aria-label="Unrecoverable units table, scroll horizontally on narrow screens">
        <div role="table" aria-label="Unrecoverable units" style={css("min-width:900px")}>
          <div role="row" style={css(`display:grid;grid-template-columns:${unitStatus ? '1.05fr 1.25fr 1.2fr 2.2fr 1.6fr' : '0.95fr 1.25fr 0.6fr 0.8fr 1.8fr 0.75fr 1.1fr 1.6fr'};gap:10px;padding:0 6px 9px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);font-weight:500`)}>
            {unitStatus ? <>
              <span role="columnheader">Serial</span><span role="columnheader">Switch</span><span role="columnheader">Status</span><span role="columnheader">Failing channels</span><span role="columnheader">Latest analysis</span>
            </> : <>
              <span role="columnheader">Unit</span><span role="columnheader">Configuration</span><span role="columnheader">Station</span><span role="columnheader">Finished</span><span role="columnheader">Failed logical channels</span><span role="columnheader" style={css("text-align:right")}>Usable extras</span><span role="columnheader" style={css("text-align:right")}>Worst after swap</span><span role="columnheader">Reason</span>
            </>}
          </div>
          {unitStatus && liveFailingUnits.length === 0 && <div role="row"><span role="cell" style={css("display:block;padding:18px 6px;color:var(--muted)")}>No currently failing units in this bounded cohort.</span></div>}
          {unitStatus && liveFailingUnits.map(unit => {
            const tone = STATUS_TONE[unit.status];
            return <div role="row" key={unit.assignment_id} style={css("display:grid;grid-template-columns:1.05fr 1.25fr 1.2fr 2.2fr 1.6fr;gap:10px;align-items:center;padding:10px 6px;border-bottom:1px solid var(--line2);font-variant-numeric:tabular-nums") }>
              <span role="cell"><a href={`#/unit?unit=${unit.unit_id}`} className="lnk" style={css("font-family:'Geist Mono',monospace;font-weight:600")}>{unit.main_board_serial}</a></span>
              <span role="cell" style={css("display:flex;flex-direction:column;color:var(--ink2)")}><span>{unit.switch_serial}</span><span style={css("font-size:11px;color:var(--muted)")}>{unit.switch_model}</span></span>
              <span role="cell"><span style={css(`display:inline-flex;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:600;background:${tone.bg};color:${tone.fg}`)}>{UNIT_STATUS_LABEL[unit.status]}</span></span>
              <span role="cell" style={css("display:flex;flex-wrap:wrap;gap:4px")}>{unit.failing_channels.map(channel => <span key={channel.logical_channel} title={`Effective port ${channel.effective_port}; losses ${channel.wavelength_1_il_db.toFixed(4)} / ${channel.wavelength_2_il_db.toFixed(4)} dB`} style={css("font-family:'Geist Mono',monospace;font-size:11.5px;font-weight:600;padding:2px 6px;border-radius:5px;background:var(--bad-bg);color:var(--bad-fg)")}>Ch {channel.logical_channel} · P{channel.effective_port} · {channel.wavelength_1_il_db.toFixed(2)} / {channel.wavelength_2_il_db.toFixed(2)} dB</span>)}</span>
              <span role="cell" style={css("display:flex;flex-direction:column;color:var(--ink2)")}>{unit.latest_analysis ? <><span>{unit.latest_analysis.result_status}</span><span style={css(`font-size:11px;color:${unit.latest_analysis.current ? 'var(--ok-fg)' : 'var(--warn-fg)'}`)}>{unit.latest_analysis.current ? 'Current' : 'Stale'} · {unit.latest_analysis.unused_recommendations} unused</span></> : <span>No saved analysis</span>}</span>
            </div>;
          })}
          {!unitStatus && units.map((u, index8) => <Fragment key={index8}>
            <div role="row" style={css("display:grid;grid-template-columns:0.95fr 1.25fr 0.6fr 0.8fr 1.8fr 0.75fr 1.1fr 1.6fr;gap:10px;align-items:center;padding:10px 6px;border-bottom:1px solid var(--line2);font-variant-numeric:tabular-nums")}>
              <span role="cell"><a href={`#/unit?serial=${encodeURIComponent(String(u.unit))}`}  className="lnk" style={css("font-family:'Geist Mono',monospace;font-weight:600")}>{u.unit}</a></span>
              <span role="cell" style={css("color:var(--ink2)")}>{u.cfg}</span>
              <span role="cell" style={css("color:var(--ink2)")}>{u.st}</span>
              <span role="cell" style={css("color:var(--ink2)")}>{u.when}</span>
              <span role="cell" style={css("display:flex;flex-wrap:wrap;gap:4px")}>{u.chs.map((c, index9) => <Fragment key={index9}><span style={css("font-family:'Geist Mono',monospace;font-size:12px;font-weight:600;padding:1px 6px;border-radius:5px;background:var(--bad-bg);color:var(--bad-fg)")}>{c}</span></Fragment>)}</span>
              <span role="cell" style={css("text-align:right")}>{u.extras}</span>
              <span role="cell" style={css("text-align:right;font-family:'Geist Mono',monospace;color:" + String(u.afterColor))}>{u.after}</span>
              <span role="cell"><span style={css("display:inline-flex;align-items:center;gap:7px;padding:3px 10px;border-radius:999px;font-size:12.5px;font-weight:600;background:" + String(u.bg) + ";color:" + String(u.fg))}><span style={css("width:6px;height:6px;border-radius:50%;background:currentColor")}></span>{u.reason}</span></span>
            </div>
          </Fragment>)}
        </div>
      </div>
    </section>

    <footer style={css("font-size:12px;color:var(--muted);line-height:1.55;max-width:900px")}>{unitStatus
      ? 'Panels marked Live · test database show real test-database data. All other panels are synthetic examples; their recovery labels and calculations are illustrative and require review before production use.'
      : 'Synthetic replacement examples. Recovery labels and calculations are illustrative and require review before production use.'}</footer>

</>);
}
