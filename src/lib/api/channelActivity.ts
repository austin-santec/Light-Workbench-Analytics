import type { MeasurementMode, Purpose } from '../../types';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';

export const CHANNEL_ACTIVITY_PERIODS = ['today', 'yesterday', 'this_week', 'last_30_days'] as const;
export type ChannelActivityPeriodKey = typeof CHANNEL_ACTIVITY_PERIODS[number];

export interface ChannelActivityCounts {
  channels_tested: number;
  attempts: number;
  units: number;
  runs: number;
  extra_candidate_attempts: number;
  excluded_unknown_boundary: number;
}

export interface ChannelActivityPeriod extends ChannelActivityCounts {
  start_utc: string;
  end_utc: string;
  partial: boolean;
}

export interface ChannelActivityDay extends ChannelActivityPeriod {
  date: string;
}

export interface ChannelActivityConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  extracted_at_utc: string;
  timezone: 'America/Los_Angeles';
  filters: {
    purpose: Purpose[];
    wavelength_mode: MeasurementMode | null;
    switch_model: string | null;
  };
  periods: Record<ChannelActivityPeriodKey, ChannelActivityPeriod>;
  daily: ChannelActivityDay[];
  incomplete: boolean;
}

export type ChannelActivityResult =
  | { data_source: 'not_connected' }
  | ChannelActivityConnectedResponse;

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

function isUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isCounts(value: Record<string, unknown>): boolean {
  return ['channels_tested', 'attempts', 'units', 'runs', 'extra_candidate_attempts', 'excluded_unknown_boundary']
    .every(key => isNonnegativeInteger(value[key]));
}

function isPeriod(value: unknown, day: boolean): value is ChannelActivityDay | ChannelActivityPeriod {
  const keys = ['start_utc', 'end_utc', 'partial', 'channels_tested', 'attempts', 'units', 'runs', 'extra_candidate_attempts', 'excluded_unknown_boundary'];
  if (day) keys.push('date');
  if (!isRecord(value) || !hasExactKeys(value, keys) || !isCounts(value)) return false;
  if (!isUtcTimestamp(value.start_utc) || !isUtcTimestamp(value.end_utc) || typeof value.partial !== 'boolean') return false;
  if (Date.parse(value.start_utc) > Date.parse(value.end_utc)) return false;
  return !day || (typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date));
}

function isFilters(value: unknown): value is ChannelActivityConnectedResponse['filters'] {
  return isRecord(value)
    && hasExactKeys(value, ['purpose', 'wavelength_mode', 'switch_model'])
    && Array.isArray(value.purpose)
    && value.purpose.length >= 1
    && value.purpose.length <= RUN_PURPOSES.length
    && new Set(value.purpose).size === value.purpose.length
    && value.purpose.every(item => typeof item === 'string' && RUN_PURPOSES.includes(item as Purpose))
    && (value.wavelength_mode === null || value.wavelength_mode === 'SM' || value.wavelength_mode === 'MM')
    && (value.switch_model === null || (typeof value.switch_model === 'string' && value.switch_model.length >= 1 && value.switch_model.length <= 30));
}

export function isChannelActivityConnectedResponse(value: unknown): value is ChannelActivityConnectedResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['data_source', 'tls', 'extracted_at_utc', 'timezone', 'filters', 'periods', 'daily', 'incomplete'])) return false;
  if (value.data_source !== 'test_database' || !['verified', 'encrypted_unverified'].includes(value.tls as string)) return false;
  if (!isUtcTimestamp(value.extracted_at_utc) || value.timezone !== 'America/Los_Angeles' || typeof value.incomplete !== 'boolean' || !isFilters(value.filters)) return false;
  const periods = value.periods;
  if (!isRecord(periods) || !hasExactKeys(periods, CHANNEL_ACTIVITY_PERIODS) || !CHANNEL_ACTIVITY_PERIODS.every(key => isPeriod(periods[key], false))) return false;
  const daily = value.daily;
  if (!Array.isArray(daily) || daily.length !== 31 || !daily.every(day => isPeriod(day, true))) return false;
  const typedDaily = daily as ChannelActivityDay[];
  if (!typedDaily.every((day, index) => day.partial === (index === typedDaily.length - 1))) return false;
  return typedDaily.every((day, index) => index === 0 || typedDaily[index - 1].date < day.date);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new RunActivityClientError('invalid_response');
  }
}

export async function loadChannelActivity(
  purposes: readonly Purpose[],
  wavelengthMode: MeasurementMode | null,
  switchModel: string | null,
  signal: AbortSignal,
): Promise<ChannelActivityResult> {
  if (purposes.length < 1 || purposes.length > RUN_PURPOSES.length || new Set(purposes).size !== purposes.length || purposes.some(purpose => !RUN_PURPOSES.includes(purpose))) {
    throw new RunActivityClientError('invalid_response');
  }
  const query = new URLSearchParams();
  purposes.forEach(purpose => query.append('purpose', purpose));
  if (wavelengthMode !== null) query.set('wavelength_mode', wavelengthMode);
  if (switchModel !== null) query.set('switch_model', switchModel);
  const response = await fetch(`/api/v1/reporting/channel-activity?${query}`, { signal, headers: { Accept: 'application/json' } });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body) && hasExactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && hasExactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isChannelActivityConnectedResponse(body)) throw new RunActivityClientError('invalid_response');
  if (body.filters.purpose.length !== purposes.length || body.filters.purpose.some((purpose, index) => purpose !== purposes[index]) || body.filters.wavelength_mode !== wavelengthMode || body.filters.switch_model !== switchModel) {
    throw new RunActivityClientError('invalid_response');
  }
  return body;
}
