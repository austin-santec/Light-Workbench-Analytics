import { useEffect, useState } from 'react';
import { css } from '../lib/css';
import { SegmentedControl } from './SegmentedControl';
import { RunActivityClientError } from '../lib/api/runActivity';
import {
  loadReplacementActivity,
  type ReplacementActivityConnectedResponse,
  type ReplacementPeriodKey,
} from '../lib/api/replacementActivity';

type Range = 'today' | 'yesterday' | 'week' | 'month';
const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' }, { value: 'month', label: 'Last 30 days' },
] as const;
const PERIOD: Record<Range, ReplacementPeriodKey> = { today: 'today', yesterday: 'yesterday', week: 'this_week', month: 'last_30_days' };
const BUCKETS = [
  ['production', 'Production'], ['engineering', 'Engineering'], ['training', 'Training'],
  ['calibration', 'Calibration'], ['unattributed', 'Unattributed'],
] as const;

type State =
  | { kind: 'loading' | 'not_connected' | 'backend_unreachable' | 'invalid_response' | 'request_failed' }
  | { kind: 'database_error'; code: string }
  | { kind: 'connected'; data: ReplacementActivityConnectedResponse };

function statusFor(error: unknown): State {
  if (error instanceof TypeError) return { kind: 'backend_unreachable' };
  if (error instanceof RunActivityClientError) {
    if (error.kind === 'database' && error.code) return { kind: 'database_error', code: error.code };
    if (error.kind === 'unreachable') return { kind: 'backend_unreachable' };
    if (error.kind === 'invalid_response') return { kind: 'invalid_response' };
  }
  return { kind: 'request_failed' };
}

function Status({ children }: { children: React.ReactNode }) {
  return <div role="status" style={css('min-height:110px;display:flex;align-items:center;justify-content:center;text-align:center;padding:18px;border-radius:10px;background:var(--panel2);color:var(--muted)')}>{children}</div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div style={css('padding:12px;border-radius:10px;background:var(--panel2);display:flex;flex-direction:column;gap:3px')}>
    <span style={css('font-size:12px;color:var(--muted);font-weight:500')}>{label}</span>
    <span style={css('font-size:28px;line-height:1.05;font-weight:650;font-variant-numeric:tabular-nums')}>{value}</span>
    <span style={css('font-size:11.5px;color:var(--ink2)')}>{detail}</span>
  </div>;
}

