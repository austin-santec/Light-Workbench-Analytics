import type { Purpose } from '../../types';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';

export interface StationSecondsPerChannel {
  median: string | null;
  n: number;
}

export interface StationCounts {
  failed: number;
  observed: number;
  rate: number | null;
  unknown_criteria: number;
  runs: number;
  units: number;
  active_run_channels: number;
  retested_run_channels: number;
  retest_share: number | null;
  seconds_per_channel: StationSecondsPerChannel;
}

export interface StationRow extends StationCounts {
  station_number: number | null;
}

export interface StationSummaryConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  extracted_at_utc: string;
  timezone: 'America/Los_Angeles';
  period: { key: 'last_30_days'; start_utc: string; end_utc: string; partial: boolean };
  filters: { purpose: Purpose[] };
  classification_rule: 'strict >, run limit snapshot';
  stations: StationRow[];
  totals: StationCounts;
  incomplete: boolean;
}

export type StationSummaryResult = { data_source: 'not_connected' } | StationSummaryConnectedResponse;

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

const COUNT_KEYS = [
  'failed', 'observed', 'rate', 'unknown_criteria', 'runs', 'units',
  'active_run_channels', 'retested_run_channels', 'retest_share', 'seconds_per_channel',
] as const;
const INTEGER_KEYS = ['failed', 'observed', 'unknown_criteria', 'runs', 'units', 'active_run_channels', 'retested_run_channels'] as const;

function ratioMatches(value: unknown, numerator: number, denominator: number): boolean {
  if (denominator === 0) return value === null;
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value - numerator / denominator) < 1e-12;
}

function isCounts(value: unknown, extraKeys: readonly string[] = []): value is StationCounts {
  if (!isRecord(value) || !exactKeys(value, [...COUNT_KEYS, ...extraKeys])) return false;
  if (!INTEGER_KEYS.every(key => nonnegativeInteger(value[key]))) return false;
  const v = value as unknown as StationCounts;
  if (v.failed > v.observed || v.retested_run_channels > v.active_run_channels || v.units > v.runs) return false;
  if (!ratioMatches(v.rate, v.failed, v.observed) || !ratioMatches(v.retest_share, v.retested_run_channels, v.active_run_channels)) return false;
  const seconds = value.seconds_per_channel;
  return isRecord(seconds) && exactKeys(seconds, ['median', 'n']) && nonnegativeInteger(seconds.n) && seconds.n <= v.runs
    && (seconds.n === 0 ? seconds.median === null : typeof seconds.median === 'string' && /^\d+\.\d{4}$/.test(seconds.median));
}

