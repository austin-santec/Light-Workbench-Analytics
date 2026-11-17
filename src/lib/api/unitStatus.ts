import type { Purpose } from '../../types';
import { CHANNEL_ACTIVITY_PERIODS, type ChannelActivityPeriodKey } from './channelActivity';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';

export const UNIT_STATUSES = [
  'review_required',
  'not_evaluated',
  'passing',
  'failing_recovery_available',
  'failing_needs_analysis',
  'failing_no_measured_recovery',
] as const;
export type UnitStatus = typeof UNIT_STATUSES[number];

export interface UnitStatusFailingChannel {
  logical_channel: number;
  effective_port: number;
  wavelength_1_il_db: number;
  wavelength_2_il_db: number;
}

export interface UnitStatusLatestAnalysis {
  analysis_id: number;
  result_status: string;
  analyzed_at_utc: string;
  current: boolean;
  unused_recommendations: number;
}

export interface UnitStatusItem {
  unit_id: number;
  main_board_serial: string;
  assignment_id: number;
  switch_serial: string;
  switch_model: string;
  context_run_id: number | null;
  channel_count: number | null;
  status: UnitStatus;
  failing_channels: UnitStatusFailingChannel[];
  latest_analysis: UnitStatusLatestAnalysis | null;
  review_reasons: string[];
}

export interface UnitStatusConnectedResponse {
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
  classification_rule: 'strict >, run limit snapshot';
  counts: Record<UnitStatus, number> & { cohort_units: number };
  units: UnitStatusItem[];
  incomplete: boolean;
}

export type UnitStatusResult =
  | { data_source: 'not_connected' }
  | UnitStatusConnectedResponse;

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
const nonnegativeNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const utcTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

function isLatestAnalysis(value: unknown): value is UnitStatusLatestAnalysis {
  return isRecord(value)
    && exactKeys(value, ['analysis_id', 'result_status', 'analyzed_at_utc', 'current', 'unused_recommendations'])
    && positiveInteger(value.analysis_id)
    && typeof value.result_status === 'string'
    && value.result_status.length > 0
    && utcTimestamp(value.analyzed_at_utc)
    && typeof value.current === 'boolean'
    && nonnegativeInteger(value.unused_recommendations);
}

function isFailingChannel(value: unknown): value is UnitStatusFailingChannel {
  return isRecord(value)
    && exactKeys(value, ['logical_channel', 'effective_port', 'wavelength_1_il_db', 'wavelength_2_il_db'])
    && positiveInteger(value.logical_channel)
    && positiveInteger(value.effective_port)
    && nonnegativeNumber(value.wavelength_1_il_db)
    && nonnegativeNumber(value.wavelength_2_il_db);
}

function isUnit(value: unknown): value is UnitStatusItem {
  if (!isRecord(value) || !exactKeys(value, ['unit_id', 'main_board_serial', 'assignment_id', 'switch_serial', 'switch_model', 'context_run_id', 'channel_count', 'status', 'failing_channels', 'latest_analysis', 'review_reasons'])) return false;
  if (!positiveInteger(value.unit_id) || !positiveInteger(value.assignment_id) || !(value.context_run_id === null || positiveInteger(value.context_run_id)) || !(value.channel_count === null || positiveInteger(value.channel_count))) return false;
  if (![value.main_board_serial, value.switch_serial, value.switch_model].every(item => typeof item === 'string' && item.length > 0)) return false;
  if (typeof value.status !== 'string' || !UNIT_STATUSES.includes(value.status as UnitStatus)) return false;
  if (!Array.isArray(value.failing_channels) || !value.failing_channels.every(isFailingChannel)) return false;
  if (!(value.latest_analysis === null || isLatestAnalysis(value.latest_analysis))) return false;
  return Array.isArray(value.review_reasons) && value.review_reasons.every(reason => typeof reason === 'string' && reason.length > 0);
}

export function isUnitStatusConnectedResponse(value: unknown): value is UnitStatusConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, ['data_source', 'tls', 'extracted_at_utc', 'timezone', 'period', 'filters', 'classification_rule', 'counts', 'units', 'incomplete'])) return false;
  if (value.data_source !== 'test_database' || !['verified', 'encrypted_unverified'].includes(value.tls as string) || !utcTimestamp(value.extracted_at_utc) || value.timezone !== 'America/Los_Angeles' || value.classification_rule !== 'strict >, run limit snapshot' || typeof value.incomplete !== 'boolean') return false;
  if (!isRecord(value.period) || !exactKeys(value.period, ['key', 'start_utc', 'end_utc', 'partial']) || typeof value.period.key !== 'string' || !CHANNEL_ACTIVITY_PERIODS.includes(value.period.key as ChannelActivityPeriodKey) || !utcTimestamp(value.period.start_utc) || !utcTimestamp(value.period.end_utc) || typeof value.period.partial !== 'boolean' || Date.parse(value.period.start_utc) > Date.parse(value.period.end_utc)) return false;
  if (!isRecord(value.filters) || !exactKeys(value.filters, ['purpose']) || !Array.isArray(value.filters.purpose) || value.filters.purpose.length < 1 || value.filters.purpose.length > RUN_PURPOSES.length || new Set(value.filters.purpose).size !== value.filters.purpose.length || !value.filters.purpose.every(purpose => typeof purpose === 'string' && RUN_PURPOSES.includes(purpose as Purpose))) return false;
  if (!isRecord(value.counts)) return false;
  const rawCounts = value.counts;
  if (!exactKeys(rawCounts, ['cohort_units', ...UNIT_STATUSES]) || !['cohort_units', ...UNIT_STATUSES].every(key => nonnegativeInteger(rawCounts[key]))) return false;
  const counts = rawCounts as unknown as UnitStatusConnectedResponse['counts'];
  const statusTotal = UNIT_STATUSES.reduce((sum, status) => sum + counts[status], 0);
  if (statusTotal !== counts.cohort_units || !Array.isArray(value.units) || value.units.length !== counts.cohort_units || !value.units.every(isUnit)) return false;
  return true;
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadUnitStatus(
  period: ChannelActivityPeriodKey,
  purposes: readonly Purpose[],
  signal: AbortSignal,
): Promise<UnitStatusResult> {
  if (!CHANNEL_ACTIVITY_PERIODS.includes(period) || purposes.length < 1 || purposes.length > RUN_PURPOSES.length || new Set(purposes).size !== purposes.length || purposes.some(purpose => !RUN_PURPOSES.includes(purpose))) {
    throw new RunActivityClientError('invalid_response');
  }
  const query = new URLSearchParams({ period });
  purposes.forEach(purpose => query.append('purpose', purpose));
  const response = await fetch(`/api/v1/reporting/unit-status?${query}`, { signal, headers: { Accept: 'application/json' } });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body) && exactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && exactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isUnitStatusConnectedResponse(body) || body.period.key !== period || body.filters.purpose.length !== purposes.length || body.filters.purpose.some((purpose, index) => purpose !== purposes[index])) throw new RunActivityClientError('invalid_response');
  return body;
}
