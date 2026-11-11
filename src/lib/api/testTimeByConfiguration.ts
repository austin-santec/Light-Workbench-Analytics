import type { Purpose } from '../../types';
import {
  RUN_PURPOSES,
  RunActivityClientError,
  type DurationStatistics,
  type RunActivityWindow,
  type SampleState,
} from './runActivity';

export interface ConfigurationTestTime {
  switch_model: string;
  wavelength_mode: 'SM' | 'MM';
  front_panel_channel_count: number | null;
  runs: number;
  open_runs: number;
  elapsed_seconds: DurationStatistics;
  active_seconds: DurationStatistics;
  confirmed_timing_runs: number;
  unavailable_timing_runs: number;
  seconds_per_channel: number | null;
  flagged_over_90_min: number;
}

export interface TestTimeByConfigurationConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  window: RunActivityWindow;
  filters: {
    purpose: Purpose | null;
    wavelength_mode: 'SM' | 'MM' | null;
  };
  incomplete: boolean;
  configurations: ConfigurationTestTime[];
}

export type TestTimeByConfigurationResult =
  | { data_source: 'not_connected' }
  | TestTimeByConfigurationConnectedResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
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

function isSampleState(value: unknown): value is SampleState {
  return value === 'no_data' || value === 'small_sample' || value === 'ok';
}

function isDurationStatistics(value: unknown): value is DurationStatistics {
  if (!isRecord(value)
    || !hasExactKeys(value, ['n', 'mean', 'median', 'p90', 'sample_state'])
    || !isNonnegativeInteger(value.n)
    || !isSampleState(value.sample_state)
    || ![value.mean, value.median, value.p90].every(isNullableNonnegativeNumber)) return false;
  if (value.sample_state === 'no_data') {
    return value.n === 0 && value.mean === null && value.median === null && value.p90 === null;
  }
  return value.n > 0 && value.mean !== null && value.median !== null && value.p90 !== null;
}

function isUtcIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isWindow(value: unknown): value is RunActivityWindow {
  return isRecord(value)
    && hasExactKeys(value, ['started_from', 'started_before'])
    && isUtcIsoTimestamp(value.started_from)
    && isUtcIsoTimestamp(value.started_before);
}

function isFilters(value: unknown): value is TestTimeByConfigurationConnectedResponse['filters'] {
  return isRecord(value)
    && hasExactKeys(value, ['purpose', 'wavelength_mode'])
    && (value.purpose === null
      || (typeof value.purpose === 'string' && RUN_PURPOSES.includes(value.purpose as Purpose)))
    && (value.wavelength_mode === null
      || value.wavelength_mode === 'SM'
      || value.wavelength_mode === 'MM');
}

function isConfiguration(value: unknown): value is ConfigurationTestTime {
  if (!isRecord(value) || !hasExactKeys(value, [
    'switch_model',
    'wavelength_mode',
    'front_panel_channel_count',
    'runs',
    'open_runs',
    'elapsed_seconds',
    'active_seconds',
    'confirmed_timing_runs',
    'unavailable_timing_runs',
    'seconds_per_channel',
    'flagged_over_90_min',
  ])) return false;
  const channelCount = value.front_panel_channel_count;
  if (typeof value.switch_model !== 'string'
    || value.switch_model.length < 1
    || value.switch_model.length > 30
    || (value.wavelength_mode !== 'SM' && value.wavelength_mode !== 'MM')
    || !(channelCount === null
      || (typeof channelCount === 'number' && Number.isInteger(channelCount) && channelCount > 0))
    || !isNonnegativeInteger(value.runs)
    || !isNonnegativeInteger(value.open_runs)
    || !isDurationStatistics(value.elapsed_seconds)
    || !isDurationStatistics(value.active_seconds)
    || !isNonnegativeInteger(value.confirmed_timing_runs)
    || !isNonnegativeInteger(value.unavailable_timing_runs)
    || !isNullableNonnegativeNumber(value.seconds_per_channel)
    || !isNonnegativeInteger(value.flagged_over_90_min)) return false;
  if (value.elapsed_seconds.n !== value.runs
    || value.active_seconds.n !== value.confirmed_timing_runs
    || value.confirmed_timing_runs + value.unavailable_timing_runs > value.runs) return false;
  return channelCount === null || value.runs === 0
    ? value.seconds_per_channel === null
    : value.seconds_per_channel !== null;
}

export function isTestTimeByConfigurationConnectedResponse(
  value: unknown,
): value is TestTimeByConfigurationConnectedResponse {
  return isRecord(value)
    && hasExactKeys(value, [
      'data_source', 'tls', 'window', 'filters', 'incomplete', 'configurations',
    ])
    && value.data_source === 'test_database'
    && (value.tls === 'verified' || value.tls === 'encrypted_unverified')
    && isWindow(value.window)
    && isFilters(value.filters)
    && typeof value.incomplete === 'boolean'
    && Array.isArray(value.configurations)
    && value.configurations.every(isConfiguration);
}

function isNotConnectedResponse(value: unknown): value is { data_source: 'not_connected' } {
  return isRecord(value)
    && hasExactKeys(value, ['data_source'])
    && value.data_source === 'not_connected';
}

function isSameInstant(first: string, second: string): boolean {
  return Date.parse(first) === Date.parse(second);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new RunActivityClientError('invalid_response');
  }
}

export async function loadTestTimeByConfiguration(
  purpose: Purpose | null,
  window: RunActivityWindow,
  signal: AbortSignal,
): Promise<TestTimeByConfigurationResult> {
  if (purpose !== null && !RUN_PURPOSES.includes(purpose)) {
    throw new RunActivityClientError('invalid_response');
  }
  const query = new URLSearchParams({
    started_from: window.started_from,
    started_before: window.started_before,
  });
  if (purpose !== null) query.set('purpose', purpose);
  const response = await fetch(`/api/v1/reporting/test-time-by-configuration?${query}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (response.status === 503) {
    const body = await readJson(response);
    const code = isRecord(body)
      && hasExactKeys(body, ['code'])
      && typeof body.code === 'string'
      && /^[a-z0-9_]{1,64}$/.test(body.code)
      ? body.code
      : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) {
    throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  }
  const body = await readJson(response);
  if (isNotConnectedResponse(body)) return body;
  if (!isTestTimeByConfigurationConnectedResponse(body)
    || !isSameInstant(body.window.started_from, window.started_from)
    || !isSameInstant(body.window.started_before, window.started_before)
    || body.filters.purpose !== purpose
    || body.filters.wavelength_mode !== null) {
    throw new RunActivityClientError('invalid_response');
  }
  return body;
}
