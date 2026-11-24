import type { Purpose } from '../../types';
import { CHANNEL_ACTIVITY_PERIODS, type ChannelActivityPeriodKey } from './channelActivity';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';

export type RecentFinishedOutcome = 'passed_no_replacement' | 'passed_after_replacement' | 'unrecoverable';

export interface RecentFinishedUnit {
  unit_id: number;
  main_board_serial: string;
  switch_model: string;
  wavelength_mode: 'SM' | 'MM';
  channel_count: number | null;
  station_number: number | null;
  finished_at_utc: string;
  outcome: RecentFinishedOutcome;
  replaced_channels: number;
  failed_channels: number | null;
  failed_unknown: boolean;
  total_ms: number | null;
  worst_il_db: string | null;
  worst_il_wavelength_nm: number | null;
  worst_il_over_limit: boolean | null;
}

export interface RecentFinishedUnitsConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  extracted_at_utc: string;
  timezone: 'America/Los_Angeles';
  period: { key: ChannelActivityPeriodKey; start_utc: string; end_utc: string; partial: boolean };
  filters: { purpose: Purpose[] };
  units: RecentFinishedUnit[];
  truncated: boolean;
  incomplete: boolean;
}

export type RecentFinishedUnitsResult = { data_source: 'not_connected' } | RecentFinishedUnitsConnectedResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

const nonnegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const positiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const utcTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));
const decimalString = (value: unknown): value is string => typeof value === 'string'
  && /^-?\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value));

function isUnit(value: unknown): value is RecentFinishedUnit {
  if (!isRecord(value) || !exactKeys(value, [
    'unit_id', 'main_board_serial', 'switch_model', 'wavelength_mode', 'channel_count',
    'station_number', 'finished_at_utc', 'outcome', 'replaced_channels', 'failed_channels',
    'failed_unknown', 'total_ms', 'worst_il_db', 'worst_il_wavelength_nm', 'worst_il_over_limit',
  ])) return false;
  const worstNull = value.worst_il_db === null && value.worst_il_wavelength_nm === null && value.worst_il_over_limit === null;
  const worstKnown = decimalString(value.worst_il_db) && positiveInteger(value.worst_il_wavelength_nm) && typeof value.worst_il_over_limit === 'boolean';
  return positiveInteger(value.unit_id)
    && typeof value.main_board_serial === 'string' && value.main_board_serial.length > 0
    && typeof value.switch_model === 'string' && value.switch_model.length > 0
    && (value.wavelength_mode === 'SM' || value.wavelength_mode === 'MM')
    && (value.channel_count === null || positiveInteger(value.channel_count))
    && (value.station_number === null || positiveInteger(value.station_number))
    && utcTimestamp(value.finished_at_utc)
    && ['passed_no_replacement', 'passed_after_replacement', 'unrecoverable'].includes(value.outcome as string)
    && nonnegativeInteger(value.replaced_channels)
    && (value.failed_channels === null || nonnegativeInteger(value.failed_channels))
    && typeof value.failed_unknown === 'boolean'
    && ((value.failed_unknown && value.failed_channels === null) || (!value.failed_unknown && value.failed_channels !== null))
    && (value.total_ms === null || nonnegativeInteger(value.total_ms))
    && (worstNull || worstKnown);
}

export function isRecentFinishedUnitsConnectedResponse(value: unknown): value is RecentFinishedUnitsConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, ['data_source', 'tls', 'extracted_at_utc', 'timezone', 'period', 'filters', 'units', 'truncated', 'incomplete'])) return false;
  if (value.data_source !== 'test_database' || !['verified', 'encrypted_unverified'].includes(value.tls as string) || !utcTimestamp(value.extracted_at_utc) || value.timezone !== 'America/Los_Angeles' || typeof value.truncated !== 'boolean' || typeof value.incomplete !== 'boolean') return false;
  if (!isRecord(value.period) || !exactKeys(value.period, ['key', 'start_utc', 'end_utc', 'partial']) || !CHANNEL_ACTIVITY_PERIODS.includes(value.period.key as ChannelActivityPeriodKey) || !utcTimestamp(value.period.start_utc) || !utcTimestamp(value.period.end_utc) || typeof value.period.partial !== 'boolean') return false;
  const period = value.period;
  if (!isRecord(value.filters) || !exactKeys(value.filters, ['purpose']) || !Array.isArray(value.filters.purpose) || value.filters.purpose.length < 1 || value.filters.purpose.length > RUN_PURPOSES.length || new Set(value.filters.purpose).size !== value.filters.purpose.length || !value.filters.purpose.every(purpose => RUN_PURPOSES.includes(purpose as Purpose))) return false;
  if (!Array.isArray(value.units) || value.units.length > 100 || !value.units.every(isUnit)) return false;
  const units = value.units as RecentFinishedUnit[];
  if (value.truncated && units.length !== 100) return false;
  return new Set(units.map(unit => unit.unit_id)).size === units.length
    && units.every(unit => Date.parse(unit.finished_at_utc) >= Date.parse(period.start_utc as string) && Date.parse(unit.finished_at_utc) < Date.parse(period.end_utc as string))
    && units.every((unit, index) => index === 0 || Date.parse(units[index - 1].finished_at_utc) > Date.parse(unit.finished_at_utc) || (units[index - 1].finished_at_utc === unit.finished_at_utc && units[index - 1].unit_id < unit.unit_id));
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadRecentFinishedUnits(period: ChannelActivityPeriodKey, purposes: readonly Purpose[], signal: AbortSignal): Promise<RecentFinishedUnitsResult> {
  if (!CHANNEL_ACTIVITY_PERIODS.includes(period) || purposes.length < 1 || purposes.length > RUN_PURPOSES.length || new Set(purposes).size !== purposes.length || purposes.some(purpose => !RUN_PURPOSES.includes(purpose))) throw new RunActivityClientError('invalid_response');
  const query = new URLSearchParams({ period });
  purposes.forEach(purpose => query.append('purpose', purpose));
  const response = await fetch(`/api/v1/reporting/recent-finished-units?${query}`, { signal, headers: { Accept: 'application/json' } });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body) && exactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && exactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isRecentFinishedUnitsConnectedResponse(body) || body.period.key !== period || body.filters.purpose.length !== purposes.length || body.filters.purpose.some((purpose, index) => purpose !== purposes[index])) throw new RunActivityClientError('invalid_response');
  return body;
}
