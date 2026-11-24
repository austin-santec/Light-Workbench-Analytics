import { ConfigurationTable } from './ConfigurationTable';
import { TIME_RANGES, PRODUCTION_ONLY, PURPOSES, formatDuration, sparkline, togglePurpose } from '../mock/presentation';
import { PreviewButton, PreviewSelect } from '../components/PreviewControl';
import { SegmentedControl } from '../components/SegmentedControl';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

// Measures an element's content width; the element is attached through the returned callback ref.
function useMeasuredWidth(fallback: number): [(element: HTMLElement | null) => void, number] {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    if (!element) return;
    const update = () => setWidth(Math.max(240, Math.round(element.getBoundingClientRect().width)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width];
}
import { RecentActivity } from '../components/RecentActivity';
import { css } from '../lib/css';
import { getOverviewValues } from '../mock/overview';
import type { OverviewState, Purpose, TimeRange } from '../types';
import { LiveRunActivityCard } from '../components/LiveRunActivityCard';
import { loadChannelActivity, type ChannelActivityConnectedResponse, type ChannelActivityPeriodKey } from '../lib/api/channelActivity';
import { loadFailureRate, type FailureRateConnectedResponse } from '../lib/api/failureRate';
import { loadUnitStatus, type UnitStatusConnectedResponse } from '../lib/api/unitStatus';
import { channelHeatmap, loadChannelFailures, type ChannelFailuresConnectedResponse } from '../lib/api/channelFailures';
import { loadStationSummary, stationTableRows, type StationSummaryConnectedResponse } from '../lib/api/stationSummary';
import { UNIT_STATUS_LABEL, UNIT_STATUS_OUTCOME_COLOR, UNIT_STATUS_OUTCOME_ORDER } from '../lib/unitStatusPresentation';
import { loadUnitTestTime, summarizeUnitTestTime, UNIT_TEST_TIME_EXCLUDED_KEYS, type UnitTestTimeConnectedResponse, type UnitTestTimeOutcomeFilter } from '../lib/api/unitTestTime';
import { loadRecentFinishedUnits, type RecentFinishedUnitsConnectedResponse } from '../lib/api/recentFinishedUnits';

type ChannelActivityState =
  | { kind: 'loading' | 'demo' | 'error' }
  | { kind: 'connected'; data: ChannelActivityConnectedResponse };

type FailureRateState =
  | { kind: 'loading' | 'demo' | 'error' }
  | { kind: 'connected'; data: FailureRateConnectedResponse };

type UnitStatusState =
  | { kind: 'loading' | 'demo' | 'error' }
  | { kind: 'connected'; data: UnitStatusConnectedResponse };

type UnitTestTimeState =
  | { kind: 'loading' | 'demo' | 'error' }
  | { kind: 'connected'; data: UnitTestTimeConnectedResponse };

type StationSummaryState =
  | { kind: 'loading' | 'demo' | 'error' }
  | { kind: 'connected'; data: StationSummaryConnectedResponse };

type ChannelFailuresState =
  | { kind: 'loading' | 'demo' | 'error' }
  | { kind: 'connected'; data: ChannelFailuresConnectedResponse };

type RecentFinishedUnitsState =
  | { kind: 'loading' | 'demo' | 'error' }
  | { kind: 'connected'; data: RecentFinishedUnitsConnectedResponse };

// Live heatmap steps use theme tokens; each text/background pair measured >= 4.5:1 in both themes.
// The demo keeps its fixed ramp.
const LIVE_HEAT_RAMP: { bg: string; fg: string }[] = [
  { bg: 'color-mix(in srgb,var(--accent) 6%,var(--panel))', fg: 'var(--ink2)' },
  { bg: 'color-mix(in srgb,var(--accent) 22%,var(--panel))', fg: 'var(--ink)' },
  { bg: 'color-mix(in srgb,var(--accent) 38%,var(--panel))', fg: 'var(--ink)' },
  { bg: 'color-mix(in srgb,var(--accent) 55%,var(--panel))', fg: 'var(--ink)' },
  { bg: 'var(--accent)', fg: 'var(--panel)' },
];

const PERIOD_FOR_RANGE: Record<TimeRange, ChannelActivityPeriodKey> = {
  today: 'today', yesterday: 'yesterday', week: 'this_week', month: 'last_30_days',
};

const PURPOSE_LABELS: Record<Purpose, string> = {
  production: 'Production', engineering: 'Engineering', training: 'Training', calibration: 'Calibration',
};

const UNIT_TEST_TIME_EXCLUDED_LABELS: Record<typeof UNIT_TEST_TIME_EXCLUDED_KEYS[number], string> = {
  review_required: 'review required',
  not_evaluated: 'not evaluated',
  failing_recovery_available: 'recovery available',
  failing_needs_analysis: 'needs analysis',
  other_saved_result: 'another saved analysis result',
  run_in_progress: 'run in progress',
  missing_duration: 'missing duration',
  outside_period: 'finish date outside the range',
};

function liveThroughputChart(data: ChannelActivityConnectedResponse) {
  const maximum = Math.max(1, ...data.daily.map(day => day.channels_tested));
  const gridMaximum = Math.max(4, Math.ceil(maximum / 4) * 4);
  const x0 = 52, x1 = 624, y1 = 172, height = 146;
  const step = (x1 - x0) / data.daily.length;
  const width = Math.max(5, step * 0.62);
  const bars = data.daily.map((day, index) => {
    const barHeight = day.channels_tested ? height * day.channels_tested / gridMaximum : 2;
    const x = x0 + index * step + (step - width) / 2;
    const localDate = new Date(`${day.date}T12:00:00Z`);
    const showLabel = index % 5 === 0 || index === data.daily.length - 1;
    return {
      x: x.toFixed(1), cx: (x + width / 2).toFixed(1), y: (y1 - barHeight).toFixed(1),
      h: barHeight.toFixed(1), w: width.toFixed(1), vy: (y1 - barHeight - 5).toFixed(1),
      value: day.channels_tested ? day.channels_tested.toLocaleString('en-US') : '',
      wd: showLabel ? new Intl.DateTimeFormat('en-US', { weekday: 'narrow', timeZone: 'UTC' }).format(localDate) : '',
      day: showLabel ? day.date.slice(5) : '', date: day.date, partial: day.partial,
      fill: day.partial ? 'color-mix(in srgb,var(--accent) 35%,var(--panel))' : 'var(--accent)',
    };
  });
  const barGrid = [0, 1, 2, 3, 4].map(part => {
    const value = gridMaximum * part / 4;
    return {
      y: (y1 - height * part / 4).toFixed(1), ty: (y1 - height * part / 4 + 4).toFixed(1),
      label: value >= 1000 ? `${(value / 1000).toFixed(value % 1000 ? 1 : 0)}k` : String(value),
    };
  });
  return { bars, barGrid };
}

function lineSegments(values: readonly (number | null)[], x: (index: number) => number, y: (value: number) => number) {
  const segments: string[] = [];
  let current = '';
  values.forEach((value, index) => {
    if (value === null) {
      if (current) segments.push(current);
      current = '';
      return;
    }
    current += `${current ? ' L' : 'M'}${x(index).toFixed(1)} ${y(value).toFixed(1)}`;
  });
  if (current) segments.push(current);
  return segments;
}

function liveFailureSparkline(data: FailureRateConnectedResponse) {
  const values = data.daily.map(day => day.rate === null ? null : day.rate * 100);
  const maximum = Math.max(1, ...values.filter((value): value is number => value !== null));
  const x = (index: number) => values.length === 1 ? 80 : index * 160 / (values.length - 1);
  const y = (value: number) => 31 - value / maximum * 28;
  const points = values.flatMap((value, index) => value === null ? [] : [{ x: x(index), y: y(value), index }]);
  return { segments: lineSegments(values, x, y), points };
}

function liveFailureRateChart(data: FailureRateConnectedResponse) {
  const values = data.daily.map(day => day.rate === null ? null : day.rate * 100);
  const maximumValue = Math.max(1, ...values.filter((value): value is number => value !== null));
  const maximum = Math.max(1, Math.ceil(maximumValue));
  const x0 = 52, x1 = 616, y0 = 20, y1 = 186;
  const x = (index: number) => x0 + (x1 - x0) * index / (values.length - 1);
  const y = (value: number) => y1 - (y1 - y0) * value / maximum;
  const points = values.flatMap((value, index) => value === null ? [] : [{
    x: x(index), y: y(value), value, date: data.daily[index].date,
    partial: data.daily[index].partial, unknown: data.daily[index].unknown_criteria,
  }]);
  const labels = data.daily.flatMap((day, index) => (index % 5 === 0 || index === data.daily.length - 1) ? [{ x: x(index), date: day.date.slice(5) }] : []);
  const grid = [0, 1, 2, 3, 4].map(part => {
    const value = maximum * part / 4;
    return { y: y(value), label: `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%` };
  });
  return { segments: lineSegments(values, x, y), points, labels, grid };
}

// Live histogram is drawn in real pixels (viewBox = measured width) so text stays 11-12px at any card width.
const UNIT_TIME_CHART = { height: 190, inset: 24, baseline: 150, barArea: 110 } as const;

function liveUnitTestTimeHistogram(data: ReturnType<typeof summarizeUnitTestTime>, chartWidth: number) {
  if (data.bins.length === 0 || data.meanMs === null) return null;
  const { inset, baseline, barArea } = UNIT_TIME_CHART;
  const x0 = inset, x1 = chartWidth - inset;
  const maximum = Math.max(1, ...data.bins.map(bin => bin.count));
  const step = (x1 - x0) / data.bins.length;
  const gap = Math.min(10, step * 0.18);
  const first = data.bins[0].startMinute;
  const last = data.bins.at(-1)?.endMinute ?? first + 8;
  const meanX = x0 + (data.meanMs / 60_000 - first) / (last - first) * (x1 - x0);
  const clampedMean = Math.max(x0, Math.min(x1, meanX));
  const bars = data.bins.map((bin, index) => {
    const barHeight = bin.count ? Math.max(3, barArea * bin.count / maximum) : 0;
    const x = x0 + index * step + gap / 2;
    const center = x + (step - gap) / 2;
    // Nudge a count label off the dashed mean line so the line never strikes through it.
    const clash = Math.abs(center - clampedMean) < 10;
    const valueAnchor = !clash ? 'middle' : clampedMean > x1 - 30 ? 'end' : 'start';
    const valueX = !clash ? center : valueAnchor === 'end' ? clampedMean - 5 : clampedMean + 5;
    return {
      x: x.toFixed(1),
      width: (step - gap).toFixed(1),
      valueX: valueX.toFixed(1),
      valueAnchor,
      y: (baseline - barHeight).toFixed(1),
      height: barHeight.toFixed(1),
      valueY: (baseline - barHeight - 6).toFixed(1),
      count: bin.count,
      holdsMean: bin.holdsMean,
    };
  });
  const ticks = [...data.bins.map((bin, index) => ({ x: (x0 + index * step).toFixed(1), label: bin.startMinute })),
    { x: x1.toFixed(1), label: data.bins.at(-1)?.endMinute ?? data.bins[0].startMinute }];
  // Keep the "avg" label inside the frame near either edge.
  const labelAnchor = clampedMean < x0 + 60 ? 'start' : clampedMean > x1 - 60 ? 'end' : 'middle';
  return { bars, ticks, meanX: clampedMean, labelAnchor, width: chartWidth };
}

function pacificHeader(extractedAtUtc: string) {
  const extracted = new Date(extractedAtUtc);
  return {
    date: new Intl.DateTimeFormat('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
    }).format(extracted),
    time: new Intl.DateTimeFormat('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles',
    }).format(extracted),
  };
}

