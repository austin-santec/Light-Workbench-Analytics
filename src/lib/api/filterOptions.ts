import type { Purpose } from '../../types';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';

export interface FilterOptionsConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  extracted_at_utc: string;
  timezone: 'America/Los_Angeles';
  period: { key: 'last_30_days'; start_utc: string; end_utc: string; partial: boolean };
  filters: { purpose: Purpose[] };
  switch_models: string[];
  wavelength_modes: ('SM' | 'MM')[];
  channel_counts: number[];
  stations: number[];
  incomplete: boolean;
}

export type FilterOptionsResult = { data_source: 'not_connected' } | FilterOptionsConnectedResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

const utcTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

function validPurposes(value: unknown): value is Purpose[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= RUN_PURPOSES.length
    && new Set(value).size === value.length
    && value.every(purpose => RUN_PURPOSES.includes(purpose as Purpose));
}

// Strictly ascending (sorted, no duplicates) list whose items pass `valid`.
function ascending<T extends string | number>(value: unknown, valid: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(valid)
    && value.every((item, index) => index === 0 || (value[index - 1] as T) < (item as T));
}

const isModel = (item: unknown): item is string => typeof item === 'string' && item.length >= 1 && item.length <= 30;
const isMode = (item: unknown): item is 'SM' | 'MM' => item === 'SM' || item === 'MM';
const isChannelCount = (item: unknown): item is number => Number.isInteger(item) && (item as number) >= 1 && (item as number) <= 200;
const isStation = (item: unknown): item is number => Number.isInteger(item) && (item as number) >= 1;

export function isFilterOptionsConnectedResponse(value: unknown): value is FilterOptionsConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, [
    'data_source', 'tls', 'extracted_at_utc', 'timezone', 'period', 'filters',
    'switch_models', 'wavelength_modes', 'channel_counts', 'stations', 'incomplete',
  ])) return false;
  if (value.data_source !== 'test_database'
    || !['verified', 'encrypted_unverified'].includes(value.tls as string)
    || !utcTimestamp(value.extracted_at_utc)
    || value.timezone !== 'America/Los_Angeles'
    || typeof value.incomplete !== 'boolean') return false;
  const period = value.period;
  if (!isRecord(period) || !exactKeys(period, ['key', 'start_utc', 'end_utc', 'partial'])
    || period.key !== 'last_30_days' || !utcTimestamp(period.start_utc) || !utcTimestamp(period.end_utc)
    || typeof period.partial !== 'boolean') return false;
  if (!isRecord(value.filters) || !exactKeys(value.filters, ['purpose']) || !validPurposes(value.filters.purpose)) return false;
  return ascending(value.switch_models, isModel) && ascending(value.wavelength_modes, isMode)
    && ascending(value.channel_counts, isChannelCount) && ascending(value.stations, isStation);
}

export async function loadFilterOptions(purposes: readonly Purpose[], signal: AbortSignal): Promise<FilterOptionsResult> {
  if (!validPurposes([...purposes])) throw new RunActivityClientError('invalid_response');
  const query = new URLSearchParams();
  purposes.forEach(purpose => query.append('purpose', purpose));
  const response = await fetch(`/api/v1/reporting/filter-options?${query}`, { signal, headers: { Accept: 'application/json' } });
  let body: unknown;
  try { body = await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
  if (response.status === 503) {
    const code = isRecord(body) && exactKeys(body, ['code']) && typeof body.code === 'string'
      && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && exactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isFilterOptionsConnectedResponse(body)
    || body.filters.purpose.length !== purposes.length
    || body.filters.purpose.some((purpose, index) => purpose !== purposes[index])) throw new RunActivityClientError('invalid_response');
  return body;
}
