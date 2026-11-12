import { useEffect, useMemo, useRef, useState } from 'react';
import {
  loadAssignmentHardware,
  loadRunChannels,
  loadUnitDetail,
  searchUnits,
  UnitLookupClientError,
  type AssignmentHardwareConnectedResponse,
  type ChannelAttempt,
  type Classification,
  type ReplacementAnalysisItem,
  type RunChannelsConnectedResponse,
  type UnitDetailConnectedResponse,
  type UnitRun,
  type UnitSearchConnectedResponse,
} from '../../lib/api/unitLookup';
import type { UnitHashRoute } from '../../lib/routes';
import type { LiveWavelength, Purpose } from '../../types';
import { SegmentedControl } from '../SegmentedControl';

type AsyncState<T> =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: T }
  | { kind: 'not_found' }
  | { kind: 'failed'; message: string };

interface KeyedState<T> { key: number | null; state: AsyncState<T> }

interface LiveUnitViewProps {
  route: UnitHashRoute;
  onNavigate: (unitId: number | null, runId: number | null, mode?: 'push' | 'replace') => void;
}

interface RecentLiveUnit { unitId: number; serial: string }

function rememberLiveUnit(unitId: number, serial: string): void {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem('lwa-recent-live-units') ?? '[]');
    const recent = Array.isArray(parsed) ? parsed.filter((item): item is RecentLiveUnit => {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) return false;
      const record = item as Record<string, unknown>;
      return Number.isSafeInteger(record.unitId) && (record.unitId as number) > 0 && typeof record.serial === 'string' && record.serial.length > 0;
    }) : [];
    localStorage.setItem('lwa-recent-live-units', JSON.stringify([{ unitId, serial }, ...recent.filter(item => item.unitId !== unitId)].slice(0, 5)));
    window.dispatchEvent(new CustomEvent('lwa-unit-context', { detail: { connected: true } }));
  } catch { /* Recent-unit history is optional. */ }
}

const purposeLabels: Record<Purpose, string> = {
  production: 'production', engineering: 'engineering', training: 'training', calibration: 'calibration',
};
const classificationLabels: Record<Classification, string> = {
  pass: 'Pass', warning: 'Warning', fail: 'Fail', too_good: 'Too good', unknown: 'Unknown',
};

function LiveBadge() {
  return <span className="live-unit-badge">Live · test database</span>;
}

function localDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function localTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}

function Time({ value, compact = false }: { value: string; compact?: boolean }) {
  return <time dateTime={value} title={`${value} (UTC)`}>{compact ? localTime(value) : localDate(value)}</time>;
}