export default function Overview() {
 const [state, setState] = useState<OverviewState>({ range: 'today', cfg: 0, purp: { production: true, engineering: false, training: false, calibration: false } });
 const [livePurposeCounts, setLivePurposeCounts] = useState<Record<Purpose, number> | null>(null);
 const [channelActivity, setChannelActivity] = useState<ChannelActivityState>({ kind: 'loading' });
 const [channelRefresh, setChannelRefresh] = useState(0);
 const [failureRate, setFailureRate] = useState<FailureRateState>({ kind: 'loading' });
 const [failureRefresh, setFailureRefresh] = useState(0);
 const [unitStatus, setUnitStatus] = useState<UnitStatusState>({ kind: 'loading' });
 const [unitStatusRefresh, setUnitStatusRefresh] = useState(0);
 const [unitTestTime, setUnitTestTime] = useState<UnitTestTimeState>({ kind: 'loading' });
 const [unitTestTimeRefresh, setUnitTestTimeRefresh] = useState(0);
 const [unitTestTimeOutcome, setUnitTestTimeOutcome] = useState<UnitTestTimeOutcomeFilter>('all');
 const [kpiUnitTestTime, setKpiUnitTestTime] = useState<UnitTestTimeState>({ kind: 'loading' });
 const [channelFailures, setChannelFailures] = useState<ChannelFailuresState>({ kind: 'loading' });
 const [channelFailuresRefresh, setChannelFailuresRefresh] = useState(0);
 const [stationSummary, setStationSummary] = useState<StationSummaryState>({ kind: 'loading' });
 const [stationRefresh, setStationRefresh] = useState(0);
 const [recentFinishedUnits, setRecentFinishedUnits] = useState<RecentFinishedUnitsState>({ kind: 'loading' });
 const updateLivePurposeCounts = useCallback((counts: Record<Purpose, number> | null) => setLivePurposeCounts(counts), []);
 const resetPurpose = () => setState(current => ({ ...current, purp: { ...PRODUCTION_ONLY } }));
 const values = getOverviewValues(state);
 const { accent, d, kpis, purposes, scope, cfgRows, sel, hist, meanX, meanLX, outSegs, outLegend, linePath, areaPath, lineGrid, dots, avgY, lastX, lastY, bars, barGrid, stations, cells, legendCells, runs } = values;
 const selectedPurposes = useMemo(() => PURPOSES.filter(purpose => state.purp[purpose]), [state.purp]);
 const purposeKey = selectedPurposes.join(',');
 useEffect(() => {
   const controller = new AbortController();
   loadChannelActivity(selectedPurposes, null, null, controller.signal)
     .then(result => setChannelActivity(result.data_source === 'test_database' ? { kind: 'connected', data: result } : { kind: 'demo' }))
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setChannelActivity({ kind: 'error' }); });
   return () => controller.abort();
 }, [channelRefresh, purposeKey, state.range, selectedPurposes]);
 useEffect(() => {
   const controller = new AbortController();
   loadFailureRate(selectedPurposes, null, null, controller.signal)
     .then(result => setFailureRate(result.data_source === 'test_database' ? { kind: 'connected', data: result } : { kind: 'demo' }))
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setFailureRate({ kind: 'error' }); });
   return () => controller.abort();
 }, [failureRefresh, purposeKey, selectedPurposes]);
 useEffect(() => {
   const controller = new AbortController();
   loadUnitStatus(PERIOD_FOR_RANGE[state.range], selectedPurposes, controller.signal)
     .then(result => setUnitStatus(result.data_source === 'test_database' ? { kind: 'connected', data: result } : { kind: 'demo' }))
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setUnitStatus({ kind: 'error' }); });
   return () => controller.abort();
 }, [purposeKey, selectedPurposes, state.range, unitStatusRefresh]);
 useEffect(() => {
   const controller = new AbortController();
   loadUnitTestTime('last_30_days', ['production'], controller.signal)
     .then(result => setUnitTestTime(result.data_source === 'test_database' ? { kind: 'connected', data: result } : { kind: 'demo' }))
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setUnitTestTime({ kind: 'error' }); });
   return () => controller.abort();
 }, [unitTestTimeRefresh]);
 useEffect(() => {
   const controller = new AbortController();
   loadUnitTestTime(PERIOD_FOR_RANGE[state.range], selectedPurposes, controller.signal)
     .then(result => setKpiUnitTestTime(result.data_source === 'test_database' ? { kind: 'connected', data: result } : { kind: 'demo' }))
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setKpiUnitTestTime({ kind: 'error' }); });
   return () => controller.abort();
 }, [purposeKey, selectedPurposes, state.range]);
 useEffect(() => {
   const controller = new AbortController();
   loadRecentFinishedUnits(PERIOD_FOR_RANGE[state.range], selectedPurposes, controller.signal)
     .then(result => setRecentFinishedUnits(result.data_source === 'test_database' ? { kind: 'connected', data: result } : { kind: 'demo' }))
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setRecentFinishedUnits({ kind: 'error' }); });
   return () => controller.abort();
 }, [purposeKey, selectedPurposes, state.range]);
 useEffect(() => {
   const controller = new AbortController();
   loadChannelFailures(PERIOD_FOR_RANGE[state.range], selectedPurposes, controller.signal)
     .then(result => setChannelFailures(result.data_source === 'test_database' ? { kind: 'connected', data: result } : { kind: 'demo' }))
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setChannelFailures({ kind: 'error' }); });
   return () => controller.abort();
 }, [channelFailuresRefresh, purposeKey, selectedPurposes, state.range]);
 useEffect(() => {
   const controller = new AbortController();
   loadStationSummary(selectedPurposes, controller.signal)
     .then(result => setStationSummary(result.data_source === 'test_database' ? { kind: 'connected', data: result } : { kind: 'demo' }))
     .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setStationSummary({ kind: 'error' }); });
   return () => controller.abort();
 }, [purposeKey, selectedPurposes, stationRefresh]);
 const liveChannelData = channelActivity.kind === 'connected' ? channelActivity.data : null;
 const livePeriod = liveChannelData?.periods[PERIOD_FOR_RANGE[state.range]];
 const liveSpark = liveChannelData ? sparkline(liveChannelData.daily.map(day => day.channels_tested), 160, 34) : null;
 const liveChart = liveChannelData ? liveThroughputChart(liveChannelData) : null;
 const liveFailureData = failureRate.kind === 'connected' ? failureRate.data : null;
 const liveFailurePeriod = liveFailureData?.periods[PERIOD_FOR_RANGE[state.range]];
 const liveFailureSpark = liveFailureData ? liveFailureSparkline(liveFailureData) : null;
 const liveFailureChart = liveFailureData ? liveFailureRateChart(liveFailureData) : null;
 const liveUnitData = unitStatus.kind === 'connected' ? unitStatus.data : null;
 const liveUnitTestTime = unitTestTime.kind === 'connected' ? unitTestTime.data : null;
 const liveKpiUnitTestTime = kpiUnitTestTime.kind === 'connected'
   && kpiUnitTestTime.data.period.key === PERIOD_FOR_RANGE[state.range]
   && kpiUnitTestTime.data.filters.purpose.join(',') === purposeKey
   ? kpiUnitTestTime.data : null;
 const liveKpiUnitTestTimeSummary = useMemo(
   () => liveKpiUnitTestTime ? summarizeUnitTestTime(liveKpiUnitTestTime.units, 'all') : null,
   [liveKpiUnitTestTime],
 );
 const liveUnitTestTimeSummary = useMemo(
   () => liveUnitTestTime ? summarizeUnitTestTime(liveUnitTestTime.units, unitTestTimeOutcome) : null,
   [liveUnitTestTime, unitTestTimeOutcome],
 );
 const [unitTimeChartRef, unitTimeChartWidth] = useMeasuredWidth(560);
 const liveUnitTestTimeChart = useMemo(
   () => liveUnitTestTimeSummary ? liveUnitTestTimeHistogram(liveUnitTestTimeSummary, unitTimeChartWidth) : null,
   [liveUnitTestTimeSummary, unitTimeChartWidth],
 );
 const liveUnitTestTimeExcluded = useMemo(() => liveUnitTestTime
   ? UNIT_TEST_TIME_EXCLUDED_KEYS.flatMap(key => liveUnitTestTime.excluded[key] > 0
     ? [`${liveUnitTestTime.excluded[key].toLocaleString('en-US')} ${UNIT_TEST_TIME_EXCLUDED_LABELS[key]}`]
     : [])
   : [], [liveUnitTestTime]);
 const liveUnitOutcomes = useMemo(() => {
   if (!liveUnitData) return null;
   const cohort = liveUnitData.counts.cohort_units;
   const outcomes = UNIT_STATUS_OUTCOME_ORDER.map(status => {
     const count = liveUnitData.counts[status];
     return {
       status,
       label: UNIT_STATUS_LABEL[status],
       count,
       share: cohort === 0 ? '—' : `${(count / cohort * 100).toFixed(1)}%`,
       width: cohort === 0 ? '0%' : `${count / cohort * 100}%`,
       color: UNIT_STATUS_OUTCOME_COLOR[status],
     };
   });
   return {
     outcomes,
     aria: `Current unit status: ${outcomes.map(outcome => `${outcome.count} ${outcome.label.toLowerCase()}`).join(', ')}`,
   };
 }, [liveUnitData]);
 const liveChannelFailures = channelFailures.kind === 'connected' ? channelFailures.data : null;
 const liveHeatmap = useMemo(() => liveChannelFailures ? channelHeatmap(liveChannelFailures) : null, [liveChannelFailures]);
 const liveStations = stationSummary.kind === 'connected' ? stationSummary.data : null;
 const liveStationRows = useMemo(() => liveStations ? stationTableRows(liveStations) : null, [liveStations]);
 const includedPurposes = selectedPurposes.map(purpose => PURPOSE_LABELS[purpose]).join(' + ');
 const liveHeader = liveKpiUnitTestTime ? pacificHeader(liveKpiUnitTestTime.extracted_at_utc) : null;
 return (<>

    <header style={css("display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px")}>
      <div style={css("display:flex;flex-direction:column;gap:4px")}>
        <span style={css("font-size:12.5px;color:var(--muted);font-weight:500")}>{liveHeader?.date ?? 'Thursday, November 5, 2026'}</span>
        <h1 style={css("margin:0;font-size:28px;line-height:1.15;font-weight:650;letter-spacing:-0.02em")}>{scope.heading}</h1>
      </div>
      <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:8px")}>
        <span style={css("display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);padding-right:6px")}><span style={css("width:7px;height:7px;border-radius:50%;background:#2FB36B")}></span>{liveHeader ? `Test database · read ${liveHeader.time} Pacific` : 'Demo snapshot · Nov 5, 2026'}</span>
        <PreviewButton type="button" style={css("min-height:44px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:8px")}>
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"></path></svg>
          Refresh
        </PreviewButton>
        <PreviewButton type="button" style={css("min-height:44px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:8px")}>
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>
          Export
        </PreviewButton>
        <PreviewButton type="button" style={css("min-height:44px;padding:0 16px;border-radius:9px;border:1px solid " + String(accent) + ";background:" + String(accent) + ";color:#fff;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px")}>
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M10 14l4-4M8.5 11.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M15.5 12.5l2-2a3.5 3.5 0 0 0-5-5l-2 2"></path></svg>
          Share view
        </PreviewButton>
      </div>
    </header>

    <p id="overview-scope" className="preview-note">{liveKpiUnitTestTime ? 'Summary range/purpose: live tiles and panels follow the selected range and Run purpose unless they say otherwise. Model, Mode, Channels, Station and Operator are disabled previews and are not applied. Tiles marked Demo are synthetic.' : 'Summary range/purpose: counts, yields, outcomes and activity. Live channel activity and first-observation failure rate follow the selected range and Run purpose. Model, Mode, Channels, Station and Operator are disabled previews and are not applied to them. Other historical charts and sparklines stay fixed.'}</p>
    <section aria-label="Summary filters and global previews" aria-describedby="overview-scope" style={css("display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;padding:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px")}>
      <SegmentedControl label="Time range" options={TIME_RANGES} value={state.range} onChange={range => setState(current => ({ ...current, range }))} size="summary" describedBy="overview-scope" />
      <span aria-hidden="true" style={css("width:1px;height:28px;background:var(--line)")}></span>
      <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Model
        <PreviewSelect style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >All models</option><option >OSX-150</option><option >OSX-100</option></PreviewSelect>
      </label>
      <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Mode
        <PreviewSelect style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >SM + MM</option><option >SM</option><option >MM</option></PreviewSelect>
      </label>
      <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Channels
        <PreviewSelect style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >All</option><option >48</option><option >36</option><option >24</option></PreviewSelect>
      </label>
      <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Station
        <PreviewSelect style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >All stations</option><option >Station 1</option><option >Station 2</option><option >Station 3</option><option >Station 4</option></PreviewSelect>
      </label>
      <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Operator
        <PreviewSelect style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >Anyone</option><option >Demo operator A</option><option >Demo operator B</option><option >Demo operator C</option></PreviewSelect>
      </label>
      <div style={css("flex-basis:100%;height:0")} aria-hidden="true"></div>
      <div role="group" aria-label="Run purpose" aria-describedby="overview-scope" style={css("display:flex;flex-wrap:wrap;align-items:center;gap:6px")}>
        <span style={css("font-size:12.5px;color:var(--muted);font-weight:500;padding:0 4px 0 2px")}>Run purpose</span>
        {purposes.map((p, index1) => <Fragment key={index1}>
          <button type="button" aria-pressed={p.pressed} onClick={() => setState(current => ({ ...current, purp: togglePurpose(current.purp, p.value) }))} style={css(p.style)}>
            <span style={css("width:14px;height:14px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid " + String(p.boxBorder) + ";background:" + String(p.boxBg))}><svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true" style={css("fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;opacity:" + String(p.checkOp))}><path d="M3 8.5l3.2 3L13 4.5"></path></svg></span>
            {p.label}
            <span
              aria-label={`${livePurposeCounts ? livePurposeCounts[p.value] : p.count} runs from ${livePurposeCounts ? 'the live test-database 30-day window' : 'synthetic demo data'}`}
              title={livePurposeCounts ? 'Live run count for the test-database 30-day window' : 'Synthetic demo run count'}
              style={css("font-size:11.5px;font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums")}
            >{livePurposeCounts ? livePurposeCounts[p.value] : p.count}</span>
          </button>
        </Fragment>)}
      </div>
      <label style={css("margin-left:auto;display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Analysis status
        <PreviewSelect style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >Included only</option><option >Included + pending</option><option >Everything, incl. voided and superseded</option></PreviewSelect>
      </label>
    </section>

    <LiveRunActivityCard purposes={state.purp} onPurposeCountsChange={updateLivePurposeCounts} />

    {scope.show && <>
      <div role="status" style={css("display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 14px;border-radius:12px;background:" + String(scope.bg) + ";color:" + String(scope.fg) + ";border:1px solid color-mix(in srgb,currentColor 25%,transparent);font-size:13px")}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={css("flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"></path><path d="M7 15h10"></path></svg>
        <span style={css("font-weight:600")}>{scope.title}</span>
        <span >{scope.text}</span>
        <button type="button" onClick={resetPurpose} style={css("margin-left:auto;min-height:34px;padding:0 12px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;font-weight:600;font-size:12.5px;cursor:pointer")}>Back to production only</button>
      </div>
    </>}

    <section aria-label="Key metrics" style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px")}>
      {kpis.map((demoKpi, index2) => {
        const isLiveChannel = index2 === 0 && livePeriod && liveSpark;
        const isLiveCompleted = index2 === 1 && liveKpiUnitTestTime;
        const isLiveFailure = index2 === 3 && liveFailurePeriod && liveFailureSpark;
        const isLiveAverage = index2 === 4 && liveKpiUnitTestTime && liveKpiUnitTestTimeSummary;
        const isLiveUnit = index2 === 5 && liveUnitData;
        const isLiveTile = Boolean(isLiveChannel || isLiveCompleted || isLiveFailure || isLiveAverage || isLiveUnit);
        const finishedTotal = liveKpiUnitTestTime ? liveKpiUnitTestTime.finished.passed + liveKpiUnitTestTime.finished.unrecoverable : 0;
        const missingDuration = liveKpiUnitTestTime ? finishedTotal - liveKpiUnitTestTime.units.length : 0;
        const k = isLiveChannel ? {
          ...demoKpi,
          value: livePeriod.channels_tested.toLocaleString('en-US'),
          delta: '',
          sub: `${livePeriod.attempts.toLocaleString('en-US')} ${livePeriod.attempts === 1 ? 'attempt' : 'attempts'} · ${livePeriod.units.toLocaleString('en-US')} ${livePeriod.units === 1 ? 'unit' : 'units'}`,
          line: liveSpark.line,
          area: liveSpark.area,
        } : isLiveCompleted ? {
          ...demoKpi,
          value: finishedTotal.toLocaleString('en-US'),
          delta: '',
          sub: `${liveKpiUnitTestTime.finished.passed.toLocaleString('en-US')} passed · ${liveKpiUnitTestTime.finished.unrecoverable.toLocaleString('en-US')} unrecoverable`,
          line: '',
          area: '',
        } : isLiveFailure ? {
          ...demoKpi,
          value: liveFailurePeriod.rate === null ? '—' : `${(liveFailurePeriod.rate * 100).toFixed(1)}%`,
          delta: '',
          sub: `${liveFailurePeriod.failed.toLocaleString('en-US')} of ${liveFailurePeriod.observed.toLocaleString('en-US')} first channel observations · strict > run limits`,
          line: '',
          area: '',
        } : isLiveAverage ? {
          ...demoKpi,
          label: 'Avg test time per unit',
          value: liveKpiUnitTestTimeSummary.meanMs === null ? '—' : formatDuration(liveKpiUnitTestTimeSummary.meanMs / 1000),
          delta: '',
          sub: `${liveKpiUnitTestTimeSummary.n.toLocaleString('en-US')} finished ${liveKpiUnitTestTimeSummary.n === 1 ? 'unit' : 'units'}${liveKpiUnitTestTimeSummary.sampleLabel ? ` · ${liveKpiUnitTestTimeSummary.sampleLabel}` : ''}`,
          line: '',
          area: '',
        } : isLiveUnit ? {
          ...demoKpi,
          value: liveUnitData.counts.failing_no_measured_recovery.toLocaleString('en-US'),
          delta: '',
          sub: 'currently failing, no measured recovery',
          line: '',
          area: '',
        } : demoKpi;
        const lastPoint = isLiveChannel ? k.line.split(' ').at(-1)?.split(',') : null;
        return <Fragment key={index2}>
        <div style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 16px 12px;display:flex;flex-direction:column;gap:6px;min-width:0")}>
          <span style={css("display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 8px;font-size:12.5px;color:var(--muted);font-weight:500")}>
            <span title={isLiveUnit ? 'Current measured status; this is not a scrap or reject record.' : undefined}>{k.label}</span>
            <span title={isLiveUnit ? 'Current measured status; this is not a scrap or reject record.' : undefined} style={css(isLiveTile
              ? "white-space:nowrap;font-size:10px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;padding:3px 7px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent-ink)"
              : "white-space:nowrap;font-size:10px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;padding:3px 7px;border-radius:999px;background:var(--panel2);color:var(--muted)")}>{isLiveTile ? 'Live · test database' : 'Demo'}</span>
          </span>
          {isLiveChannel && <span style={css("font-size:10.5px;color:var(--muted)")}>Channels with test activity · {includedPurposes}</span>}
          {(isLiveCompleted || isLiveAverage) && <span style={css("font-size:10.5px;color:var(--muted)")}>Finished units · {includedPurposes}</span>}
          {isLiveFailure && <span style={css("font-size:10.5px;color:var(--muted)")}>First observation per run-channel · {includedPurposes}</span>}
          <div style={css("display:flex;align-items:baseline;gap:8px;flex-wrap:wrap")}>
            <span style={css("font-size:30px;line-height:1.05;font-weight:650;letter-spacing:-0.025em;font-variant-numeric:tabular-nums;color:" + String(k.valueColor))}>{k.value}</span>
            {!isLiveTile && <span style={css("font-size:12px;font-weight:600;padding:2px 7px;border-radius:6px;background:" + String(k.dBg) + ";color:" + String(k.dFg) + ";white-space:nowrap")}>{k.delta}</span>}
          </div>
          <span style={css("font-size:12px;color:var(--muted);min-height:17px")}>{k.sub}</span>
          {isLiveCompleted && <span style={css("font-size:11px;color:var(--muted)")}>Not a final manufacturing disposition.</span>}
          {isLiveCompleted && liveKpiUnitTestTime.incomplete && <span style={css("font-size:11px;color:var(--warn-fg)")}>Bounded cohort is incomplete.</span>}
          {isLiveAverage && missingDuration > 0 && <span style={css("font-size:11px;color:var(--muted)")}>{missingDuration.toLocaleString('en-US')} finished without a known duration, not averaged.</span>}
          {isLiveFailure && liveFailurePeriod.unknown_criteria > 0 && <span style={css("font-size:11px;color:var(--warn-fg)")}>{liveFailurePeriod.unknown_criteria.toLocaleString('en-US')} first observations excluded: unknown criteria</span>}
          {isLiveUnit && <span style={css("font-size:11px;color:var(--ink2)")}>+ {liveUnitData.counts.failing_needs_analysis.toLocaleString('en-US')} need analysis · {liveUnitData.counts.failing_recovery_available.toLocaleString('en-US')} recovery available</span>}
          {isLiveUnit && liveUnitData.incomplete && <span style={css("font-size:11px;color:var(--warn-fg)")}>Bounded cohort is incomplete.</span>}
          {isLiveUnit && <button type="button" onClick={() => setUnitStatusRefresh(value => value + 1)} style={css("align-self:flex-start;min-height:28px;padding:0 8px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);font-size:10.5px;font-weight:600")}>Refresh unit status</button>}
          {!isLiveUnit && !isLiveCompleted && !isLiveAverage && <svg viewBox="0 0 160 34" preserveAspectRatio="none" aria-hidden="true" style={css("width:100%;height:30px;display:block;margin-top:2px")}>
            {!isLiveFailure && <path d={k.area} style={css("fill:" + String(accent) + ";fill-opacity:0.08;stroke:none")}></path>}
            {!isLiveFailure && <polyline points={k.line} vectorEffect="non-scaling-stroke" style={css("fill:none;stroke:" + String(accent) + ";stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round")}></polyline>}
            {isLiveFailure && liveFailureSpark.segments.map((path, index) => <path key={index} d={path} vectorEffect="non-scaling-stroke" style={css("fill:none;stroke:" + String(accent) + ";stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round")} />)}
            {isLiveFailure && liveFailureSpark.points.map(point => <circle key={point.index} cx={point.x} cy={point.y} r="1.4" vectorEffect="non-scaling-stroke" style={css("fill:var(--panel);stroke:" + String(accent) + ";stroke-width:1.2")} />)}
            {isLiveChannel && lastPoint && <circle cx={lastPoint[0]} cy={lastPoint[1]} r="3" vectorEffect="non-scaling-stroke" style={css("fill:var(--panel);stroke:" + String(accent) + ";stroke-width:1.5;stroke-dasharray:2 1")} />}
          </svg>}
        </div>
      </Fragment>})}
    </section>

    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      {!liveUnitTestTime && <div style={css("flex:3 1 640px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 18px 10px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Insertion-loss test time by configuration</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>Run start to run end, complete production runs, last 30 days. Select a row to inspect its distribution.</span>
          </div>
          <a href="#/queries" className="lnk" style={css("font-size:13px;display:inline-flex;align-items:center;min-height:32px;white-space:nowrap")}>Open in console</a>
        </div>
        <ConfigurationTable rows={cfgRows} onSelect={cfg => setState(current => ({ ...current, cfg }))} />
      </div>}

      <div id="unit-test-time-panel" style={css((liveUnitTestTime ? "flex:1 1 100%;" : "flex:2 1 380px;") + "min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        {liveUnitTestTime && liveUnitTestTimeSummary ? <>
          <div style={css("display:flex;justify-content:space-between;align-items:flex-start;gap:10px")}>
            <div style={css("display:flex;flex-direction:column;gap:3px")}>
              <span style={css("display:flex;align-items:center;flex-wrap:wrap;gap:7px")}>
                <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Time to test one unit</h2>
                <span className="live-unit-badge">Live · test database</span>
              </span>
              <span style={css("font-size:12.5px;color:var(--muted)")}>{liveUnitTestTimeSummary.n} finished {liveUnitTestTimeSummary.n === 1 ? 'unit' : 'units'}, last 30 days{liveUnitTestTimeSummary.sampleLabel ? ` · ${liveUnitTestTimeSummary.sampleLabel}` : ''}</span>
            </div>
            <button type="button" aria-label="Refresh unit test time" onClick={() => setUnitTestTimeRefresh(value => value + 1)} style={css("align-self:flex-start;min-height:28px;padding:0 8px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);font-size:10.5px;font-weight:600")}>Refresh</button>
          </div>
          <div role="group" aria-label="Unit test time outcome" style={css("display:flex;flex-wrap:wrap;gap:5px")}>
            {([['all', 'All'], ['passed', 'Passed'], ['unrecoverable', 'Unrecoverable']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={unitTestTimeOutcome === value} onClick={() => setUnitTestTimeOutcome(value)} style={css("min-height:30px;padding:0 9px;border-radius:7px;border:1px solid " + (unitTestTimeOutcome === value ? 'color-mix(in srgb,var(--accent) 45%,var(--line))' : 'var(--line)') + ";background:" + (unitTestTimeOutcome === value ? 'color-mix(in srgb,var(--accent) 8%,var(--panel))' : 'var(--panel)') + ";color:var(--ink2);font-size:11.5px;font-weight:600")}>{label}</button>)}
          </div>
          <div style={css("display:flex;flex-wrap:wrap;gap:16px;align-items:stretch")}>
            <div style={css("flex:1 1 220px;max-width:320px;display:flex;flex-direction:column;gap:8px")}>
              <div style={css("padding:9px 12px;border-radius:9px;background:var(--panel2);display:flex;justify-content:space-between;align-items:baseline;gap:10px")}><span style={css("font-size:12px;color:var(--muted)")}>Average</span><span style={css("font-size:18px;font-weight:650;font-variant-numeric:tabular-nums")}>{liveUnitTestTimeSummary.meanMs === null ? '—' : formatDuration(liveUnitTestTimeSummary.meanMs / 1000)}</span></div>
              <div style={css("padding:9px 12px;border-radius:9px;background:var(--panel2);display:flex;justify-content:space-between;align-items:baseline;gap:10px")}><span style={css("font-size:12px;color:var(--muted)")}>Median</span><span style={css("font-size:18px;font-weight:650;font-variant-numeric:tabular-nums")}>{liveUnitTestTimeSummary.medianMs === null ? '—' : formatDuration(liveUnitTestTimeSummary.medianMs / 1000)}</span></div>
              <div style={css("padding:9px 12px;border-radius:9px;background:var(--panel2);display:flex;justify-content:space-between;align-items:baseline;gap:10px")}><span style={css("font-size:12px;color:var(--muted)")}>Slowest 10%</span><span style={css("font-size:18px;font-weight:650;font-variant-numeric:tabular-nums")}>{liveUnitTestTimeSummary.p90Ms === null ? '—' : `${formatDuration(liveUnitTestTimeSummary.p90Ms / 1000)}+`}</span></div>
            </div>
            <div ref={unitTimeChartRef} style={css("flex:3 1 360px;min-width:0;display:flex;align-items:center")}>
              <svg id="configuration-histogram" data-source="live-unit-test-time" width={unitTimeChartWidth} height={UNIT_TIME_CHART.height} viewBox={`0 0 ${unitTimeChartWidth} ${UNIT_TIME_CHART.height}`} role="img" aria-label={`Histogram of ${liveUnitTestTimeSummary.n} finished units, ${unitTestTimeOutcome} outcomes, last 30 days${liveUnitTestTimeSummary.meanMs === null ? '' : `, average ${formatDuration(liveUnitTestTimeSummary.meanMs / 1000)}`}`} style={css("display:block;max-width:100%")}>
                <line x1={UNIT_TIME_CHART.inset} x2={unitTimeChartWidth - UNIT_TIME_CHART.inset} y1={UNIT_TIME_CHART.baseline} y2={UNIT_TIME_CHART.baseline} style={css("stroke:var(--line);stroke-width:1")}></line>
                {liveUnitTestTimeChart?.bars.map((bar, index4) => <g key={index4} data-mean-bin={bar.holdsMean ? 'true' : undefined}>
                  <rect x={bar.x} y={bar.y} width={bar.width} height={bar.height} rx="3" style={css("fill:" + (bar.holdsMean ? String(accent) : 'color-mix(in srgb,var(--accent) 38%,var(--panel))'))}></rect>
                  {bar.count > 0 && <text x={bar.valueX} y={bar.valueY} style={css("font-size:12px;font-weight:600;fill:var(--ink2);text-anchor:" + bar.valueAnchor + ";font-family:'Geist Mono',monospace")}>{bar.count}</text>}
                </g>)}
                {liveUnitTestTimeChart?.ticks.map((tick, index4) => <text key={index4} x={tick.x} y={UNIT_TIME_CHART.baseline + 16} style={css("font-size:11.5px;fill:var(--muted);text-anchor:middle;font-family:'Geist Mono',monospace")}>{tick.label}</text>)}
                {liveUnitTestTimeChart && liveUnitTestTimeSummary.meanMs !== null && <>
                  <line data-mean-line="true" x1={liveUnitTestTimeChart.meanX} x2={liveUnitTestTimeChart.meanX} y1="22" y2={UNIT_TIME_CHART.baseline} style={css("stroke:var(--ink);stroke-width:1.4;stroke-dasharray:4 3")}></line>
                  <text x={liveUnitTestTimeChart.meanX} y="15" style={css("font-size:12px;font-weight:600;fill:var(--ink);text-anchor:" + liveUnitTestTimeChart.labelAnchor)}>avg {formatDuration(liveUnitTestTimeSummary.meanMs / 1000)}</text>
                </>}
                <text x={unitTimeChartWidth / 2} y="186" style={css("font-size:11.5px;fill:var(--muted);text-anchor:middle")}>minutes per unit</text>
              </svg>
            </div>
          </div>
          {liveUnitTestTimeSummary.n === 0 && <span style={css("font-size:12.5px;color:var(--muted)")}>No finished units in this range.</span>}
          <div style={css("display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--muted);line-height:1.45")}>
            <span>Sum of each unit&apos;s production runs: idle-excluded time where session timing is confirmed, otherwise run start to end. Finished means passing, or failing with a current analysis that found no recovery; not a final manufacturing disposition.</span>
            <span>{liveUnitTestTimeSummary.fallbackRunTotal.toLocaleString('en-US')} of {(liveUnitTestTimeSummary.activeRunTotal + liveUnitTestTimeSummary.fallbackRunTotal).toLocaleString('en-US')} runs used start-to-end time.</span>
            {liveUnitTestTimeSummary.over90Minutes > 0 && <span>{liveUnitTestTimeSummary.over90Minutes.toLocaleString('en-US')} over 90 minutes, included.</span>}
            {liveUnitTestTimeExcluded.length > 0 && <span>Not counted: {liveUnitTestTimeExcluded.join(', ')}.</span>}
            {liveUnitTestTime.incomplete && <span style={css("color:var(--warn-fg)")}>Bounded cohort is incomplete.</span>}
          </div>
        </> : <>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Time to test one unit</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>{sel.title} · {sel.units} units, last 30 days</span>
          </div>
          <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
            <div style={css("flex:1 1 80px;padding:8px 10px;border-radius:9px;background:var(--panel2)")}><div style={css("font-size:11.5px;color:var(--muted)")}>Average</div><div style={css("font-size:17px;font-weight:650;font-variant-numeric:tabular-nums")}>{sel.avg}</div></div>
            <div style={css("flex:1 1 80px;padding:8px 10px;border-radius:9px;background:var(--panel2)")}><div style={css("font-size:11.5px;color:var(--muted)")}>Median</div><div style={css("font-size:17px;font-weight:650;font-variant-numeric:tabular-nums")}>{sel.med}</div></div>
            <div style={css("flex:1 1 80px;padding:8px 10px;border-radius:9px;background:var(--panel2)")}><div style={css("font-size:11.5px;color:var(--muted)")}>Slowest 10%</div><div style={css("font-size:17px;font-weight:650;font-variant-numeric:tabular-nums")}>{sel.p90}+</div></div>
          </div>
          <svg id="configuration-histogram" viewBox="0 0 400 200" role="img" aria-label={sel.aria} style={css("width:100%;height:auto;display:block")}>
            <line x1="12" x2="388" y1="160" y2="160" style={css("stroke:var(--line);stroke-width:1")}></line>
            {hist.map((h, index4) => <Fragment key={index4}>
              <g >
                <rect x={h.x} y={h.y} width={h.w} height={h.h} rx="3" style={css("fill:" + String(h.fill))}></rect>
                <text x={h.cx} y={h.vy} style={css("font-size:11px;font-weight:600;fill:var(--ink2);text-anchor:middle;font-family:'Geist Mono',monospace")}>{h.count}</text>
                <text x={h.lx} y="176" style={css("font-size:11px;fill:var(--muted);text-anchor:middle;font-family:'Geist Mono',monospace")}>{h.label}</text>
              </g>
            </Fragment>)}
            <line x1={meanX} x2={meanX} y1="26" y2="160" style={css("stroke:var(--ink);stroke-width:1.4;stroke-dasharray:4 3")}></line>
            <text x={meanLX} y="20" style={css("font-size:11.5px;font-weight:600;fill:var(--ink);text-anchor:middle")}>avg {sel.avg}</text>
            <text x="200" y="196" style={css("font-size:11px;fill:var(--muted);text-anchor:middle")}>minutes per unit</text>
          </svg>
        </>}
      </div>
    </section>

    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:1 1 480px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Daily channel failure rate</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>{liveFailureData ? 'First observation per run-channel; retest runs have their own first observations. Thirty complete Pacific dates plus today, partial.' : 'First-pass channels over the fail limit at either wavelength, last 20 workdays.'}</span>
            <span style={css(liveFailureData
              ? "align-self:flex-start;font-size:10px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;padding:3px 7px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent-ink)"
              : "align-self:flex-start;font-size:10px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;padding:3px 7px;border-radius:999px;background:var(--panel2);color:var(--muted)")}>{liveFailureData ? `Live · test database · ${includedPurposes}` : 'Demo'}</span>
          </div>
          <div style={css("display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px 14px;font-size:12px;color:var(--muted);align-items:center")}>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:14px;height:2.5px;background:" + String(accent) + ";border-radius:2px")}></span>Daily</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:14px;border-top:1.5px dashed var(--muted)")}></span>{liveFailureData ? 'Strict > run limits' : '30-day avg 3.9%'}</span>
            <button type="button" onClick={() => setFailureRefresh(value => value + 1)} style={css("min-height:32px;padding:0 9px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);font-size:11.5px;font-weight:600")}>Refresh failure rate</button>
          </div>
        </div>
        {!liveFailureData && <svg viewBox="0 0 640 220" role="img" aria-label="Line chart of daily channel failure rate over 20 workdays, ranging 3.3 to 4.5 percent, 4.1 percent today" style={css("width:100%;height:auto;display:block")}>
          {lineGrid.map((g, index5) => <Fragment key={index5}>
            <g >
              <line x1="44" x2="624" y1={g.y} y2={g.y} style={css("stroke:var(--grid);stroke-width:1")}></line>
              <text x="36" y={g.ty} style={css("font-size:11px;fill:var(--muted);text-anchor:end;font-family:'Geist Mono',monospace")}>{g.label}</text>
            </g>
          </Fragment>)}
          <line x1="44" x2="624" y1={avgY} y2={avgY} style={css("stroke:var(--muted);stroke-width:1;stroke-dasharray:4 4")}></line>
          <path d={areaPath} style={css("fill:" + String(accent) + ";fill-opacity:0.10;stroke:none")}></path>
          <path d={linePath} style={css("fill:none;stroke:" + String(accent) + ";stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round")}></path>
          {dots.map((p, index6) => <Fragment key={index6}>
            <g >
              <circle cx={p.x} cy={p.y} r={p.r} style={css("fill:var(--panel);stroke:" + String(accent) + ";stroke-width:1.8")}></circle>
              <text x={p.x} y="208" style={css("font-size:11px;fill:var(--muted);text-anchor:middle")}>{p.label}</text>
            </g>
          </Fragment>)}
          <text x={lastX} y={lastY} style={css("font-size:12px;font-weight:650;fill:var(--ink);text-anchor:end")}>4.1% today</text>
        </svg>}
        {liveFailureData && liveFailureChart && <svg viewBox="0 0 640 220" role="img" aria-label={`Live daily first-observation run-channel failure rate using strict greater-than each run's saved limit snapshot, Pacific dates ${liveFailureData.daily[0].date} through ${liveFailureData.daily.at(-1)?.date}; null-rate dates are gaps and today is partial`} style={css("width:100%;height:auto;display:block")}>
          <desc>Q02 first-observation failure fraction by Pacific local date. Retest runs have their own first observations. Equality at a saved run limit passes; only strict greater-than fails.</desc>
          {liveFailureChart.grid.map((grid, index) => <g key={index}>
            <line x1="44" x2="624" y1={grid.y} y2={grid.y} style={css("stroke:var(--grid);stroke-width:1")} />
            <text x="36" y={grid.y + 4} style={css("font-size:11px;fill:var(--muted);text-anchor:end;font-family:'Geist Mono',monospace")}>{grid.label}</text>
          </g>)}
          {liveFailureChart.segments.map((path, index) => <path key={index} d={path} style={css("fill:none;stroke:" + String(accent) + ";stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round")} />)}
          {liveFailureChart.points.map(point => <circle key={point.date} cx={point.x} cy={point.y} r={point.partial ? 5 : 3} style={css("fill:var(--panel);stroke:" + String(accent) + ";stroke-width:1.8" + (point.partial ? ";stroke-dasharray:2 1" : ''))}>
            <title>{`${point.date}: ${point.value.toFixed(1)}% · ${point.unknown} unknown criteria${point.partial ? ' · partial' : ''}`}</title>
          </circle>)}
          {liveFailureChart.labels.map(label => <text key={label.date} x={label.x} y="208" style={css("font-size:11px;fill:var(--muted);text-anchor:middle")}>{label.date}</text>)}
        </svg>}
      </div>

      <div style={css("flex:1 1 480px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Channels tested per day</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>{liveChannelData ? 'Thirty complete local dates plus today in Pacific time; today is partial.' : 'Last 14 days. Today is partial, as of 08:27.'}</span>
            <span style={css(liveChannelData
              ? "align-self:flex-start;font-size:10px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;padding:3px 7px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent-ink)"
              : "align-self:flex-start;font-size:10px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;padding:3px 7px;border-radius:999px;background:var(--panel2);color:var(--muted)")}>{liveChannelData ? `Live · test database · ${includedPurposes}` : 'Demo'}</span>
          </div>
          <div style={css("display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px 14px;font-size:12px;color:var(--muted);align-items:center")}>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:" + String(accent))}></span>{liveChannelData ? 'Local date' : 'Workday'}</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:color-mix(in srgb," + String(accent) + " 35%,var(--panel))")}></span>Today, partial</span>
            <button type="button" onClick={() => setChannelRefresh(value => value + 1)} style={css("min-height:32px;padding:0 9px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);font-size:11.5px;font-weight:600")}>Refresh channel activity</button>
          </div>
        </div>
        <svg viewBox="0 0 640 220" role="img" aria-label={liveChannelData ? `Live bar chart of channels with test activity for 31 Pacific local dates, ${includedPurposes}; ${liveChannelData.daily.at(-1)?.channels_tested ?? 0} today so far` : 'Bar chart of channels tested per day, about 2,300 to 2,600 per workday, 1,008 so far today'} style={css("width:100%;height:auto;display:block")}>
          {(liveChart?.barGrid ?? barGrid).map((g, index7) => <Fragment key={index7}>
            <g >
              <line x1="48" x2="624" y1={g.y} y2={g.y} style={css("stroke:var(--grid);stroke-width:1")}></line>
              <text x="40" y={g.ty} style={css("font-size:11px;fill:var(--muted);text-anchor:end;font-family:'Geist Mono',monospace")}>{g.label}</text>
            </g>
          </Fragment>)}
          {(liveChart?.bars ?? bars).map((b, index8) => <Fragment key={index8}>
            <g >
              {'date' in b && <title>{`${String(b.date)}: ${b.value || '0'} channels with test activity${'partial' in b && b.partial === true ? ' (partial)' : ''}`}</title>}
              <rect x={b.x} y={b.y} width={'w' in b ? String(b.w) : '28'} height={b.h} rx="4" style={css("fill:" + String(b.fill) + ('partial' in b && b.partial === true ? ';stroke:var(--accent);stroke-width:1;stroke-dasharray:2 2' : ''))}></rect>
              {!liveChannelData && <text x={b.cx} y={b.vy} style={css("font-size:10px;fill:var(--ink2);text-anchor:middle;font-family:'Geist Mono',monospace")}>{b.value}</text>}
              <text x={b.cx} y="190" style={css("font-size:10.5px;fill:var(--muted);text-anchor:middle")}>{b.wd}</text>
              <text x={b.cx} y="206" style={css("font-size:11px;fill:var(--ink2);text-anchor:middle;font-weight:500")}>{b.day}</text>
            </g>
          </Fragment>)}
        </svg>
      </div>
    </section>

    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:1 1 320px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:14px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <span style={css("display:flex;align-items:center;flex-wrap:wrap;gap:7px")}>
              <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Unit outcomes</h2>
              {liveUnitData && <span className="live-unit-badge">Live · test database</span>}
            </span>
            {liveUnitData
              ? <span style={css("font-size:12.5px;color:var(--muted)")}>Current status of {liveUnitData.counts.cohort_units.toLocaleString('en-US')} units tested {d.label}.{liveUnitData.incomplete && <span style={css("color:var(--warn-fg)")}> Bounded cohort is incomplete.</span>}</span>
              : <span style={css("font-size:12.5px;color:var(--muted)")}>{d.outCaption}</span>}
          </div>
          <a href="#/failures" className="lnk" style={css("font-size:13px;display:inline-flex;align-items:center;min-height:32px")}>Failure examples</a>
        </div>
        <div role="img" aria-label={liveUnitOutcomes?.aria ?? d.outAria} style={css(`display:flex;height:16px;border-radius:5px;overflow:hidden;gap:${liveUnitOutcomes ? '0' : '2px'}${liveUnitOutcomes ? ';background:var(--line2)' : ''}`)}>
          {liveUnitOutcomes
            ? liveUnitOutcomes.outcomes.filter(outcome => outcome.count > 0).map(outcome => <div key={outcome.status} style={css(`width:${outcome.width};background:${outcome.color}`)} />)
            : outSegs.map((s, index9) => <Fragment key={index9}><div style={css("width:" + String(s.pct) + "%;background:" + String(s.color))}></div></Fragment>)}
        </div>
        <div style={css("display:flex;flex-direction:column")}>
          {(liveUnitOutcomes?.outcomes ?? outLegend).map((o, index10) => <Fragment key={'status' in o ? o.status : index10}>
            <div style={css("display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--line2)")}>
              <span style={css("display:flex;align-items:center;gap:9px")}><span style={css("width:10px;height:10px;border-radius:3px;background:" + String(o.color))}></span>{o.label}</span>
              <span style={css("display:flex;align-items:baseline;gap:10px;font-variant-numeric:tabular-nums")}><span style={css("font-size:15px;font-weight:650")}>{typeof o.count === 'number' ? o.count.toLocaleString('en-US') : o.count}</span><span style={css("font-size:12px;color:var(--muted);min-width:44px;text-align:right")}>{o.share}</span></span>
            </div>
          </Fragment>)}
        </div>
        {liveUnitData && liveUnitData.counts.cohort_units === 0 && <span style={css("font-size:12.5px;color:var(--muted)")}>No units tested in this range.</span>}
        {liveUnitData && <span style={css("font-size:11.5px;color:var(--muted)")}>Current measured status at extraction time. Not a first-pass yield or a final scrap decision.</span>}
        <div style={css("display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px solid var(--line)")}>
          <span style={css("display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600")}>Which wavelength fails{liveUnitData && <span title="Example only; not from the test database." style={css("font-size:10px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;padding:3px 7px;border-radius:999px;background:var(--panel2);color:var(--muted)")}>Demo</span>}</span>
          <div role="img" aria-label="Failed channels by wavelength: 1550 nm only 58 percent, 1310 nm only 27 percent, both 15 percent" style={css("display:flex;height:10px;border-radius:4px;overflow:hidden;gap:2px")}>
            <div style={css("width:58%;background:var(--o1)")}></div><div style={css("width:27%;background:var(--o2)")}></div><div style={css("width:15%;background:var(--o3)")}></div>
          </div>
          <div style={css("display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ink2)")}>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:9px;height:9px;border-radius:2px;background:var(--o1)")}></span>1550 nm only <b style={css("font-weight:650")}>58%</b></span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:9px;height:9px;border-radius:2px;background:var(--o2)")}></span>1310 nm only <b style={css("font-weight:650")}>27%</b></span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:9px;height:9px;border-radius:2px;background:var(--o3)")}></span>Both <b style={css("font-weight:650")}>15%</b></span>
          </div>
        </div>
      </div>

      <div style={css("flex:1.4 1 440px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <div style={css("display:flex;justify-content:space-between;align-items:flex-start;gap:10px")}>
            <span style={css("display:flex;align-items:center;flex-wrap:wrap;gap:7px")}>
              <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Stations, last 30 days</h2>
              {liveStations && <span className="live-unit-badge">Live · test database</span>}
            </span>
            {liveStations && <button type="button" aria-label="Refresh station summary" onClick={() => setStationRefresh(value => value + 1)} style={css("min-height:28px;padding:0 8px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);font-size:10.5px;font-weight:600")}>Refresh</button>}
          </div>
          <span style={css("font-size:12.5px;color:var(--muted)")}>{liveStations ? 'Time is wall-clock run time per channel (median), so 24, 36 and 48-channel units compare fairly.' : 'Time is per channel so 24, 36 and 48-channel units compare fairly.'}</span>
        </div>
        <div style={css("overflow-x:auto")}>
          <div role="table" aria-label="Station comparison" style={css("min-width:420px")}>
            <div role="row" style={css("display:grid;grid-template-columns:1fr 0.7fr 0.9fr 1.5fr 0.8fr;gap:10px;padding:0 4px 9px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);font-weight:500")}>
              <span role="columnheader">Station</span>
              <span role="columnheader" style={css("text-align:right")}>Units</span>
              <span role="columnheader" style={css("text-align:right")}>s / channel</span>
              <span role="columnheader">Channel failure rate</span>
              <span role="columnheader" style={css("text-align:right")}>Retests</span>
            </div>
            {liveStationRows ? liveStationRows.map(row => <div role="row" key={row.key} style={css("display:grid;grid-template-columns:1fr 0.7fr 0.9fr 1.5fr 0.8fr;gap:10px;align-items:center;padding:11px 4px;font-variant-numeric:tabular-nums;" + (row.total ? 'border-top:1px solid var(--line);margin-top:-1px' : 'border-bottom:1px solid var(--line2)'))}>
                <span role="cell" style={css("font-weight:600")}>{row.name}</span>
                <span role="cell" style={css("text-align:right;color:var(--ink2)" + (row.total ? ';font-weight:600' : ''))}>{row.units}</span>
                <span role="cell" title={row.secondsTitle} style={css("text-align:right;color:var(--ink2)" + (row.total ? ';font-weight:600' : ''))}>{row.secondsPerChannel}</span>
                <span role="cell" title={row.failTitle} style={css("display:flex;align-items:center;gap:8px")}><span style={css("flex:1;height:7px;border-radius:4px;background:var(--line2);overflow:hidden")}><span style={css("display:block;height:7px;border-radius:4px;width:" + row.barWidth + "%;background:" + String(accent))}></span></span><span style={css("min-width:40px;text-align:right;font-weight:600;color:var(--ink)")}>{row.failRate}</span></span>
                <span role="cell" title={row.retestTitle} style={css("text-align:right;color:var(--ink2)" + (row.total ? ';font-weight:600' : ''))}>{row.retests}</span>
              </div>) : stations.map((s, index11) => <Fragment key={index11}>
              <div role="row" style={css("display:grid;grid-template-columns:1fr 0.7fr 0.9fr 1.5fr 0.8fr;gap:10px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--line2);font-variant-numeric:tabular-nums")}>
                <span role="cell" style={css("font-weight:600")}>{s.name}</span>
                <span role="cell" style={css("text-align:right;color:var(--ink2)")}>{s.units}</span>
                <span role="cell" style={css("text-align:right;color:var(--ink2)")}>{s.spc}</span>
                <span role="cell" style={css("display:flex;align-items:center;gap:8px")}><span style={css("flex:1;height:7px;border-radius:4px;background:var(--line2);overflow:hidden")}><span style={css("display:block;height:7px;border-radius:4px;width:" + String(s.w) + "%;background:" + String(s.barColor))}></span></span><span style={css("min-width:40px;text-align:right;font-weight:600;color:" + String(s.fColor))}>{s.fail}</span></span>
                <span role="cell" style={css("text-align:right;color:var(--ink2)")}>{s.retest}</span>
              </div>
            </Fragment>)}
          </div>
        </div>
        {liveStations ? <div style={css("display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--muted)")}>
          {liveStations.stations.length === 0 && <span style={css("font-size:12.5px")}>No station activity in the last 30 days.</span>}
          <span>Station-level only. Rates pool first observations; a station with few runs can swing widely.</span>
          {liveStations.totals.unknown_criteria > 0 && <span>{liveStations.totals.unknown_criteria.toLocaleString('en-US')} observations with unknown limits not counted.</span>}
          {liveStations.incomplete && <span style={css("color:var(--warn-fg)")}>Run cap reached; results are incomplete.</span>}
        </div> : <div style={css("display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:var(--warn-bg);color:var(--warn-fg);font-size:12.5px")}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={css("flex:0 0 auto;margin-top:1px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M12 3l9.5 17h-19z"></path><path d="M12 10v4M12 17.5v.01"></path></svg>
          <span >Station 2 fails 0.5 pts above the line average and retests the most. Worth checking its reference and patch cords.</span>
        </div>}
      </div>

      <div style={css("flex:1.2 1 380px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <span style={css("display:flex;align-items:center;flex-wrap:wrap;gap:7px")}>
              <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Failures by logical channel</h2>
              {liveChannelFailures && <span className="live-unit-badge">Live · test database</span>}
            </span>
            {liveChannelFailures
              ? <span style={css("font-size:12.5px;color:var(--muted)")}>First observation per run-channel, strict &gt; each run's saved limit · {liveChannelFailures.runs.toLocaleString('en-US')} {liveChannelFailures.runs === 1 ? 'run' : 'runs'} {d.label}.</span>
              : <span style={css("font-size:12.5px;color:var(--muted)")}>48-channel units, first pass, last 30 days.</span>}
          </div>
          {liveChannelFailures && <button type="button" aria-label="Refresh channel failures" onClick={() => setChannelFailuresRefresh(value => value + 1)} style={css("align-self:flex-start;min-height:28px;padding:0 8px;border-radius:6px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);font-size:10.5px;font-weight:600")}>Refresh</button>}
        </div>
        <div style={css("display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px")}>
          {liveHeatmap ? liveHeatmap.cells.map(cell => {
            const tone = cell.level === null ? { bg: 'var(--panel2)', fg: 'var(--muted)' } : LIVE_HEAT_RAMP[cell.level];
            return <div key={cell.channel} title={cell.title} style={css("aspect-ratio:1/0.82;border-radius:6px;padding:4px 5px;display:flex;flex-direction:column;justify-content:space-between;background:" + tone.bg + ";color:" + tone.fg + ";outline:" + (cell.highlight ? '2px solid var(--ink)' : 'none'))}>
              <span style={css("font-size:10px;opacity:0.8;line-height:1")}>{cell.channel}</span>
              <span style={css("font-size:12.5px;font-weight:650;font-family:'Geist Mono',monospace;text-align:right;line-height:1")}>{cell.failed === null ? '—' : cell.failed.toLocaleString('en-US')}</span>
            </div>;
          }) : cells.map((c, index12) => <Fragment key={index12}>
            <div title={c.title} style={css("aspect-ratio:1/0.82;border-radius:6px;padding:4px 5px;display:flex;flex-direction:column;justify-content:space-between;background:" + String(c.bg) + ";color:" + String(c.fg) + ";outline:" + String(c.ring))}>
              <span style={css("font-size:10px;opacity:0.8;line-height:1")}>{c.n}</span>
              <span style={css("font-size:12.5px;font-weight:650;font-family:'Geist Mono',monospace;text-align:right;line-height:1")}>{c.count}</span>
            </div>
          </Fragment>)}
        </div>
        <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:11.5px;color:var(--muted)")}>
          <span >Fewer</span>
          <span style={css("display:flex;gap:2px")}>{(liveHeatmap ? LIVE_HEAT_RAMP : legendCells).map((l, index13) => <Fragment key={index13}><span style={css("width:18px;height:10px;border-radius:2px;background:" + String(l.bg))}></span></Fragment>)}</span>
          <span >More</span>
          <span style={css("margin-left:auto;color:var(--ink2)")}>{liveHeatmap
            ? (liveHeatmap.standouts.length ? `Ch ${liveHeatmap.standouts.join(', ')} stand${liveHeatmap.standouts.length === 1 ? 's' : ''} out` : 'No failures in this range')
            : 'Ch 19, 33, 41 stand out'}</span>
        </div>
        {liveChannelFailures && liveChannelFailures.totals.unknown_criteria > 0 && <span style={css("font-size:11.5px;color:var(--muted)")}>{liveChannelFailures.totals.unknown_criteria.toLocaleString('en-US')} observations with unknown limits not counted.</span>}
        {liveChannelFailures?.incomplete && <span style={css("font-size:11.5px;color:var(--warn-fg)")}>Run cap reached; results are incomplete.</span>}
      </div>
    </section>

    <RecentActivity data={runs} live={recentFinishedUnits.kind === 'connected' ? recentFinishedUnits.data : null} />

    <footer style={css("font-size:12px;color:var(--muted);line-height:1.55;max-width:900px")}>{recentFinishedUnits.kind === 'connected' ? 'Panels marked Live use the connected test database; remaining examples are synthetic. Manufacturing disposition is not established.' : 'Entirely synthetic demonstration. Metric definitions and manufacturing disposition require review before production use.'}</footer>

</>);
}
