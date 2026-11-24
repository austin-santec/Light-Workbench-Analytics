import type { Purpose } from '../../types';
import { CHANNEL_ACTIVITY_PERIODS, type ChannelActivityPeriodKey } from './channelActivity';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';

export type UnitTestTimeOutcome = 'passed' | 'unrecoverable';
export type UnitTestTimeOutcomeFilter = 'all' | UnitTestTimeOutcome;

export const UNIT_TEST_TIME_EXCLUDED_KEYS = [
  'review_required',
  'not_evaluated',
  'failing_recovery_available',
  'failing_needs_analysis',
  'other_saved_result',
  'run_in_progress',
  'missing_duration',
  'outside_period',
] as const;
export type UnitTestTimeExcludedKey = typeof UNIT_TEST_TIME_EXCLUDED_KEYS[number];

export interface UnitTestTimeItem {
  unit_id: number;
  main_board_serial: string;
  outcome: UnitTestTimeOutcome;
  finished_at_utc: string;
  total_ms: number;
  run_count: number;
  active_run_count: number;
  fallback_run_count: number;
}

export interface UnitTestTimeConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  extracted_at_utc: string;
  timezone: 'America/Los_Angeles';
  period: {
    key: ChannelActivityPeriodKey;
    start_utc: string;
    end_utc: string;
    partial: boolean;
  };
  filters: { purpose: Purpose[] };
  units: UnitTestTimeItem[];
  finished: Record<UnitTestTimeOutcome, number>;
  excluded: Record<UnitTestTimeExcludedKey, number>;
  incomplete: boolean;
}

export type UnitTestTimeResult =
  | { data_source: 'not_connected' }
  | UnitTestTimeConnectedResponse;

export interface UnitTestTimeHistogramBin {
  startMinute: number;
  endMinute: number;
  count: number;
  holdsMean: boolean;
}

export interface UnitTestTimeSummary {
  n: number;
  meanMs: number | null;
  medianMs: number | null;
  p90Ms: number | null;
  sampleLabel: 'No Data' | 'Small Sample' | null;
  over90Minutes: number;
  activeRunTotal: number;
  fallbackRunTotal: number;
  unitsUsingFallback: number;
  bins: UnitTestTimeHistogramBin[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

const nonnegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const utcTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

function isUnit(value: unknown): value is UnitTestTimeItem {
  return isRecord(value)
    && exactKeys(value, ['unit_id', 'main_board_serial', 'outcome', 'finished_at_utc', 'total_ms', 'run_count', 'active_run_count', 'fallback_run_count'])
    && positiveInteger(value.unit_id)
    && typeof value.main_board_serial === 'string'
    && value.main_board_serial.length > 0
    && (value.outcome === 'passed' || value.outcome === 'unrecoverable')
    && utcTimestamp(value.finished_at_utc)
    && nonnegativeInteger(value.total_ms)
    && positiveInteger(value.run_count)
    && nonnegativeInteger(value.active_run_count)
    && nonnegativeInteger(value.fallback_run_count)
    && value.active_run_count + value.fallback_run_count === value.run_count;
}

export function isUnitTestTimeConnectedResponse(value: unknown): value is UnitTestTimeConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, ['data_source', 'tls', 'extracted_at_utc', 'timezone', 'period', 'filters', 'units', 'finished', 'excluded', 'incomplete'])) return false;
  if (value.data_source !== 'test_database' || !['verified', 'encrypted_unverified'].includes(value.tls as string) || !utcTimestamp(value.extracted_at_utc) || value.timezone !== 'America/Los_Angeles' || typeof value.incomplete !== 'boolean') return false;
  if (!isRecord(value.period) || !exactKeys(value.period, ['key', 'start_utc', 'end_utc', 'partial']) || typeof value.period.key !== 'string' || !CHANNEL_ACTIVITY_PERIODS.includes(value.period.key as ChannelActivityPeriodKey) || !utcTimestamp(value.period.start_utc) || !utcTimestamp(value.period.end_utc) || typeof value.period.partial !== 'boolean' || Date.parse(value.period.start_utc) > Date.parse(value.period.end_utc)) return false;
  if (!isRecord(value.filters) || !exactKeys(value.filters, ['purpose']) || !Array.isArray(value.filters.purpose) || value.filters.purpose.length < 1 || value.filters.purpose.length > RUN_PURPOSES.length || new Set(value.filters.purpose).size !== value.filters.purpose.length || !value.filters.purpose.every(purpose => typeof purpose === 'string' && RUN_PURPOSES.includes(purpose as Purpose))) return false;
  if (!Array.isArray(value.units) || !value.units.every(isUnit)) return false;
  const units = value.units as UnitTestTimeItem[];
  if (new Set(units.map(unit => unit.unit_id)).size !== units.length) return false;
  if (units.some((unit, index) => index > 0 && (Date.parse(units[index - 1].finished_at_utc) < Date.parse(unit.finished_at_utc) || (units[index - 1].finished_at_utc === unit.finished_at_utc && units[index - 1].unit_id > unit.unit_id)))) return false;
  if (!isRecord(value.finished) || !exactKeys(value.finished, ['passed', 'unrecoverable']) || !nonnegativeInteger(value.finished.passed) || !nonnegativeInteger(value.finished.unrecoverable)) return false;
  const passed = units.filter(unit => unit.outcome === 'passed').length;
  const unrecoverable = units.length - passed;
  if (value.finished.passed < passed || value.finished.unrecoverable < unrecoverable || value.finished.passed + value.finished.unrecoverable < units.length) return false;
  if (!isRecord(value.excluded)) return false;
  const excluded = value.excluded;
  return exactKeys(excluded, UNIT_TEST_TIME_EXCLUDED_KEYS)
    && UNIT_TEST_TIME_EXCLUDED_KEYS.every(key => nonnegativeInteger(excluded[key]));
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadUnitTestTime(
  period: ChannelActivityPeriodKey,
  purposes: readonly Purpose[],
  signal: AbortSignal,
): Promise<UnitTestTimeResult> {
  if (!CHANNEL_ACTIVITY_PERIODS.includes(period) || purposes.length < 1 || purposes.length > RUN_PURPOSES.length || new Set(purposes).size !== purposes.length || purposes.some(purpose => !RUN_PURPOSES.includes(purpose))) throw new RunActivityClientError('invalid_response');
  const query = new URLSearchParams({ period });
  purposes.forEach(purpose => query.append('purpose', purpose));
  const response = await fetch(`/api/v1/reporting/unit-test-time?${query}`, { signal, headers: { Accept: 'application/json' } });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body) && exactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && exactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isUnitTestTimeConnectedResponse(body) || body.period.key !== period || body.filters.purpose.length !== purposes.length || body.filters.purpose.some((purpose, index) => purpose !== purposes[index])) throw new RunActivityClientError('invalid_response');
  return body;
}