function formatSeconds(value: number | null): string {
  if (value === null) return '—';
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${String(seconds).padStart(2, '0')}s`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

function humanize(value: string): string {
  return value.replace(/^fail_/, '').replaceAll('_', ' ');
}

function savedAnalysisLabel(value: string): string {
  return value === 'fail_no_viable_recovery' ? 'no viable recovery' : humanize(value);
}

function requestFailure(error: unknown): string {
  if (error instanceof UnitLookupClientError) {
    if (error.kind === 'database') return `Database check failed (${error.code ?? 'reporting_error'}).`;
    if (error.kind === 'invalid_response') return 'The live response was not recognized.';
    if (error.kind === 'request_failed') return 'The live request could not be completed.';
  }
  return 'Backend not reachable on 127.0.0.1:8000.';
}

function StateMessage({ state, empty }: { state: AsyncState<unknown>; empty?: string }) {
  if (state.kind === 'loading') return <div className="live-unit-state" role="status">Loading live test-database data…</div>;
  if (state.kind === 'failed') return <div className="live-unit-state" role="status">{state.message}</div>;
  if (state.kind === 'not_found') return <div className="live-unit-state" role="status">Not found.</div>;
  if (state.kind === 'idle' && empty) return <div className="live-unit-state">{empty}</div>;
  return null;
}

function Panel({ title, detail, children, className = '' }: { title: string; detail?: string; children: React.ReactNode; className?: string }) {
  return <section className={`live-unit-panel ${className}`}>
    <div className="live-unit-panel-heading">
      <div><LiveBadge /><h2>{title}</h2>{detail && <p>{detail}</p>}</div>
    </div>
    {children}
  </section>;
}

function SearchResults({ state, query, onOpen }: { state: AsyncState<UnitSearchConnectedResponse>; query: string; onOpen: (unitId: number) => void }) {
  if (query.trim().length < 2) return <p className="preview-note" role="status">Enter at least 2 characters of a main-board or switch serial.</p>;
  if (state.kind !== 'ready') return <StateMessage state={state} />;
  if (state.data.items.length === 0) return <div className="live-unit-state" role="status">No units match.</div>;
  return <div className="live-unit-search-results" role="list" aria-label="Matching live units">
    {state.data.items.map(item => <button type="button" role="listitem" key={item.unit_id} onClick={() => onOpen(item.unit_id)}>
      <span><strong>{item.main_board_serial}</strong><small>{item.part_number ?? 'Part —'} · {item.unit_model ?? 'Model —'}</small></span>
      <span><strong>{item.current_switch_serial ?? 'Switch —'}</strong><small>{item.current_switch_model ?? 'Model —'}</small></span>
      <span><strong>{item.last_run_started_at_utc ? <Time value={item.last_run_started_at_utc} /> : 'No runs'}</strong><small>{item.run_count} {item.run_count === 1 ? 'run' : 'runs'}</small></span>
    </button>)}
    {state.data.has_more && <p role="status">More than 20 matches; refine your search.</p>}
  </div>;
}

function RunSelector({ detail, selectedRun, onSelect }: { detail: UnitDetailConnectedResponse; selectedRun: UnitRun | null; onSelect: (runId: number) => void }) {
  return <Panel title="Runs" detail="Newest first · select a run to update all run-scoped evidence.">
    {detail.runs.length === 0 ? <div className="live-unit-state">This unit has no runs.</div> : <div className="live-unit-run-list" role="list" aria-label="Unit runs">
      {detail.runs.map(run => <button type="button" role="listitem" key={run.run_id} aria-current={selectedRun?.run_id === run.run_id ? 'true' : undefined} onClick={() => onSelect(run.run_id)}>
        <span><strong>Run {run.run_number}</strong><small><Time value={run.run_started_at_utc} /></small></span>
        <span><strong>{humanize(run.run_purpose)}</strong><small>{humanize(run.completion_status)}</small></span>
        <span><strong>{humanize(run.analysis_status)}{run.void_info ? ' · voided' : ''}</strong><small>{humanize(run.timing.quality)}</small></span>
        <span><strong>{run.counts.failing_channels ?? '—'} fail · {run.counts.warning_channels ?? '—'} warn</strong><small>{run.void_info?.reason ?? (run.superseded_by_run_id ? `Superseded by run ID ${run.superseded_by_run_id}` : 'Current recorded state')}</small></span>
      </button>)}
    </div>}
    {detail.has_more && <p className="live-unit-warning" role="status">The 200-run cap was reached; older runs are not shown.</p>}
  </Panel>;
}

function HeaderCard({ detail, selectedRun, hardware }: { detail: UnitDetailConnectedResponse; selectedRun: UnitRun | null; hardware: AsyncState<AssignmentHardwareConnectedResponse> }) {
  const activeAssignment = detail.assignments.find(assignment => assignment.removed_at_utc === null) ?? null;
  const counts = Object.fromEntries((['production', 'engineering', 'training', 'calibration'] as Purpose[]).map(purpose => [purpose, detail.runs.filter(run => run.run_purpose === purpose).length])) as Record<Purpose, number>;
  const latestAnalysis = hardware.kind === 'ready' ? hardware.data.analyses[0] ?? null : null;
  return <section className="live-unit-header">
    <div className="live-unit-header-top">
      <div><LiveBadge /><h1>{detail.unit.main_board_serial}</h1><p>{detail.unit.part_number ?? 'Part number —'} · {detail.unit.unit_model ?? 'Model —'} · {detail.unit.front_panel_channel_count ?? '—'} front-panel channels</p></div>
    </div>
    {latestAnalysis && <div className="live-unit-analysis-note"><strong>Saved analysis: {savedAnalysisLabel(latestAnalysis.result_status)}</strong><span>This is historical analysis evidence, not a final manufacturing disposition.</span></div>}
    <dl className="live-unit-summary">
      <div><dt>Active switch</dt><dd>{activeAssignment?.switch_serial ?? '—'} · {activeAssignment?.switch_model ?? '—'} · firmware {activeAssignment?.firmware_version ?? '—'}</dd></div>
      <div><dt>Runs by purpose</dt><dd>{(['production', 'engineering', 'training', 'calibration'] as Purpose[]).map(purpose => `${counts[purpose]} ${purposeLabels[purpose]}`).join(' · ')}</dd></div>
      <div><dt>Selected run</dt><dd>{selectedRun ? `Run ${selectedRun.run_number} · ${humanize(selectedRun.completion_status)} · ${humanize(selectedRun.analysis_status)}` : '—'}</dd></div>
      <div><dt>Station / tester</dt><dd>{selectedRun ? `${selectedRun.station_number === null ? 'Station —' : `Station ${selectedRun.station_number}`} · ${selectedRun.tested_by}` : '—'}</dd></div>
      <div><dt>Timing</dt><dd>{selectedRun ? `${formatSeconds(selectedRun.timing.elapsed_seconds)} elapsed · ${formatSeconds(selectedRun.timing.active_seconds)} active · ${humanize(selectedRun.timing.quality)}` : '—'}</dd></div>
      <div><dt>Limits used</dt><dd>{selectedRun?.limits ? `too good < ${selectedRun.limits.too_good_below_db.toFixed(2)} · ${selectedRun.limits.warning_enabled && selectedRun.limits.warning_above_db !== null ? `warn > ${selectedRun.limits.warning_above_db.toFixed(2)} · ` : ''}fail > ${selectedRun.limits.fail_above_db.toFixed(2)} dB` : '—'}</dd></div>
      <div><dt>Run window</dt><dd>{selectedRun ? <><Time value={selectedRun.run_started_at_utc} /> → {selectedRun.run_ended_at_utc ? <Time value={selectedRun.run_ended_at_utc} /> : 'open'}</> : '—'}</dd></div>
      <div><dt>Assignment history</dt><dd>{detail.assignments.length}{detail.assignments_incomplete ? '+' : ''} recorded assignment{detail.assignments.length === 1 ? '' : 's'}</dd></div>
    </dl>
  </section>;
}

interface TimelineEvent { at: string; title: string; text: string; color: string }

function Timeline({ detail, hardware }: { detail: UnitDetailConnectedResponse; hardware: AsyncState<AssignmentHardwareConnectedResponse> }) {
  const events = useMemo(() => {
    const items: TimelineEvent[] = [];
    for (const assignment of detail.assignments) {
      items.push({ at: assignment.installed_at_utc, title: 'Assignment installed', text: `${assignment.switch_serial} installed by ${assignment.installed_by}.`, color: 'var(--info-fg)' });
      if (assignment.removed_at_utc) items.push({ at: assignment.removed_at_utc, title: 'Assignment removed', text: `${assignment.switch_serial} removed by ${assignment.removed_by ?? '—'}${assignment.removal_reason ? ` · ${assignment.removal_reason}` : ''}.`, color: 'var(--muted)' });
    }
    for (const run of detail.runs) {
      items.push({ at: run.run_started_at_utc, title: `Run ${run.run_number} started`, text: `${humanize(run.run_purpose)} · ${run.station_number === null ? 'station —' : `Station ${run.station_number}`} · ${run.tested_by}.`, color: 'var(--line)' });
      if (run.run_ended_at_utc) items.push({ at: run.run_ended_at_utc, title: `Run ${run.run_number} ended`, text: `${humanize(run.completion_status)} · ${humanize(run.analysis_status)}.`, color: run.completion_status === 'failed' ? 'var(--bad-fg)' : 'var(--ok-fg)' });
    }
    if (hardware.kind === 'ready') {
      for (const replacement of hardware.data.replacements) items.push({ at: replacement.replaced_at_utc, title: `Channel ${replacement.logical_channel} replaced`, text: `Port ${replacement.previous_physical_port} → ${replacement.replacement_physical_port} · ${replacement.reason} · ${replacement.replaced_by}.`, color: 'var(--accent)' });
      for (const analysis of hardware.data.analyses) items.push({ at: analysis.analyzed_at_utc, title: 'Saved analysis', text: `${savedAnalysisLabel(analysis.result_status)} · ${analysis.analyzed_by}.`, color: 'var(--warn-fg)' });
    }
    return items.sort((first, second) => Date.parse(first.at) - Date.parse(second.at));
  }, [detail, hardware]);
  return <Panel title="What happened" detail="Recorded starts, ends, assignment changes, replacements and saved analyses in time order.">
    {hardware.kind === 'failed' && <p className="live-unit-warning">Assignment events are unavailable: {hardware.message}</p>}
    <ol className="live-unit-timeline">
      {events.map((event, index) => <li key={`${event.at}-${event.title}-${index}`} style={{ borderTopColor: event.color }}>
        <span><Time value={event.at} /></span><strong>{event.title}</strong><p>{event.text}</p>
      </li>)}
    </ol>
  </Panel>;
}

function classificationColor(classification: Classification): string {
  if (classification === 'fail') return 'var(--bad-fg)';
  if (classification === 'warning') return 'var(--warn-fg)';
  if (classification === 'too_good') return 'var(--info-fg)';
  if (classification === 'pass') return 'var(--ok-fg)';
  return 'var(--muted)';
}

function LossChart({ run, channels }: { run: UnitRun; channels: RunChannelsConnectedResponse }) {
  const current = channels.logical_channels.filter(item => item.is_current).sort((a, b) => (a.logical_channel ?? 0) - (b.logical_channel ?? 0));
  const [wavelength, setWavelength] = useState<LiveWavelength>('both');
  if (current.length === 0) return <div className="live-unit-state">This run has no current logical-channel measurements.</div>;
  const firstNm = current[0].wavelength_1_nm;
  const secondNm = current[0].wavelength_2_nm;
  const limits = run.limits;
  const values = current.flatMap(item => [item.wavelength_1_il_db, item.wavelength_2_il_db]);
  if (limits) values.push(limits.too_good_below_db, limits.fail_above_db, ...(limits.warning_above_db === null ? [] : [limits.warning_above_db]));
  let minimum = Math.min(...values);
  let maximum = Math.max(...values);
  const padding = Math.max((maximum - minimum) * .15, .2);
  minimum = Math.floor((minimum - padding) * 2) / 2;
  maximum = Math.ceil((maximum + padding) * 2) / 2;
  if (maximum <= minimum) maximum = minimum + 1;
  const y = (value: number) => 214 - (value - minimum) / (maximum - minimum) * 196;
  const step = 930 / current.length;
  const ticks = Array.from({ length: 5 }, (_, index) => minimum + (maximum - minimum) * index / 4);
  const rule = current.find(item => item.classification_rule)?.classification_rule ?? 'Unknown, invalid or missing run limit snapshot';
  const description = `Insertion loss for ${current.length} current logical channels in run ${run.run_number}. Bars use the API classification. ${limits ? `Reference limits are too good below ${limits.too_good_below_db.toFixed(2)} and fail above ${limits.fail_above_db.toFixed(2)} dB.` : 'The saved limits could not be validated.'}`;
  return <>
    <div className="live-unit-chart-controls">
      <div className="live-unit-legend">
        {(['pass', 'warning', 'fail', 'too_good', 'unknown'] as Classification[]).map(item => <span key={item}><i style={{ background: classificationColor(item) }} />{classificationLabels[item]}</span>)}
      </div>
      <SegmentedControl label="Wavelength" value={wavelength} onChange={setWavelength} options={[
        { value: 'both', label: 'Both' }, { value: 'first', label: `${firstNm} nm` }, { value: 'second', label: `${secondNm} nm` },
      ]} describedBy="live-wavelength-scope" />
    </div>
    {!limits && <p className="live-unit-warning" role="status">This run's saved limits could not be validated; reference lines are omitted.</p>}
    {limits && <div className="live-limit-legend" aria-label="Run limit reference lines">
      <span><i className="too-good-line" />Too good below {limits.too_good_below_db.toFixed(2)} dB</span>
      {limits.warning_enabled && limits.warning_above_db !== null && <span><i className="warning-line" />Warning above {limits.warning_above_db.toFixed(2)} dB</span>}
      <span><i className="fail-line" />Fail above {limits.fail_above_db.toFixed(2)} dB</span>
    </div>}
    <p id="live-wavelength-scope" className="preview-note">Wavelength selection highlights this chart only; maps and tables keep both readings.</p>
    <div className="live-unit-chart-scroll" tabIndex={0} role="region" aria-label="Insertion loss chart, scroll horizontally on narrow screens">
      <svg viewBox="0 0 1000 250" role="img" aria-label={description}>
        <title>{description}</title>
        {ticks.map((tick, index) => <g key={tick}>
          <line x1="50" x2="980" y1={y(tick)} y2={y(tick)} className="live-chart-grid" />
          <text x="43" y={y(tick) + 4} className="live-chart-axis">{tick.toFixed(2)}</text>
          {index === 0 && <text x="14" y="116" className="live-chart-axis" transform="rotate(-90 14 116)">insertion loss (dB)</text>}
        </g>)}
        {limits && <>
          <line x1="50" x2="980" y1={y(limits.too_good_below_db)} y2={y(limits.too_good_below_db)} className="live-chart-too-good"><title>Too-good below {limits.too_good_below_db.toFixed(4)} dB</title></line>
          {limits.warning_enabled && limits.warning_above_db !== null && <line x1="50" x2="980" y1={y(limits.warning_above_db)} y2={y(limits.warning_above_db)} className="live-chart-warning"><title>Warning above {limits.warning_above_db.toFixed(4)} dB</title></line>}
          <line x1="50" x2="980" y1={y(limits.fail_above_db)} y2={y(limits.fail_above_db)} className="live-chart-fail"><title>Fail above {limits.fail_above_db.toFixed(4)} dB</title></line>
        </>}
        {current.map((item, index) => {
          const center = 50 + index * step + step / 2;
          const color = classificationColor(item.classification ?? 'unknown');
          const showLabel = current.length <= 24 || index === 0 || (index + 1) % Math.ceil(current.length / 12) === 0 || item.classification !== 'pass';
          return <g key={item.measurement_id}>
            <rect x={center - 7} y={y(item.wavelength_1_il_db)} width="6" height={214 - y(item.wavelength_1_il_db)} rx="1.5" fill={color} opacity={wavelength === 'second' ? .16 : 1}>
              <title>Channel {item.logical_channel}, {item.wavelength_1_nm} nm: {item.wavelength_1_il_db.toFixed(4)} dB, {classificationLabels[item.classification ?? 'unknown']}</title>
            </rect>
            <rect x={center + 1} y={y(item.wavelength_2_il_db)} width="6" height={214 - y(item.wavelength_2_il_db)} rx="1.5" fill={color} opacity={wavelength === 'first' ? .16 : .72}>
              <title>Channel {item.logical_channel}, {item.wavelength_2_nm} nm: {item.wavelength_2_il_db.toFixed(4)} dB, {classificationLabels[item.classification ?? 'unknown']}</title>
            </rect>
            {showLabel && <text x={center} y="232" className="live-chart-channel">{item.logical_channel}</text>}
          </g>;
        })}
        <text x="515" y="248" className="live-chart-label">logical channel</text>
      </svg>
    </div>
    <p className="preview-note"><strong>Classification rule:</strong> {rule}.</p>
    {channels.incomplete && <p className="live-unit-warning">The 5,000-attempt cap was reached; channel evidence is incomplete.</p>}
  </>;
}

function ChannelMap({ hardware, channels }: { hardware: AssignmentHardwareConnectedResponse; channels: RunChannelsConnectedResponse }) {
  const currentByChannel = new Map(channels.logical_channels.filter(item => item.is_current && item.logical_channel !== null).map(item => [item.logical_channel as number, item]));
  if (hardware.channel_map.length === 0) return <div className="live-unit-state">No channel map was recorded for this assignment.</div>;
  return <div className="unit-channel-map live-channel-map" role="list" aria-label="Live logical channel map">
    {hardware.channel_map.map(item => {
      const measurement = currentByChannel.get(item.logical_channel);
      const classification = measurement?.classification ?? 'unknown';
      const worst = measurement ? Math.max(measurement.wavelength_1_il_db, measurement.wavelength_2_il_db) : null;
      const title = `Channel ${item.logical_channel}: effective port ${item.effective_physical_port}; initial port ${item.initial_physical_port}${item.latest_replaced_at_utc ? `; latest replacement ${item.latest_replaced_at_utc} UTC` : ''}${measurement ? `; worst insertion loss ${worst?.toFixed(4)} dB; ${classificationLabels[classification]}` : '; no current measurement in this run'}`;
      return <div role="listitem" tabIndex={0} key={item.logical_channel} title={title} aria-label={title} data-detail={title} className={`live-channel-cell classification-${classification}${item.is_replaced ? ' is-replaced' : ''}`}>
        <span><small>{item.logical_channel}</small><strong>p{item.effective_physical_port}</strong></span>
        <b>{worst === null ? '—' : worst.toFixed(2)}</b>
      </div>;
    })}
  </div>;
}

function ExtraPorts({ run, channels, hardware }: { run: UnitRun; channels: RunChannelsConnectedResponse; hardware: AssignmentHardwareConnectedResponse }) {
  const runExtras = channels.extra_candidates.filter(item => item.is_current);
  const spareByPort = new Map(hardware.spares.map(item => [item.physical_port, item]));
  return <div className="live-unit-subsections">
    <div><h3>Selected run candidates</h3>{runExtras.length === 0 ? <p className="preview-note">No current extra candidates in run {run.run_number}.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Selected run extra candidates, scroll horizontally on narrow screens"><table className="live-unit-table"><thead><tr><th>Port</th><th>{runExtras[0].wavelength_1_nm} nm</th><th>{runExtras[0].wavelength_2_nm} nm</th><th>Classification</th><th>Written</th></tr></thead><tbody>{runExtras.map(item => <tr key={item.measurement_id}><th>p{item.physical_port}</th><td title={item.wavelength_1_il_db.toFixed(4)}>{item.wavelength_1_il_db.toFixed(2)}</td><td title={item.wavelength_2_il_db.toFixed(4)}>{item.wavelength_2_il_db.toFixed(2)}</td><td>{classificationLabels[item.classification ?? 'unknown']}</td><td><Time value={item.written_at_utc} /></td></tr>)}</tbody></table></div>}</div>
    <div><h3>Confirmed assignment hardware</h3>{hardware.extra_ports.length === 0 ? <p className="preview-note">No confirmed extra-port measurements.</p> : <div className="table-scroll" tabIndex={0} role="region" aria-label="Assignment extra ports, scroll horizontally on narrow screens"><table className="live-unit-table"><thead><tr><th>Port</th><th>Wavelength 1</th><th>Wavelength 2</th><th>Analysis</th><th>Latest spare designation</th></tr></thead><tbody>{hardware.extra_ports.map((item, index) => {
      const spare = spareByPort.get(item.physical_port);
      return <tr key={`${item.physical_port}-${item.run_id}-${index}`}><th>p{item.physical_port}</th><td title={item.wavelength_1_il_db.toFixed(4)}>{item.wavelength_1_nm} nm · {item.wavelength_1_il_db.toFixed(2)}</td><td title={item.wavelength_2_il_db.toFixed(4)}>{item.wavelength_2_nm} nm · {item.wavelength_2_il_db.toFixed(2)}</td><td>{humanize(item.analysis_status)}</td><td>{spare ? <>{humanize(spare.action)} · <Time value={spare.recorded_at_utc} /></> : '—'}</td></tr>;
    })}</tbody></table></div>}</div>
  </div>;
}

function ReplacementHistory({ detail, hardware, onSelectRun }: { detail: UnitDetailConnectedResponse; hardware: AssignmentHardwareConnectedResponse; onSelectRun: (runId: number) => void }) {
  const runIds = new Set(detail.runs.map(run => run.run_id));
  if (hardware.replacements.length === 0) return <div className="live-unit-state">No replacement events were recorded for this assignment.</div>;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Replacement history, scroll horizontally on narrow screens"><table className="live-unit-table replacement-table"><thead><tr><th>At</th><th>Channel</th><th>Port move</th><th>Reason / by</th><th>Related run</th><th>Recommendation</th></tr></thead><tbody>{[...hardware.replacements].sort((a, b) => Date.parse(a.replaced_at_utc) - Date.parse(b.replaced_at_utc)).map(item => <tr key={item.replacement_id}><td><Time value={item.replaced_at_utc} /></td><th>{item.logical_channel}</th><td>p{item.previous_physical_port} → p{item.replacement_physical_port}</td><td>{item.reason}<small>{item.replaced_by}{item.notes ? ` · ${item.notes}` : ''}</small></td><td>{item.related_run_id && runIds.has(item.related_run_id) ? <button type="button" className="lnk table-link" onClick={() => onSelectRun(item.related_run_id as number)}>Run ID {item.related_run_id}</button> : item.related_run_id ?? '—'}</td><td>{item.source_recommendation_id ? `Recommendation ID ${item.source_recommendation_id}` : 'Not from a recommendation'}</td></tr>)}</tbody></table></div>;
}

function Attempts({ channels }: { channels: RunChannelsConnectedResponse }) {
  const groups = new Map<number, ChannelAttempt[]>();
  for (const attempt of channels.logical_channels) {
    if (attempt.logical_channel === null) continue;
    groups.set(attempt.logical_channel, [...(groups.get(attempt.logical_channel) ?? []), attempt]);
  }
  const included = new Set([...groups.entries()].filter(([, attempts]) => attempts.length > 1 || attempts.some(item => item.is_current && item.classification !== 'pass' && item.classification !== 'unknown')).map(([channel]) => channel));
  const rows = channels.logical_channels.filter(item => item.logical_channel !== null && included.has(item.logical_channel));
  if (rows.length === 0) return <div className="live-unit-state">No repeated, failing, warning or too-good logical-channel attempts.</div>;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Measurement attempts, scroll horizontally on narrow screens"><table className="live-unit-table attempts-table"><thead><tr><th>Channel</th><th>Attempt</th><th>Port</th><th>Wavelength 1</th><th>Wavelength 2</th><th>State</th><th>Written</th><th>By</th></tr></thead><tbody>{rows.map(item => <tr key={item.measurement_id} className={item.is_current ? '' : 'superseded-row'}><th>{item.logical_channel}</th><td>#{item.attempt_number}</td><td>p{item.physical_port}</td><td title={item.wavelength_1_il_db.toFixed(4)}>{item.wavelength_1_nm} nm · {item.wavelength_1_il_db.toFixed(2)}</td><td title={item.wavelength_2_il_db.toFixed(4)}>{item.wavelength_2_nm} nm · {item.wavelength_2_il_db.toFixed(2)}</td><td>{item.is_current ? `Current · ${classificationLabels[item.classification ?? 'unknown']}` : 'Superseded'}</td><td><Time value={item.written_at_utc} /></td><td>{item.written_by}</td></tr>)}</tbody></table></div>;
}

function SavedAnalyses({ analyses }: { analyses: ReplacementAnalysisItem[] }) {
  if (analyses.length === 0) return <div className="live-unit-state">No saved analyses were recorded for this assignment.</div>;
  return <div className="saved-analysis-list">{[...analyses].sort((a, b) => Date.parse(b.analyzed_at_utc) - Date.parse(a.analyzed_at_utc)).map(analysis => <article key={analysis.analysis_id}>
    <header><div><strong>{humanize(analysis.result_status)}</strong><span>Run ID {analysis.run_id} · <Time value={analysis.analyzed_at_utc} /> · {analysis.analyzed_by}</span></div></header>
    {analysis.recommendations.length === 0 ? <p>No ranked recommendations.</p> : <ol>{[...analysis.recommendations].sort((a, b) => a.recommendation_rank - b.recommendation_rank).map(item => <li key={item.recommendation_id}>
      <span><strong>#{item.recommendation_rank} · {humanize(item.category)}</strong> · channel {item.logical_channel} · p{item.current_physical_port} → p{item.candidate_physical_port}</span>
      <span>Worst loss {item.current_worst_loss_db.toFixed(2)} → {item.candidate_worst_loss_db.toFixed(2)} dB · improvement {item.improvement_db.toFixed(2)} dB</span>
      <span>Current {item.current_wavelength_1_il_db.toFixed(2)} / {item.current_wavelength_2_il_db.toFixed(2)} · candidate {item.candidate_wavelength_1_il_db.toFixed(2)} / {item.candidate_wavelength_2_il_db.toFixed(2)} dB</span>
      {item.used && <em>Linked to a recorded replacement</em>}
    </li>)}</ol>}
  </article>)}</div>;
}

function UnitNotFound({ message, onBack }: { message: string; onBack: () => void }) {
  return <section className="empty-state" role="status"><h1>Unit or run not found</h1><p>{message}</p><button type="button" className="lnk empty-action" onClick={onBack}>Return to live unit search</button></section>;
}

export function LiveUnitView({ route, onNavigate }: LiveUnitViewProps) {
  const [query, setQuery] = useState(route.serial ?? '');
  const [searchState, setSearchState] = useState<AsyncState<UnitSearchConnectedResponse>>({ kind: 'idle' });
  const [detailSnapshot, setDetailSnapshot] = useState<KeyedState<UnitDetailConnectedResponse>>({ key: null, state: { kind: 'idle' } });
  const [channelsSnapshot, setChannelsSnapshot] = useState<KeyedState<RunChannelsConnectedResponse>>({ key: null, state: { kind: 'idle' } });
  const [hardwareSnapshot, setHardwareSnapshot] = useState<KeyedState<AssignmentHardwareConnectedResponse>>({ key: null, state: { kind: 'idle' } });
  const hardwareCache = useRef(new Map<number, AssignmentHardwareConnectedResponse>());
  const lastAutoOpen = useRef('');

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState({ kind: 'loading' });
      searchUnits(trimmed, controller.signal).then(result => {
        if (result.data_source !== 'test_database') {
          setSearchState({ kind: 'failed', message: result.data_source === 'not_connected' ? 'Live reporting is no longer connected.' : 'Search result not found.' });
          return;
        }
        setSearchState({ kind: 'ready', data: result });
        const exact = result.items.find(item => item.main_board_serial.toLocaleLowerCase() === trimmed.toLocaleLowerCase() || item.current_switch_serial?.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
        const autoKey = exact ? `${trimmed.toLocaleLowerCase()}:${exact.unit_id}` : '';
        if (exact && autoKey !== lastAutoOpen.current && route.unitId !== exact.unit_id) {
          lastAutoOpen.current = autoKey;
          onNavigate(exact.unit_id, null);
        }
      }).catch(error => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setSearchState({ kind: 'failed', message: requestFailure(error) });
      });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [onNavigate, query, route.unitId]);

  useEffect(() => {
    hardwareCache.current.clear();
    if (route.unitId === null) return;
    const controller = new AbortController();
    loadUnitDetail(route.unitId, controller.signal).then(result => {
      if (result.data_source === 'not_found') { setDetailSnapshot({ key: route.unitId, state: { kind: 'not_found' } }); return; }
      if (result.data_source === 'not_connected') { setDetailSnapshot({ key: route.unitId, state: { kind: 'failed', message: 'Live reporting is no longer connected.' } }); return; }
      setDetailSnapshot({ key: route.unitId, state: { kind: 'ready', data: result } });
      rememberLiveUnit(result.unit.unit_id, result.unit.main_board_serial);
    }).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setDetailSnapshot({ key: route.unitId, state: { kind: 'failed', message: requestFailure(error) } });
    });
    return () => controller.abort();
  }, [route.unitId]);

  const detailState: AsyncState<UnitDetailConnectedResponse> = route.unitId === null
    ? { kind: 'idle' }
    : detailSnapshot.key === route.unitId ? detailSnapshot.state : { kind: 'loading' };
  const detail = detailState.kind === 'ready' ? detailState.data : null;
  const selectedRun = detail?.runs.find(run => run.run_id === route.runId) ?? null;
  const invalidRun = detail !== null && route.runId !== null && selectedRun === null;

  useEffect(() => {
    if (detail && route.runId === null && detail.runs[0]) onNavigate(detail.unit.unit_id, detail.runs[0].run_id, 'replace');
  }, [detail, onNavigate, route.runId]);

  const channelsState: AsyncState<RunChannelsConnectedResponse> = selectedRun === null
    ? { kind: 'idle' }
    : channelsSnapshot.key === selectedRun.run_id ? channelsSnapshot.state : { kind: 'loading' };
  const hardwareState: AsyncState<AssignmentHardwareConnectedResponse> = selectedRun === null
    ? { kind: 'idle' }
    : hardwareSnapshot.key === selectedRun.assignment_id ? hardwareSnapshot.state : { kind: 'loading' };

  useEffect(() => {
    if (!selectedRun) return;
    const channelsController = new AbortController();
    const hardwareController = new AbortController();
    loadRunChannels(selectedRun.run_id, channelsController.signal).then(result => {
      if (result.data_source === 'test_database') setChannelsSnapshot({ key: selectedRun.run_id, state: { kind: 'ready', data: result } });
      else setChannelsSnapshot({ key: selectedRun.run_id, state: result.data_source === 'not_found' ? { kind: 'not_found' } : { kind: 'failed', message: 'Live reporting is no longer connected.' } });
    }).catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setChannelsSnapshot({ key: selectedRun.run_id, state: { kind: 'failed', message: requestFailure(error) } }); });

    const cached = hardwareCache.current.get(selectedRun.assignment_id);
    if (cached) Promise.resolve().then(() => setHardwareSnapshot({ key: selectedRun.assignment_id, state: { kind: 'ready', data: cached } }));
    else {
      loadAssignmentHardware(selectedRun.assignment_id, hardwareController.signal).then(result => {
        if (result.data_source === 'test_database') {
          hardwareCache.current.set(selectedRun.assignment_id, result);
          setHardwareSnapshot({ key: selectedRun.assignment_id, state: { kind: 'ready', data: result } });
        } else setHardwareSnapshot({ key: selectedRun.assignment_id, state: result.data_source === 'not_found' ? { kind: 'not_found' } : { kind: 'failed', message: 'Live reporting is no longer connected.' } });
      }).catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setHardwareSnapshot({ key: selectedRun.assignment_id, state: { kind: 'failed', message: requestFailure(error) } }); });
    }
    return () => { channelsController.abort(); hardwareController.abort(); };
  }, [selectedRun]);

  const openUnit = (unitId: number) => { setQuery(''); onNavigate(unitId, null); };
  const selectRun = (runId: number) => { if (route.unitId !== null) onNavigate(route.unitId, runId); };

  return <>
    <div className="live-unit-toolbar">
      <nav aria-label="Breadcrumb"><a href="#/" className="lnk">Overview</a><span aria-hidden="true">/</span><span>Units</span><span aria-hidden="true">/</span><span>{detail?.unit.main_board_serial ?? 'Live lookup'}</span></nav>
      <label className="live-unit-search"><svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></svg><span className="sr-only">Look up a live unit</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Main-board or switch serial" aria-describedby="live-unit-search-help" /></label>
    </div>
    <div className="live-unit-source"><LiveBadge /><span id="live-unit-search-help">Searches the connected read-only test database. Timestamps display locally; hover or focus them for UTC.</span></div>
    <SearchResults state={query.trim().length < 2 ? { kind: 'idle' } : searchState} query={query} onOpen={openUnit} />

    {route.unitId === null && <section className="empty-state"><h1>Live unit lookup</h1><p>Search by a main-board or current/historical switch serial to open a unit.</p></section>}
    {detailState.kind === 'loading' && <div className="live-unit-state" role="status">Loading unit detail…</div>}
    {detailState.kind === 'failed' && <div className="live-unit-state" role="status">{detailState.message}</div>}
    {detailState.kind === 'not_found' && <UnitNotFound message="The requested unit does not exist in the connected lookup." onBack={() => onNavigate(null, null)} />}
    {invalidRun && <UnitNotFound message="The requested run does not belong to this unit or is outside the bounded run list." onBack={() => onNavigate(route.unitId, detail?.runs[0]?.run_id ?? null, 'replace')} />}
    {detail && !invalidRun && <>
      <HeaderCard detail={detail} selectedRun={selectedRun} hardware={hardwareState} />
      <RunSelector detail={detail} selectedRun={selectedRun} onSelect={selectRun} />
      <Timeline detail={detail} hardware={hardwareState} />
      <Panel title="Insertion loss by logical channel" detail="Current attempt per channel, colored by the API classification.">
        {channelsState.kind === 'ready' && selectedRun ? <LossChart key={selectedRun.run_id} run={selectedRun} channels={channelsState.data} /> : <StateMessage state={channelsState} empty="Select a run to see measurements." />}
      </Panel>
      <div className="live-unit-two-column">
        <Panel title="Channel map" detail="Effective port per logical channel; replaced cells retain initial-port history.">
          {hardwareState.kind === 'ready' && channelsState.kind === 'ready' ? <ChannelMap hardware={hardwareState.data} channels={channelsState.data} /> : <StateMessage state={hardwareState.kind !== 'ready' ? hardwareState : channelsState} empty="Select a run to see its assignment map." />}
        </Panel>
        <Panel title="Extra ports" detail="Current run candidates, confirmed hardware evidence and latest spare designation.">
          {hardwareState.kind === 'ready' && channelsState.kind === 'ready' && selectedRun ? <ExtraPorts run={selectedRun} channels={channelsState.data} hardware={hardwareState.data} /> : <StateMessage state={hardwareState.kind !== 'ready' ? hardwareState : channelsState} empty="Select a run to see extra ports." />}
        </Panel>
      </div>
      <div className="live-unit-two-column history-columns">
        <Panel title="Replacement history" detail="CHANNEL_REPLACEMENTS, oldest first.">
          {hardwareState.kind === 'ready' ? <ReplacementHistory detail={detail} hardware={hardwareState.data} onSelectRun={selectRun} /> : <StateMessage state={hardwareState} empty="Select a run to see replacement history." />}
        </Panel>
        <Panel title="Measurement attempts" detail="Repeated attempts and current fail, warning or too-good channels.">
          {channelsState.kind === 'ready' ? <Attempts channels={channelsState.data} /> : <StateMessage state={channelsState} empty="Select a run to see attempts." />}
        </Panel>
      </div>
      <Panel title="Saved analyses" detail="Historical recommendations and recorded replacement linkage; not final disposition evidence.">
        {hardwareState.kind === 'ready' ? <SavedAnalyses analyses={hardwareState.data.analyses} /> : <StateMessage state={hardwareState} empty="Select a run to see saved analyses." />}
        {hardwareState.kind === 'ready' && hardwareState.data.incomplete && <p className="live-unit-warning">One or more assignment-hardware result caps were reached; this evidence is incomplete.</p>}
      </Panel>
      <footer className="live-unit-footer">Live read-only test-database evidence. Saved analyses are not final manufacturing dispositions.</footer>
    </>}
  </>;
}