export function isStationSummaryConnectedResponse(value: unknown): value is StationSummaryConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, [
    'data_source', 'tls', 'extracted_at_utc', 'timezone', 'period', 'filters', 'classification_rule', 'stations', 'totals', 'incomplete',
  ])) return false;
  if (value.data_source !== 'test_database' || !['verified', 'encrypted_unverified'].includes(value.tls as string) || !utcTimestamp(value.extracted_at_utc) || value.timezone !== 'America/Los_Angeles' || value.classification_rule !== 'strict >, run limit snapshot' || typeof value.incomplete !== 'boolean') return false;
  const period = value.period;
  if (!isRecord(period) || !exactKeys(period, ['key', 'start_utc', 'end_utc', 'partial']) || period.key !== 'last_30_days' || !utcTimestamp(period.start_utc) || !utcTimestamp(period.end_utc) || typeof period.partial !== 'boolean' || Date.parse(period.start_utc) > Date.parse(period.end_utc)) return false;
  const filters = value.filters;
  if (!isRecord(filters) || !exactKeys(filters, ['purpose']) || !Array.isArray(filters.purpose) || filters.purpose.length < 1 || filters.purpose.length > RUN_PURPOSES.length || new Set(filters.purpose).size !== filters.purpose.length || !filters.purpose.every(purpose => RUN_PURPOSES.includes(purpose as Purpose))) return false;
  if (!isCounts(value.totals) || !Array.isArray(value.stations)) return false;
  const stations = value.stations;
  const isStationNumber = (value: unknown) => value === null || (Number.isInteger(value) && (value as number) > 0);
  if (!stations.every(station => isCounts(station, ['station_number']) && isStationNumber((station as unknown as Record<string, unknown>).station_number))) return false;
  const rows = stations as StationRow[];
  // Ordered by station number with the no-station group last; at most one of each key.
  for (let index = 1; index < rows.length; index++) {
    const previous = rows[index - 1].station_number;
    const current = rows[index].station_number;
    if (previous === null || (current !== null && current <= previous)) return false;
  }
  const totals = value.totals;
  const sum = (key: 'failed' | 'observed' | 'unknown_criteria' | 'runs' | 'active_run_channels' | 'retested_run_channels') => rows.reduce((total, row) => total + row[key], 0);
  return (['failed', 'observed', 'unknown_criteria', 'runs', 'active_run_channels', 'retested_run_channels'] as const).every(key => totals[key] === sum(key))
    && totals.seconds_per_channel.n === rows.reduce((total, row) => total + row.seconds_per_channel.n, 0);
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadStationSummary(purposes: readonly Purpose[], signal: AbortSignal): Promise<StationSummaryResult> {
  if (purposes.length < 1 || purposes.length > RUN_PURPOSES.length || new Set(purposes).size !== purposes.length || purposes.some(purpose => !RUN_PURPOSES.includes(purpose))) {
    throw new RunActivityClientError('invalid_response');
  }
  const query = new URLSearchParams();
  purposes.forEach(purpose => query.append('purpose', purpose));
  const response = await fetch(`/api/v1/reporting/station-summary?${query}`, { signal, headers: { Accept: 'application/json' } });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body) && exactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && exactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isStationSummaryConnectedResponse(body) || body.filters.purpose.length !== purposes.length || body.filters.purpose.some((purpose, index) => purpose !== purposes[index])) throw new RunActivityClientError('invalid_response');
  return body;
}

const percent = (value: number | null) => value === null ? '—' : `${(value * 100).toFixed(1)}%`;

export interface StationTableRow {
  key: string;
  name: string;
  units: string;
  secondsPerChannel: string;
  secondsTitle: string;
  failRate: string;
  failTitle: string;
  barWidth: string;
  retests: string;
  retestTitle: string;
  total: boolean;
}

/** Presentation rows: bar widths are relative to the highest station rate; totals pool N/D. */
export function stationTableRows(data: StationSummaryConnectedResponse): StationTableRow[] {
  const maxRate = data.stations.reduce((max, station) => Math.max(max, station.rate ?? 0), 0);
  const row = (key: string, name: string, counts: StationCounts, total: boolean): StationTableRow => ({
    key,
    name,
    units: counts.units.toLocaleString('en-US'),
    secondsPerChannel: counts.seconds_per_channel.median === null ? '—' : Number(counts.seconds_per_channel.median).toFixed(1),
    secondsTitle: `Median of ${counts.seconds_per_channel.n} ${counts.seconds_per_channel.n === 1 ? 'run' : 'runs'}`,
    failRate: percent(counts.rate),
    failTitle: `${counts.failed} of ${counts.observed} first observations failed`,
    barWidth: counts.rate === null || maxRate === 0 ? '0' : (counts.rate / maxRate * 100).toFixed(1),
    retests: percent(counts.retest_share),
    retestTitle: `${counts.retested_run_channels} of ${counts.active_run_channels} run-channels retested`,
    total,
  });
  return [
    ...data.stations.map(station => row(
      station.station_number === null ? 'none' : String(station.station_number),
      station.station_number === null ? 'No station recorded' : `Station ${station.station_number}`,
      station,
      false,
    )),
    ...(data.stations.length ? [row('all', 'All stations', data.totals, true)] : []),
  ];
}
