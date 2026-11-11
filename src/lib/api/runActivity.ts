import type { Purpose } from '../../types';

export const RUN_PURPOSES = ['production', 'engineering', 'training', 'calibration'] as const;
export const COMPLETION_STATUSES = ['in_progress', 'complete', 'stopped', 'failed'] as const;
export const TIMING_QUALITIES = ['confirmed', 'checkpoint_estimate', 'partial', 'provisional', 'unavailable'] as const;

export type CompletionStatus = typeof COMPLETION_STATUSES[number];
export type TimingQuality = typeof TIMING_QUALITIES[number];
export type SampleState = 'no_data' | 'small_sample' | 'ok';

export interface RunActivityWindow {
  started_from: string;
  started_before: string;
}

export interface DurationStatistics {
  n: number;
  mean: number | null;
  median: number | null;
  p90: number | null;
  sample_state: SampleState;
}

export interface StoppedStatistics {
  n: number;
  mean: number | null;
  sample_state: SampleState;
}

export interface RunActivityConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  window: RunActivityWindow;
  filters: {
    purpose: Purpose | null;
    wavelength_mode: 'SM' | 'MM' | null;
    switch_model: string | null;
  };
  incomplete: boolean;
  runs: {
    count_basis: 'runs_started_in_window_not_units';
    total: number;
    by_run_purpose: Record<Purpose, number>;
    by_completion_status: Record<CompletionStatus, number>;
  };
  timing: {
    open_runs: number;
    by_quality: Record<TimingQuality, number>;
    active_seconds: DurationStatistics;
    elapsed_seconds: DurationStatistics;
    stopped_seconds: StoppedStatistics;
    flagged_over_90_min: number;
  };
}

export interface CombinedRunActivity {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  window: RunActivityWindow;
  incomplete: boolean;
  runs: RunActivityConnectedResponse['runs'];
  timing: Pick<RunActivityConnectedResponse['timing'], 'open_runs' | 'by_quality' | 'flagged_over_90_min'>;
  timing_statistics: Pick<RunActivityConnectedResponse['timing'], 'active_seconds' | 'elapsed_seconds'> | null;
}

export type RunActivityResult = { data_source: 'not_connected' } | CombinedRunActivity;
export type RunActivityClientErrorKind = 'database' | 'unreachable' | 'invalid_response' | 'request_failed';

