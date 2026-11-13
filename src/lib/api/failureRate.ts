import type { MeasurementMode, Purpose } from '../../types';
import { CHANNEL_ACTIVITY_PERIODS, type ChannelActivityPeriodKey } from './channelActivity';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';

export interface FailureRateCounts {
  failed: number;
  observed: number;
  rate: number | null;
  unknown_criteria: number;
}

export interface FailureRatePeriod extends FailureRateCounts {
  start_utc: string;
  end_utc: string;
  partial: boolean;
}

export interface FailureRateDay extends FailureRatePeriod {
  date: string;
}

export interface FailureRateConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  extracted_at_utc: string;
  timezone: 'America/Los_Angeles';
  filters: {
    purpose: Purpose[];
    wavelength_mode: MeasurementMode | null;
    switch_model: string | null;
  };
  classification_rule: 'strict >, run limit snapshot';
  periods: Record<ChannelActivityPeriodKey, FailureRatePeriod>;
  daily: FailureRateDay[];
  incomplete: boolean;
}

export type FailureRateResult =
  | { data_source: 'not_connected' }
  | FailureRateConnectedResponse;

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
  if (!isNonnegativeInteger(value.failed)
    || !isNonnegativeInteger(value.observed)
    || !isNonnegativeInteger(value.unknown_criteria)
    || (value.failed as number) > (value.observed as number)) return false;
  if (value.observed === 0) return value.failed === 0 && value.rate === null;
  return typeof value.rate === 'number'
    && Number.isFinite(value.rate)
    && value.rate >= 0
    && value.rate <= 1
    && Math.abs(value.rate - (value.failed as number) / (value.observed as number)) < 1e-12;
}

function isPeriod(value: unknown, day: boolean): value is FailureRateDay | FailureRatePeriod {
  const keys = ['start_utc', 'end_utc', 'partial', 'failed', 'observed', 'rate', 'unknown_criteria'];
  if (day) keys.push('date');
  if (!isRecord(value) || !hasExactKeys(value, keys) || !isCounts(value)) return false;
  if (!isUtcTimestamp(value.start_utc) || !isUtcTimestamp(value.end_utc) || typeof value.partial !== 'boolean') return false;
  if (Date.parse(value.start_utc) > Date.parse(value.end_utc)) return false;
  return !day || (typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date));
}

function isFilters(value: unknown): value is FailureRateConnectedResponse['filters'] {
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

function isFailureRateConnectedResponse(value: unknown): value is FailureRateConnectedResponse {
  if (!isRecord(value) || !hasExactKeys(value, ['data_source', 'tls', 'extracted_at_utc', 'timezone', 'filters', 'classification_rule', 'periods', 'daily', 'incomplete'])) return false;
  if (value.data_source !== 'test_database' || !['verified', 'encrypted_unverified'].includes(value.tls as string)) return false;
  if (!isUtcTimestamp(value.extracted_at_utc)
    || value.timezone !== 'America/Los_Angeles'
    || value.classification_rule !== 'strict >, run limit snapshot'
    || typeof value.incomplete !== 'boolean'
    || !isFilters(value.filters)) return false;
  const periods = value.periods;
  if (!isRecord(periods)
    || !hasExactKeys(periods, CHANNEL_ACTIVITY_PERIODS)
    || !CHANNEL_ACTIVITY_PERIODS.every(key => isPeriod(periods[key], false))) return false;
  if (!Array.isArray(value.daily) || value.daily.length !== 31 || !value.daily.every(day => isPeriod(day, true))) return false;
  const daily = value.daily as FailureRateDay[];
  return daily.every((day, index) => day.partial === (index === daily.length - 1)
    && (index === 0 || daily[index - 1].date < day.date));
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new RunActivityClientError('invalid_response');
  }
}

export async function loadFailureRate(
  purposes: readonly Purpose[],
  wavelengthMode: MeasurementMode | null,
  switchModel: string | null,
  signal: AbortSignal,
): Promise<FailureRateResult> {
  if (purposes.length < 1
    || purposes.length > RUN_PURPOSES.length
    || new Set(purposes).size !== purposes.length
    || purposes.some(purpose => !RUN_PURPOSES.includes(purpose))) {
    throw new RunActivityClientError('invalid_response');
  }
  const query = new URLSearchParams();
  purposes.forEach(purpose => query.append('purpose', purpose));
  if (wavelengthMode !== null) query.set('wavelength_mode', wavelengthMode);
  if (switchModel !== null) query.set('switch_model', switchModel);
  const response = await fetch(`/api/v1/reporting/failure-rate?${query}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body)
      && hasExactKeys(body, ['code'])
      && typeof body.code === 'string'
      && /^[a-z0-9_]{1,64}$/.test(body.code)
      ? body.code
      : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && hasExactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isFailureRateConnectedResponse(body)) throw new RunActivityClientError('invalid_response');
  if (body.filters.purpose.length !== purposes.length
    || body.filters.purpose.some((purpose, index) => purpose !== purposes[index])
    || body.filters.wavelength_mode !== wavelengthMode
    || body.filters.switch_model !== switchModel) {
    throw new RunActivityClientError('invalid_response');
  }
  return body;
}
