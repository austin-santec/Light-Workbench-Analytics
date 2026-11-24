import type { Purpose } from '../../types';
import { CHANNEL_ACTIVITY_PERIODS, type ChannelActivityPeriodKey } from './channelActivity';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';
import { appendReportFilters, filterEchoMatches, isReportFilterEcho, NO_FILTERS, type ReportFilterEcho, type ReportFilters } from './reportFilters';

export interface FailureKpiUnits {
  finished: number;
  passed_no_replacement: number;
  passed_after_replacement: number;
  unrecoverable: number;
  replacement_units: number;
  replaced_channels: number;
  first_pass: number;
  first_pass_unknown: number;
}

export interface FailureKpisConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  extracted_at_utc: string;
  timezone: 'America/Los_Angeles';
  period: { key: ChannelActivityPeriodKey; start_utc: string; end_utc: string; partial: boolean };
  filters: ReportFilterEcho;
  units: FailureKpiUnits;
  retest: { active_run_channels: number; retested_run_channels: number };
  incomplete: boolean;
}

export type FailureKpisResult = { data_source: 'not_connected' } | FailureKpisConnectedResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

const nonnegativeInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const utcTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));
const UNIT_KEYS = ['finished', 'passed_no_replacement', 'passed_after_replacement', 'unrecoverable', 'replacement_units', 'replaced_channels', 'first_pass', 'first_pass_unknown'] as const;

function validPurposes(value: unknown): value is Purpose[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= RUN_PURPOSES.length
    && new Set(value).size === value.length
    && value.every(purpose => RUN_PURPOSES.includes(purpose as Purpose));
}

function validUnits(value: unknown): value is FailureKpiUnits {
  if (!isRecord(value) || !exactKeys(value, UNIT_KEYS) || !UNIT_KEYS.every(key => nonnegativeInteger(value[key]))) return false;
  const units = value as unknown as FailureKpiUnits;
  return units.finished === units.passed_no_replacement + units.passed_after_replacement + units.unrecoverable
    && units.replacement_units >= units.passed_after_replacement
    && units.replacement_units <= units.passed_after_replacement + units.unrecoverable
    && units.replaced_channels >= units.replacement_units
    && (units.replaced_channels === 0) === (units.replacement_units === 0)
    && units.first_pass + units.first_pass_unknown <= units.finished - units.replacement_units
    && units.first_pass <= units.passed_no_replacement + units.unrecoverable;
}

export function isFailureKpisConnectedResponse(value: unknown): value is FailureKpisConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, [
    'data_source', 'tls', 'extracted_at_utc', 'timezone', 'period', 'filters', 'units', 'retest', 'incomplete',
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
  const retest = value.retest;
  if (!isRecord(retest) || !exactKeys(retest, ['active_run_channels', 'retested_run_channels'])
    || !nonnegativeInteger(retest.active_run_channels) || !nonnegativeInteger(retest.retested_run_channels)
    || retest.retested_run_channels > retest.active_run_channels) return false;
  return validUnits(value.units);
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadFailureKpis(
  period: ChannelActivityPeriodKey,
  purposes: readonly Purpose[],
  signal: AbortSignal,
  filters: ReportFilters = NO_FILTERS,
): Promise<FailureKpisResult> {
  if (!CHANNEL_ACTIVITY_PERIODS.includes(period) || !validPurposes([...purposes])) {
    throw new RunActivityClientError('invalid_response');
  }
  const query = new URLSearchParams({ period });
  purposes.forEach(purpose => query.append('purpose', purpose));
  appendReportFilters(query, filters);
  const response = await fetch(`/api/v1/reporting/failure-kpis?${query}`, {
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
  if (!isFailureKpisConnectedResponse(body) || body.period.key !== period
    || !filterEchoMatches(body.filters, purposes, filters)) {
    throw new RunActivityClientError('invalid_response');
  }
  return body;
}

export interface FailureKpiTile {
  key: 'needing' | 'swapped' | 'recovered' | 'unrecoverable' | 'retested';
  label: string;
  value: string;
  sub: string;
  pct: number;
  bar: string;
  color: string;
}

// First-pass proxy: no failed first reading and no replacement; unknown-criteria units are left out of N and D.
export function firstPassYield(units: FailureKpiUnits): number | null {
  const denominator = units.finished - units.first_pass_unknown;
  return denominator === 0 ? null : units.first_pass / denominator;
}

const count = (value: number) => value.toLocaleString('en-US');
const plural = (value: number, one: string, many: string) => `${count(value)} ${value === 1 ? one : many}`;
const percent = (numerator: number, denominator: number) => denominator === 0 ? null : numerator / denominator * 100;
const percentText = (value: number | null) => value === null ? '—' : `${value.toFixed(1)}%`;

// Live tile text and bars; ratios are computed here from the backend's integer counts.
export function failureKpiTiles(data: FailureKpisConnectedResponse, accent: string): FailureKpiTile[] {
  const { units, retest } = data;
  const needing = units.passed_after_replacement + units.unrecoverable;
  const needingShare = percent(needing, units.finished);
  const unrecoverableShare = percent(units.unrecoverable, units.finished);
  const recovered = percent(units.passed_after_replacement, needing);
  const perUnit = units.replacement_units === 0 ? null : units.replaced_channels / units.replacement_units;
  const retested = percent(retest.retested_run_channels, retest.active_run_channels);
  const ofFinished = (share: number | null) => share === null
    ? 'No finished units in this range'
    : `${percentText(share)} of ${plural(units.finished, 'finished unit', 'finished units')}`;
  return [
    { key: 'needing', label: 'Units needing replacement', value: count(needing), sub: ofFinished(needingShare), pct: needingShare ?? 0, bar: 'var(--o2)', color: 'var(--ink)' },
    {
      key: 'swapped', label: 'Channels swapped per failing unit', value: perUnit === null ? '—' : perUnit.toFixed(1),
      sub: perUnit === null ? 'No replacements in this range' : `${plural(units.replaced_channels, 'replaced channel', 'replaced channels')} across ${plural(units.replacement_units, 'unit', 'units')}`,
      // Bar scale: 5 channels per unit fills the bar.
      pct: perUnit === null ? 0 : Math.min(100, perUnit / 5 * 100), bar: accent, color: 'var(--ink)',
    },
    {
      key: 'recovered', label: 'Recovered after replacement', value: percentText(recovered),
      sub: needing === 0 ? 'No units needed replacement' : `${count(units.passed_after_replacement)} of ${plural(needing, 'unit', 'units')} that needed replacement now ${units.passed_after_replacement === 1 ? 'passes' : 'pass'}`,
      pct: recovered ?? 0, bar: 'var(--o1)', color: 'var(--ink)',
    },
    { key: 'unrecoverable', label: 'Unrecoverable units', value: count(units.unrecoverable), sub: ofFinished(unrecoverableShare), pct: unrecoverableShare ?? 0, bar: 'var(--o3)', color: units.unrecoverable > 0 ? 'var(--bad-fg)' : 'var(--ink)' },
    {
      key: 'retested', label: 'Retested channels', value: percentText(retested),
      sub: retested === null ? 'No channel activity in this range' : `${count(retest.retested_run_channels)} of ${plural(retest.active_run_channels, 'run-channel', 'run-channels')} had another attempt in the same run`,
      pct: retested ?? 0, bar: accent, color: 'var(--ink)',
    },
  ];
}
