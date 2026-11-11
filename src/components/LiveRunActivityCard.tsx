import { useEffect, useMemo, useState } from 'react';
import { css } from '../lib/css';
import {
  COMPLETION_STATUSES,
  computeLast30CompleteUtcWindow,
  loadRunActivity,
  RUN_PURPOSES,
  RunActivityClientError,
  type DurationStatistics,
  type RunActivityResult,
  type RunActivityWindow,
  type SampleState,
} from '../lib/api/runActivity';
import type { Purpose } from '../types';

type CardState =
  | { kind: 'loading' }
  | { kind: 'not_connected' }
  | { kind: 'backend_unreachable' }
  | { kind: 'database_error'; code: string }
  | { kind: 'invalid_response' }
  | { kind: 'request_failed' }
  | { kind: 'connected'; data: Extract<RunActivityResult, { data_source: 'test_database' }> };

interface Snapshot {
  requestKey: string;
  window: RunActivityWindow;
  state: CardState;
}

const purposeLabels: Record<Purpose, string> = {
  production: 'Production', engineering: 'Engineering', training: 'Training', calibration: 'Calibration',
};
const completionLabels = {
  in_progress: 'In progress', complete: 'Complete', stopped: 'Stopped', failed: 'Failed',
} as const;

function formatWindow(window: RunActivityWindow): string {
  const format = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const lastIncludedDay = new Date(Date.parse(window.started_before) - 1);
  return `${format.format(new Date(window.started_from))} – ${format.format(lastIncludedDay)} UTC`;
}

function formatSeconds(value: number | null): string {
  if (value === null) return '—';
  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

function sampleLabel(state: SampleState): string | null {
  if (state === 'small_sample') return 'Small sample';
  if (state === 'no_data') return 'No data';
  return null;
}

function TimingMetric({ label, value, statistics }: { label: string; value: number | null; statistics: DurationStatistics }) {
  const badge = sampleLabel(statistics.sample_state);
  return <div style={css('min-width:110px;flex:1 1 110px;padding:9px 10px;border-radius:9px;background:var(--panel2);display:flex;flex-direction:column;gap:3px')}>
    <span style={css('font-size:11.5px;color:var(--muted)')}>{label}</span>
    <span style={css('font-size:17px;font-weight:650;font-variant-numeric:tabular-nums')}>{formatSeconds(value)}</span>
    <span style={css('font-size:11.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:5px;align-items:center')}>
      n={statistics.n}
      {badge && <span style={css('font-size:10.5px;font-weight:600;padding:1px 6px;border-radius:999px;background:var(--warn-bg);color:var(--warn-fg)')}>{badge}</span>}
    </span>
  </div>;
}

function TimingGroup({ title, statistics, detail }: { title: string; statistics: DurationStatistics; detail: string }) {
  return <div style={css('display:flex;flex-direction:column;gap:7px;min-width:0')}>
    <div>
      <h3 style={css('margin:0;font-size:13px;font-weight:600')}>{title}</h3>
      <span style={css('font-size:11.5px;color:var(--muted)')}>{detail}</span>
    </div>
    <div style={css('display:flex;flex-wrap:wrap;gap:7px')}>
      <TimingMetric label="Median" value={statistics.median} statistics={statistics} />
      <TimingMetric label="Mean" value={statistics.mean} statistics={statistics} />
      <TimingMetric label="P90" value={statistics.p90} statistics={statistics} />
    </div>
  </div>;
}

function StatusMessage({ children }: { children: React.ReactNode }) {
  return <div role="status" style={css('min-height:92px;display:flex;align-items:center;justify-content:center;text-align:center;padding:18px;border-radius:10px;background:var(--panel2);color:var(--muted)')}>{children}</div>;
}

function LoadingState() {
  return <div role="status" aria-label="Loading live test data" style={css('min-height:92px;display:grid;grid-template-columns:repeat(3,minmax(80px,1fr));gap:9px')}>
    {[0, 1, 2].map(index => <span key={index} aria-hidden="true" style={css(`display:block;min-height:72px;border-radius:10px;background:var(--panel2);opacity:${1 - index * .15}`)} />)}
  </div>;
}

function ConnectedContent({ data }: { data: Extract<RunActivityResult, { data_source: 'test_database' }> }) {
  const endedRuns = Object.values(data.timing.by_quality).reduce((sum, count) => sum + count, 0);
  const confirmed = data.timing.by_quality.confirmed;
  const unavailable = data.timing.by_quality.unavailable;
  const otherUnconfirmed = endedRuns - confirmed - unavailable;
  return <div style={css('display:flex;flex-direction:column;gap:12px')}>
    {data.incomplete && <div role="status" style={css('padding:9px 11px;border-radius:9px;background:var(--warn-bg);color:var(--warn-fg);font-size:12.5px;font-weight:600')}>Bounded sample — these numbers do not cover every matching run.</div>}
    <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr));gap:10px')}>
      <div style={css('padding:12px;border-radius:10px;background:var(--panel2);display:flex;flex-direction:column;gap:3px')}>
        <span style={css('font-size:12px;color:var(--muted);font-weight:500')}>Runs started</span>
        <span style={css('font-size:30px;line-height:1.05;font-weight:650;font-variant-numeric:tabular-nums')}>{data.runs.total.toLocaleString()}</span>
        <span style={css('font-size:11.5px;color:var(--muted)')}>Raw run activity, not units</span>
      </div>
      <div style={css('padding:10px 12px;border-radius:10px;border:1px solid var(--line2);display:flex;flex-direction:column;gap:5px')}>
        <span style={css('font-size:11.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em')}>By purpose</span>
        {RUN_PURPOSES.map(purpose => <div key={purpose} style={css('display:flex;justify-content:space-between;gap:10px;font-size:12.5px')}><span>{purposeLabels[purpose]}</span><strong style={css('font-variant-numeric:tabular-nums')}>{data.runs.by_run_purpose[purpose].toLocaleString()}</strong></div>)}
      </div>
      <div style={css('padding:10px 12px;border-radius:10px;border:1px solid var(--line2);display:flex;flex-direction:column;gap:5px')}>
        <span style={css('font-size:11.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em')}>By completion</span>
        {COMPLETION_STATUSES.map(status => <div key={status} style={css('display:flex;justify-content:space-between;gap:10px;font-size:12.5px')}><span>{completionLabels[status]}</span><strong style={css('font-variant-numeric:tabular-nums')}>{data.runs.by_completion_status[status].toLocaleString()}</strong></div>)}
      </div>
    </div>
    <div style={css('padding:10px 12px;border-radius:10px;background:var(--panel2);font-size:12.5px;color:var(--ink2)')}>
      <strong>{confirmed} of {endedRuns}</strong> ended runs have confirmed timing ({unavailable} predate run timing{otherUnconfirmed > 0 ? `; ${otherUnconfirmed} other unconfirmed` : ''}). {data.timing.open_runs} open {data.timing.open_runs === 1 ? 'run is' : 'runs are'} excluded from timing.
    </div>
    {data.timing_statistics ? <div style={css('display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:12px')}>
      <TimingGroup title="Elapsed time" detail="All ended runs" statistics={data.timing_statistics.elapsed_seconds} />
      <TimingGroup title="Active time" detail="Confirmed timing only" statistics={data.timing_statistics.active_seconds} />
    </div> : <div role="note" style={css('padding:13px;border-radius:10px;border:1px dashed var(--line);color:var(--muted);font-size:12.5px;text-align:center')}>Select one purpose or all to see timing</div>}
  </div>;
}