function Connected({ data, range }: { data: ReplacementActivityConnectedResponse; range: Range }) {
  const period = data.periods[PERIOD[range]];
  const all = period.by_attribution.all;
  const production = period.by_attribution.production;
  const maximum = Math.max(1, ...data.daily.map(day => day.by_attribution.all.events));
  return <div style={css('display:flex;flex-direction:column;gap:12px')}>
    {data.incomplete && <div role="status" style={css('padding:9px 11px;border-radius:9px;background:var(--warn-bg);color:var(--warn-fg);font-size:12.5px;font-weight:600')}>Bounded sample — these numbers do not cover every matching replacement record.</div>}
    <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px')}>
      <Metric label="Channels replaced" value={all.channels_replaced.toLocaleString()} detail={`of which production: ${production.channels_replaced.toLocaleString()}`} />
      <Metric label="Replacement events" value={all.events.toLocaleString()} detail={`of which production: ${production.events.toLocaleString()}`} />
      <Metric label="Units with a replacement" value={all.units.toLocaleString()} detail="Distinct units reached by records" />
      <Metric label="Events per unit" value={all.events_per_unit === null ? '—' : all.events_per_unit.toFixed(2)} detail={`${all.events.toLocaleString()} events / ${all.units.toLocaleString()} units`} />
      <Metric label="From a saved recommendation" value={all.from_recommendation.toLocaleString()} detail="Linked records; not proof of compliance" />
    </div>
    <div style={css('display:flex;flex-wrap:wrap;gap:7px')}>
      {BUCKETS.map(([key, label]) => <div key={key} style={css('flex:1 1 120px;padding:8px 10px;border:1px solid var(--line2);border-radius:9px;display:flex;justify-content:space-between;gap:8px;font-size:12.5px')}>
        <span>{label}{key === 'unattributed' && <span style={css('display:block;font-size:10.5px;color:var(--muted)')}>no related run recorded</span>}</span>
        <strong style={css('font-variant-numeric:tabular-nums')}>{period.by_attribution[key].events.toLocaleString()}</strong>
      </div>)}
    </div>
    {all.related_run_not_current > 0 && <p style={css('margin:0;font-size:11.5px;color:var(--muted)')}>Related run since voided/superseded: {all.related_run_not_current.toLocaleString()}</p>}
    <div>
      <div style={css('display:flex;align-items:flex-end;gap:2px;height:72px;padding-top:6px')} role="img" aria-label="Daily replacement events over 31 Pacific dates; today is partial">
        {data.daily.map(day => <span key={day.date} title={`${day.date}: ${day.by_attribution.all.events} events${day.partial ? ' (partial)' : ''}`} style={css(`flex:1 1 0;min-width:2px;height:${Math.max(2, day.by_attribution.all.events / maximum * 64)}px;border-radius:2px 2px 0 0;background:${day.partial ? 'color-mix(in srgb,var(--accent) 35%,var(--panel))' : 'var(--accent)'}`)} />)}
      </div>
      <p style={css('margin:4px 0 0;font-size:11.5px;color:var(--muted)')}>Thirty complete Pacific dates plus today; today is partial.</p>
    </div>
    <p style={css('margin:0;font-size:11.5px;color:var(--muted)')}>Administrative-error exclusions: {data.administrative_exclusions}. None are verifiable in the reviewed schema, so no replacement records are excluded.</p>
  </div>;
}

export function LiveReplacementActivityPanel() {
  const [range, setRange] = useState<Range>('month');
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    loadReplacementActivity(null, controller.signal)
      .then(result => setState(result.data_source === 'test_database' ? { kind: 'connected', data: result } : { kind: 'not_connected' }))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setState(statusFor(error)); });
    return () => controller.abort();
  }, [refresh]);
  const refreshPanel = () => {
    setState({ kind: 'loading' });
    setRefresh(value => value + 1);
  };
  return <section aria-label="Replacement activity" style={css('background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:14px')}>
    <div style={css('display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px')}>
      <div style={css('display:flex;flex-direction:column;gap:4px')}>
        <span style={css('align-self:flex-start;font-size:10px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent-ink)')}>Live · test database</span>
        <h2 style={css('margin:0;font-size:16px;font-weight:600')}>Replacement activity</h2>
        <span style={css('font-size:12.5px;color:var(--muted)')}>Recorded replacement events and exact distinct assignment/channel counts across all attributions.</span>
      </div>
      <div style={css('display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:8px')}>
        <SegmentedControl label="Live replacement range" options={RANGE_OPTIONS} value={range} onChange={setRange} />
        <button type="button" onClick={refreshPanel} style={css('min-height:32px;padding:0 9px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--ink2);font-size:11.5px;font-weight:600')}>Refresh replacement activity</button>
      </div>
    </div>
    {state.kind === 'loading' && <Status>Loading live test data…</Status>}
    {state.kind === 'not_connected' && <Status>Live data is off. Start the backend with reporting settings to see test-database numbers.</Status>}
    {state.kind === 'backend_unreachable' && <Status>Backend not reachable on 127.0.0.1:8000</Status>}
    {state.kind === 'database_error' && <Status>Database check failed (<code>{state.code}</code>)</Status>}
    {state.kind === 'invalid_response' && <Status>The backend returned an unexpected response.</Status>}
    {state.kind === 'request_failed' && <Status>Live replacement activity could not be loaded.</Status>}
    {state.kind === 'connected' && <Connected data={state.data} range={range} />}
  </section>;
}