export class RunActivityClientError extends Error {
  constructor(public readonly kind: RunActivityClientErrorKind, public readonly code?: string) {
    super(kind);
    this.name = 'RunActivityClientError';
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeLast30CompleteUtcWindow(now = new Date()): RunActivityWindow {
  if (!Number.isFinite(now.getTime())) throw new Error('A valid current date is required');
  const startedBeforeMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return {
    started_from: new Date(startedBeforeMs - 30 * DAY_MS).toISOString(),
    started_before: new Date(startedBeforeMs).toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNullableNonnegativeNumber(value: unknown): value is number | null {
  return value === null || isNonnegativeNumber(value);
}

function isUtcIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}

function isSameInstant(first: string, second: string): boolean {
  return Date.parse(first) === Date.parse(second);
}

function isEnumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isCountRecord<T extends string>(value: unknown, keys: readonly T[]): value is Record<T, number> {
  return isRecord(value) && hasExactKeys(value, keys) && keys.every(key => isNonnegativeInteger(value[key]));
}

function isSampleState(value: unknown): value is SampleState {
  return value === 'no_data' || value === 'small_sample' || value === 'ok';
}

function isDurationStatistics(value: unknown): value is DurationStatistics {
  if (!isRecord(value) || !hasExactKeys(value, ['n', 'mean', 'median', 'p90', 'sample_state'])) return false;
  if (!isNonnegativeInteger(value.n) || !isSampleState(value.sample_state)) return false;
  if (![value.mean, value.median, value.p90].every(isNullableNonnegativeNumber)) return false;
  if (value.sample_state === 'no_data') return value.n === 0 && value.mean === null && value.median === null && value.p90 === null;
  return value.n > 0 && value.mean !== null && value.median !== null && value.p90 !== null;
}

function isStoppedStatistics(value: unknown): value is StoppedStatistics {
  if (!isRecord(value) || !hasExactKeys(value, ['n', 'mean', 'sample_state'])) return false;
  if (!isNonnegativeInteger(value.n) || !isSampleState(value.sample_state) || !isNullableNonnegativeNumber(value.mean)) return false;
  return value.sample_state === 'no_data' ? value.n === 0 && value.mean === null : value.n > 0 && value.mean !== null;
}

function isWindow(value: unknown): value is RunActivityWindow {
  return isRecord(value) && hasExactKeys(value, ['started_from', 'started_before']) && isUtcIsoTimestamp(value.started_from) && isUtcIsoTimestamp(value.started_before);
}

function isFilters(value: unknown): value is RunActivityConnectedResponse['filters'] {
  if (!isRecord(value) || !hasExactKeys(value, ['purpose', 'wavelength_mode', 'switch_model'])) return false;
  const purpose = value.purpose === null || isEnumValue(value.purpose, RUN_PURPOSES);
  const wavelength = value.wavelength_mode === null || value.wavelength_mode === 'SM' || value.wavelength_mode === 'MM';
  const model = value.switch_model === null || (typeof value.switch_model === 'string' && value.switch_model.length >= 1 && value.switch_model.length <= 30);
  return purpose && wavelength && model;
}

function isRuns(value: unknown): value is RunActivityConnectedResponse['runs'] {
  if (!isRecord(value) || !hasExactKeys(value, ['count_basis', 'total', 'by_run_purpose', 'by_completion_status'])) return false;
  if (value.count_basis !== 'runs_started_in_window_not_units' || !isNonnegativeInteger(value.total)) return false;
  if (!isCountRecord(value.by_run_purpose, RUN_PURPOSES) || !isCountRecord(value.by_completion_status, COMPLETION_STATUSES)) return false;
  const byPurpose = value.by_run_purpose;
  const byCompletion = value.by_completion_status;
  return RUN_PURPOSES.reduce((sum, key) => sum + byPurpose[key], 0) === value.total
    && COMPLETION_STATUSES.reduce((sum, key) => sum + byCompletion[key], 0) === value.total;
}

function isTiming(value: unknown): value is RunActivityConnectedResponse['timing'] {
  return isRecord(value)
    && hasExactKeys(value, ['open_runs', 'by_quality', 'active_seconds', 'elapsed_seconds', 'stopped_seconds', 'flagged_over_90_min'])
    && isNonnegativeInteger(value.open_runs)
    && isCountRecord(value.by_quality, TIMING_QUALITIES)
    && isDurationStatistics(value.active_seconds)
    && isDurationStatistics(value.elapsed_seconds)
    && isStoppedStatistics(value.stopped_seconds)
    && isNonnegativeInteger(value.flagged_over_90_min);
}

export function isRunActivityConnectedResponse(value: unknown): value is RunActivityConnectedResponse {
  return isRecord(value)
    && hasExactKeys(value, ['data_source', 'tls', 'window', 'filters', 'incomplete', 'runs', 'timing'])
    && value.data_source === 'test_database'
    && (value.tls === 'verified' || value.tls === 'encrypted_unverified')
    && isWindow(value.window)
    && isFilters(value.filters)
    && typeof value.incomplete === 'boolean'
    && isRuns(value.runs)
    && isTiming(value.timing);
}

function isNotConnectedResponse(value: unknown): value is { data_source: 'not_connected' } {
  return isRecord(value) && hasExactKeys(value, ['data_source']) && value.data_source === 'not_connected';
}

function sumCounts<T extends string>(responses: readonly RunActivityConnectedResponse[], keys: readonly T[], select: (response: RunActivityConnectedResponse) => Record<T, number>): Record<T, number> {
  return Object.fromEntries(keys.map(key => [key, responses.reduce((sum, response) => sum + select(response)[key], 0)])) as Record<T, number>;
}

export function combineRunActivityResponses(responses: readonly RunActivityConnectedResponse[], includeTimingStatistics: boolean): CombinedRunActivity {
  const first = responses[0];
  if (!first || (includeTimingStatistics && responses.length !== 1) || responses.some(response => response.tls !== first.tls || !isSameInstant(response.window.started_from, first.window.started_from) || !isSameInstant(response.window.started_before, first.window.started_before))) {
    throw new RunActivityClientError('invalid_response');
  }
  const byPurpose = sumCounts(responses, RUN_PURPOSES, response => response.runs.by_run_purpose);
  const byCompletion = sumCounts(responses, COMPLETION_STATUSES, response => response.runs.by_completion_status);
  return {
    data_source: 'test_database',
    tls: first.tls,
    window: first.window,
    incomplete: responses.some(response => response.incomplete),
    runs: {
      count_basis: 'runs_started_in_window_not_units',
      total: responses.reduce((sum, response) => sum + response.runs.total, 0),
      by_run_purpose: byPurpose,
      by_completion_status: byCompletion,
    },
    timing: {
      open_runs: responses.reduce((sum, response) => sum + response.timing.open_runs, 0),
      by_quality: sumCounts(responses, TIMING_QUALITIES, response => response.timing.by_quality),
      flagged_over_90_min: responses.reduce((sum, response) => sum + response.timing.flagged_over_90_min, 0),
    },
    timing_statistics: includeTimingStatistics ? {
      active_seconds: first.timing.active_seconds,
      elapsed_seconds: first.timing.elapsed_seconds,
    } : null,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new RunActivityClientError('invalid_response');
  }
}

async function requestRunActivity(window: RunActivityWindow, purpose: Purpose | null, signal: AbortSignal): Promise<RunActivityConnectedResponse | { data_source: 'not_connected' }> {
  const query = new URLSearchParams({ started_from: window.started_from, started_before: window.started_before });
  if (purpose !== null) query.set('purpose', purpose);
  const response = await fetch(`/api/v1/reporting/run-activity?${query}`, { signal, headers: { Accept: 'application/json' } });
  if (response.status === 503) {
    const body = await readJson(response);
    const code = isRecord(body) && hasExactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) {
    throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  }
  const body = await readJson(response);
  if (isNotConnectedResponse(body)) return body;
  if (!isRunActivityConnectedResponse(body)) throw new RunActivityClientError('invalid_response');
  if (!isSameInstant(body.window.started_from, window.started_from) || !isSameInstant(body.window.started_before, window.started_before) || body.filters.purpose !== purpose || body.filters.wavelength_mode !== null || body.filters.switch_model !== null) {
    throw new RunActivityClientError('invalid_response');
  }
  return body;
}

export async function loadRunActivity(selectedPurposes: readonly Purpose[], window: RunActivityWindow, signal: AbortSignal): Promise<RunActivityResult> {
  if (selectedPurposes.length < 1 || selectedPurposes.some(purpose => !RUN_PURPOSES.includes(purpose))) throw new RunActivityClientError('invalid_response');
  const requestPurposes: readonly (Purpose | null)[] = selectedPurposes.length === RUN_PURPOSES.length ? [null] : selectedPurposes;
  const responses = await Promise.all(requestPurposes.map(purpose => requestRunActivity(window, purpose, signal)));
  if (responses.every(response => response.data_source === 'not_connected')) return { data_source: 'not_connected' };
  if (!responses.every((response): response is RunActivityConnectedResponse => response.data_source === 'test_database')) throw new RunActivityClientError('invalid_response');
  return combineRunActivityResponses(responses, requestPurposes.length === 1);
}