function errorState(error: unknown): CardState {
  if (error instanceof RunActivityClientError) {
    if (error.kind === 'database' && error.code) return { kind: 'database_error', code: error.code };
    if (error.kind === 'invalid_response') return { kind: 'invalid_response' };
    if (error.kind === 'request_failed') return { kind: 'request_failed' };
  }
  return { kind: 'backend_unreachable' };
}

export function LiveRunActivityCard({ purposes }: { purposes: Record<Purpose, boolean> }) {
  const selectedPurposes = useMemo(() => RUN_PURPOSES.filter(purpose => purposes[purpose]), [purposes]);
  const selectionKey = selectedPurposes.join(',');
  const [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>(() => ({ requestKey: '', window: computeLast30CompleteUtcWindow(), state: { kind: 'loading' } }));
  const requestKey = `${selectionKey}:${refresh}`;
  const state: CardState = snapshot.requestKey === requestKey ? snapshot.state : { kind: 'loading' };
  const displayWindow = snapshot.requestKey === requestKey ? snapshot.window : computeLast30CompleteUtcWindow();

  useEffect(() => {
    const controller = new AbortController();
    const requestWindow = computeLast30CompleteUtcWindow();
    loadRunActivity(selectedPurposes, requestWindow, controller.signal)
      .then(result => setSnapshot({ requestKey, window: requestWindow, state: result.data_source === 'not_connected' ? { kind: 'not_connected' } : { kind: 'connected', data: result } }))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setSnapshot({ requestKey, window: requestWindow, state: errorState(error) }); });
    return () => controller.abort();
  }, [requestKey, selectedPurposes]);

  return <section aria-labelledby="live-run-activity-title" style={css('background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px;min-width:0')}>
    <div style={css('display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px')}>
      <div style={css('display:flex;flex-direction:column;gap:3px')}>
        <div style={css('display:flex;flex-wrap:wrap;align-items:center;gap:8px')}>
          <span style={css('font-size:11px;font-weight:650;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent-ink)')}>Live · test database</span>
          {state.kind === 'connected' && state.data.tls === 'encrypted_unverified' && <span style={css('font-size:10.5px;padding:3px 8px;border-radius:999px;background:var(--warn-bg);color:var(--warn-fg)')}>Encrypted, certificate not verified</span>}
        </div>
        <h2 id="live-run-activity-title" style={css('margin:0;font-size:16px;font-weight:600')}>Run activity</h2>
        <span style={css('font-size:12px;color:var(--muted)')}>{formatWindow(displayWindow)} · follows Run purpose only</span>
      </div>
      <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={state.kind === 'loading'} style={css('min-height:38px;padding:0 12px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:12.5px;font-weight:600;display:inline-flex;align-items:center;gap:7px')}>
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={css('fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round')}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>
        Refresh live data
      </button>
    </div>
    {state.kind === 'loading' && <LoadingState />}
    {state.kind === 'not_connected' && <StatusMessage>Live data is off. Start the backend with reporting settings to see test-database numbers.</StatusMessage>}
    {state.kind === 'backend_unreachable' && <StatusMessage>Backend not reachable on 127.0.0.1:8000</StatusMessage>}
    {state.kind === 'database_error' && <StatusMessage>Database check failed (<code>{state.code}</code>)</StatusMessage>}
    {state.kind === 'invalid_response' && <StatusMessage>Live data response was not recognized.</StatusMessage>}
    {state.kind === 'request_failed' && <StatusMessage>Live data request failed.</StatusMessage>}
    {state.kind === 'connected' && <ConnectedContent data={state.data} />}
  </section>;
}
