import { RunActivityClientError } from './runActivity';

export const REPLACEMENT_PERIODS = ['today', 'yesterday', 'this_week', 'last_30_days'] as const;
export const REPLACEMENT_ATTRIBUTIONS = ['all', 'production', 'engineering', 'training', 'calibration', 'unattributed'] as const;
export type ReplacementPeriodKey = typeof REPLACEMENT_PERIODS[number];
export type ReplacementAttribution = typeof REPLACEMENT_ATTRIBUTIONS[number];

export interface ReplacementCounts {
  events: number;
  channels_replaced: number;
  units: number;
  events_per_unit: number | null;
  from_recommendation: number;
  related_run_not_current: number;
}

export interface ReplacementPeriod {
  start_utc: string;
  end_utc: string;
  partial: boolean;
  by_attribution: Record<ReplacementAttribution, ReplacementCounts>;
}

export interface ReplacementDay extends ReplacementPeriod { date: string }

export interface ReplacementActivityConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  extracted_at_utc: string;
  timezone: 'America/Los_Angeles';
  filters: { switch_model: string | null };
  periods: Record<ReplacementPeriodKey, ReplacementPeriod>;
  daily: ReplacementDay[];
  administrative_exclusions: number;
  incomplete: boolean;
}

export type ReplacementActivityResult =
  | { data_source: 'not_connected' }
  | ReplacementActivityConnectedResponse;

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

function isCounts(value: unknown): value is ReplacementCounts {
  if (!isRecord(value) || !exactKeys(value, ['events', 'channels_replaced', 'units', 'events_per_unit', 'from_recommendation', 'related_run_not_current'])) return false;
  if (!['events', 'channels_replaced', 'units', 'from_recommendation', 'related_run_not_current'].every(key => nonnegativeInteger(value[key]))) return false;
  return value.events_per_unit === null || (typeof value.events_per_unit === 'number' && Number.isFinite(value.events_per_unit) && value.events_per_unit >= 0);
}

function isPeriod(value: unknown, day: boolean): value is ReplacementPeriod | ReplacementDay {
  const keys = ['start_utc', 'end_utc', 'partial', 'by_attribution'];
  if (day) keys.push('date');
  if (!isRecord(value) || !exactKeys(value, keys) || !utcTimestamp(value.start_utc) || !utcTimestamp(value.end_utc) || typeof value.partial !== 'boolean') return false;
  if (Date.parse(value.start_utc) > Date.parse(value.end_utc) || !isRecord(value.by_attribution) || !exactKeys(value.by_attribution, REPLACEMENT_ATTRIBUTIONS)) return false;
  const attribution = value.by_attribution;
  if (!REPLACEMENT_ATTRIBUTIONS.every(key => isCounts(attribution[key]))) return false;
  return !day || (typeof value.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.date));
}

export function isReplacementActivityConnectedResponse(value: unknown): value is ReplacementActivityConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, ['data_source', 'tls', 'extracted_at_utc', 'timezone', 'filters', 'periods', 'daily', 'administrative_exclusions', 'incomplete'])) return false;
  if (value.data_source !== 'test_database' || !['verified', 'encrypted_unverified'].includes(value.tls as string) || !utcTimestamp(value.extracted_at_utc) || value.timezone !== 'America/Los_Angeles') return false;
  if (!isRecord(value.filters) || !exactKeys(value.filters, ['switch_model']) || !(value.filters.switch_model === null || (typeof value.filters.switch_model === 'string' && value.filters.switch_model.length >= 1 && value.filters.switch_model.length <= 30))) return false;
  if (!isRecord(value.periods) || !exactKeys(value.periods, REPLACEMENT_PERIODS)) return false;
  const periods = value.periods;
  if (!REPLACEMENT_PERIODS.every(key => isPeriod(periods[key], false))) return false;
  if (!Array.isArray(value.daily) || value.daily.length !== 31 || !value.daily.every(day => isPeriod(day, true))) return false;
  const daily = value.daily as ReplacementDay[];
  return nonnegativeInteger(value.administrative_exclusions) && value.administrative_exclusions === 0
    && typeof value.incomplete === 'boolean'
    && daily.every((day, index) => day.partial === (index === 30) && (index === 0 || daily[index - 1].date < day.date));
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadReplacementActivity(switchModel: string | null, signal: AbortSignal): Promise<ReplacementActivityResult> {
  const query = new URLSearchParams();
  if (switchModel !== null) query.set('switch_model', switchModel);
  const suffix = query.size ? `?${query}` : '';
  const response = await fetch(`/api/v1/reporting/replacement-activity${suffix}`, { signal, headers: { Accept: 'application/json' } });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body) && exactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && exactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isReplacementActivityConnectedResponse(body) || body.filters.switch_model !== switchModel) throw new RunActivityClientError('invalid_response');
  return body;
}
