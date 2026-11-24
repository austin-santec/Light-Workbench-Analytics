import type { Purpose } from '../../types';
import { CHANNEL_ACTIVITY_PERIODS, type ChannelActivityPeriodKey } from './channelActivity';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';
import { appendReportFilters, filterEchoMatches, isReportFilterEcho, NO_FILTERS, type ReportFilterEcho, type ReportFilters } from './reportFilters';

export interface FailureWavelengthPair {
  wavelength_mode: 'SM' | 'MM';
  wavelength_1_nm: number;
  wavelength_2_nm: number;
  failed: number;
  first_only: number;
  second_only: number;
  both: number;
}

export interface FailureWavelengthsConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  extracted_at_utc: string;
  timezone: 'America/Los_Angeles';
  period: { key: ChannelActivityPeriodKey; start_utc: string; end_utc: string; partial: boolean };
  filters: ReportFilterEcho;
  pairs: FailureWavelengthPair[];
  totals: { failed: number; observed: number; unknown_criteria: number; runs: number };
  incomplete: boolean;
}

export type FailureWavelengthsResult =
  | { data_source: 'not_connected' }
  | FailureWavelengthsConnectedResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

const nonnegativeInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const positiveInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0;
const utcTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

function validPurposes(value: unknown): value is Purpose[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= RUN_PURPOSES.length
    && new Set(value).size === value.length
    && value.every(purpose => RUN_PURPOSES.includes(purpose as Purpose));
}

function isPair(value: unknown): value is FailureWavelengthPair {
  if (!isRecord(value) || !exactKeys(value, [
    'wavelength_mode', 'wavelength_1_nm', 'wavelength_2_nm', 'failed', 'first_only', 'second_only', 'both',
  ])) return false;
  return (value.wavelength_mode === 'SM' || value.wavelength_mode === 'MM')
    && positiveInteger(value.wavelength_1_nm) && positiveInteger(value.wavelength_2_nm)
    && value.wavelength_1_nm !== value.wavelength_2_nm
    && positiveInteger(value.failed) && nonnegativeInteger(value.first_only)
    && nonnegativeInteger(value.second_only) && nonnegativeInteger(value.both)
    && value.failed === value.first_only + value.second_only + value.both;
}

const pairOrder = (left: FailureWavelengthPair, right: FailureWavelengthPair) =>
  left.wavelength_mode.localeCompare(right.wavelength_mode)
  || left.wavelength_1_nm - right.wavelength_1_nm
  || left.wavelength_2_nm - right.wavelength_2_nm;

export function isFailureWavelengthsConnectedResponse(value: unknown): value is FailureWavelengthsConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, [
    'data_source', 'tls', 'extracted_at_utc', 'timezone', 'period', 'filters', 'pairs', 'totals', 'incomplete',
  ])) return false;
  if (value.data_source !== 'test_database'
    || !['verified', 'encrypted_unverified'].includes(value.tls as string)
    || !utcTimestamp(value.extracted_at_utc)
    || value.timezone !== 'America/Los_Angeles'
    || typeof value.incomplete !== 'boolean') return false;
  const period = value.period;
  if (!isRecord(period) || !exactKeys(period, ['key', 'start_utc', 'end_utc', 'partial'])
    || !CHANNEL_ACTIVITY_PERIODS.includes(period.key as ChannelActivityPeriodKey)
    || !utcTimestamp(period.start_utc) || !utcTimestamp(period.end_utc)
    || typeof period.partial !== 'boolean'
    || Date.parse(period.start_utc) > Date.parse(period.end_utc)) return false;
  if (!isReportFilterEcho(value.filters)) return false;
  const totals = value.totals;
  if (!isRecord(totals) || !exactKeys(totals, ['failed', 'observed', 'unknown_criteria', 'runs'])
    || !nonnegativeInteger(totals.failed) || !nonnegativeInteger(totals.observed)
    || !nonnegativeInteger(totals.unknown_criteria) || !nonnegativeInteger(totals.runs)
    || totals.failed > totals.observed) return false;
  if (!Array.isArray(value.pairs) || !value.pairs.every(isPair)) return false;
  const pairs = value.pairs;
  if (pairs.some((pair, index) => index > 0 && pairOrder(pairs[index - 1], pair) >= 0)) return false;
  return totals.failed === pairs.reduce((sum, pair) => sum + pair.failed, 0);
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadFailureWavelengths(
  period: ChannelActivityPeriodKey,
  purposes: readonly Purpose[],
  signal: AbortSignal,
  filters: ReportFilters = NO_FILTERS,
): Promise<FailureWavelengthsResult> {
  if (!CHANNEL_ACTIVITY_PERIODS.includes(period) || !validPurposes([...purposes])) {
    throw new RunActivityClientError('invalid_response');
  }
  const query = new URLSearchParams({ period });
  purposes.forEach(purpose => query.append('purpose', purpose));
  appendReportFilters(query, filters);
  const response = await fetch(`/api/v1/reporting/failure-wavelengths?${query}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body) && exactKeys(body, ['code']) && typeof body.code === 'string'
      && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) {
    throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  }
  if (isRecord(body) && exactKeys(body, ['data_source']) && body.data_source === 'not_connected') {
    return { data_source: 'not_connected' };
  }
  if (!isFailureWavelengthsConnectedResponse(body) || body.period.key !== period
    || !filterEchoMatches(body.filters, purposes, filters)) {
    throw new RunActivityClientError('invalid_response');
  }
  return body;
}

export interface WavelengthSegment {
  key: 'longer' | 'shorter' | 'both';
  label: string;
  count: number;
  share: number;
  color: string;
}

export interface WavelengthBar {
  key: string;
  label: string;
  failed: number;
  segments: WavelengthSegment[];
  aria: string;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

// Longer wavelength first, then shorter, then both; nm order is taken from the data, never assumed.
export function wavelengthBars(data: FailureWavelengthsConnectedResponse): WavelengthBar[] {
  return data.pairs.map(pair => {
    const firstIsLonger = pair.wavelength_1_nm > pair.wavelength_2_nm;
    const longerNm = firstIsLonger ? pair.wavelength_1_nm : pair.wavelength_2_nm;
    const shorterNm = firstIsLonger ? pair.wavelength_2_nm : pair.wavelength_1_nm;
    const longerCount = firstIsLonger ? pair.first_only : pair.second_only;
    const shorterCount = firstIsLonger ? pair.second_only : pair.first_only;
    const segments: WavelengthSegment[] = [
      { key: 'longer', label: `${longerNm} nm only`, count: longerCount, share: longerCount / pair.failed, color: 'var(--o1)' },
      { key: 'shorter', label: `${shorterNm} nm only`, count: shorterCount, share: shorterCount / pair.failed, color: 'var(--o2)' },
      { key: 'both', label: 'Both', count: pair.both, share: pair.both / pair.failed, color: 'var(--o3)' },
    ];
    const label = `${pair.wavelength_mode} ${shorterNm}/${longerNm} nm`;
    return {
      key: `${pair.wavelength_mode}-${pair.wavelength_1_nm}-${pair.wavelength_2_nm}`,
      label,
      failed: pair.failed,
      segments,
      aria: `${label}, ${pair.failed} failed ${pair.failed === 1 ? 'observation' : 'observations'}: `
        + segments.map(segment => `${segment.label} ${segment.count} (${percent(segment.share)})`).join(', '),
    };
  });
}

export const wavelengthShare = percent;