export function summarizeUnitTestTime(
  units: readonly UnitTestTimeItem[],
  outcome: UnitTestTimeOutcomeFilter,
): UnitTestTimeSummary {
  const selected = outcome === 'all' ? [...units] : units.filter(unit => unit.outcome === outcome);
  const n = selected.length;
  if (n === 0) {
    return {
      n: 0,
      meanMs: null,
      medianMs: null,
      p90Ms: null,
      sampleLabel: 'No Data',
      over90Minutes: 0,
      activeRunTotal: 0,
      fallbackRunTotal: 0,
      unitsUsingFallback: 0,
      bins: [],
    };
  }
  const totals = selected.map(unit => unit.total_ms).sort((left, right) => left - right);
  const meanMs = totals.reduce((sum, value) => sum + value, 0) / n;
  const middle = Math.floor(n / 2);
  const medianMs = n % 2 ? totals[middle] : (totals[middle - 1] + totals[middle]) / 2;
  const p90Ms = totals[Math.ceil(0.9 * n) - 1];
  const minimumMinute = Math.floor(totals[0] / 60_000);
  const maximumMinute = totals[n - 1] / 60_000;
  const widthMinutes = Math.max(1, Math.ceil((maximumMinute - minimumMinute) / 8));
  const bins = Array.from({ length: 8 }, (_, index): UnitTestTimeHistogramBin => ({
    startMinute: minimumMinute + index * widthMinutes,
    endMinute: minimumMinute + (index + 1) * widthMinutes,
    count: 0,
    holdsMean: false,
  }));
  totals.forEach(total => {
    const index = Math.min(7, Math.max(0, Math.floor((total / 60_000 - minimumMinute) / widthMinutes)));
    bins[index].count += 1;
  });
  const meanIndex = Math.min(7, Math.max(0, Math.floor((meanMs / 60_000 - minimumMinute) / widthMinutes)));
  bins[meanIndex].holdsMean = true;
  return {
    n,
    meanMs,
    medianMs,
    p90Ms,
    sampleLabel: n < 10 ? 'Small Sample' : null,
    over90Minutes: totals.filter(total => total > 5_400_000).length,
    activeRunTotal: selected.reduce((sum, unit) => sum + unit.active_run_count, 0),
    fallbackRunTotal: selected.reduce((sum, unit) => sum + unit.fallback_run_count, 0),
    unitsUsingFallback: selected.filter(unit => unit.fallback_run_count > 0).length,
    bins,
  };
}
