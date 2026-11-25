import type { Purpose } from '../../types';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';
import { appendReportFilters, filterEchoMatches, isReportFilterEcho, NO_FILTERS, type ReportFilterEcho, type ReportFilters } from './reportFilters';

export const UNIT_OUTCOMES_EXCLUDED_KEYS = [
  'review_required',
  'not_evaluated',
  'failing_recovery_available',
  'failing_needs_analysis',
  'other_saved_result',
  'run_in_progress',
  'outside_period',
] as const;
export type UnitOutcomesExcludedKey = typeof UNIT_OUTCOMES_EXCLUDED_KEYS[number];

export interface UnitOutcomeWeek {
  start_utc: string;
  end_utc: string;
  local_start_date: string;
  partial: boolean;
  passed_no_replacement: number;
  passed_after_replacement: number;
  unrecoverable: number;
}

export interface UnitOutcomeItem {
  unit_id: number;
  main_board_serial: string;
  outcome: 'passed' | 'unrecoverable';
  replaced: boolean;
  finished_at_utc: string;
  week_start_date: string;
}

export interface UnitOutcomesWeeklyConnectedResponse {
  data_source: 'test_database';
  tls: 'verified' | 'encrypted_unverified';
  extracted_at_utc: string;
  timezone: 'America/Los_Angeles';
  filters: ReportFilterEcho;
  weeks: UnitOutcomeWeek[];
  units: UnitOutcomeItem[];
  excluded: Record<UnitOutcomesExcludedKey, number>;
  incomplete: boolean;
}

export type UnitOutcomesWeeklyResult =
  | { data_source: 'not_connected' }
  | UnitOutcomesWeeklyConnectedResponse;

export interface UnitOutcomeBar {
  x: string;
  cx: string;
  y1: string;
  h1: string;
  y2: string;
  h2: string;
  y3: string;
  h3: string;
  ty: string;
  total: string;
  label: string;
  unrec: string;
}

export interface UnitOutcomeGeometry {
  maximum: number;
  bars: UnitOutcomeBar[];
  grid: { y: string; ty: string; label: string }[];
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
const localDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

function isWeek(value: unknown): value is UnitOutcomeWeek {
  return isRecord(value)
    && exactKeys(value, ['start_utc', 'end_utc', 'local_start_date', 'partial', 'passed_no_replacement', 'passed_after_replacement', 'unrecoverable'])
    && utcTimestamp(value.start_utc)
    && utcTimestamp(value.end_utc)
    && Date.parse(value.start_utc) <= Date.parse(value.end_utc)
    && localDate(value.local_start_date)
    && new Date(`${value.local_start_date}T12:00:00Z`).getUTCDay() === 1
    && typeof value.partial === 'boolean'
    && nonnegativeInteger(value.passed_no_replacement)
    && nonnegativeInteger(value.passed_after_replacement)
    && nonnegativeInteger(value.unrecoverable);
}

function isUnit(value: unknown): value is UnitOutcomeItem {
  return isRecord(value)
    && exactKeys(value, ['unit_id', 'main_board_serial', 'outcome', 'replaced', 'finished_at_utc', 'week_start_date'])
    && positiveInteger(value.unit_id)
    && typeof value.main_board_serial === 'string'
    && value.main_board_serial.length > 0
    && (value.outcome === 'passed' || value.outcome === 'unrecoverable')
    && typeof value.replaced === 'boolean'
    && !(value.outcome === 'unrecoverable' && value.replaced)
    && utcTimestamp(value.finished_at_utc)
    && localDate(value.week_start_date);
}

export function isUnitOutcomesWeeklyConnectedResponse(value: unknown): value is UnitOutcomesWeeklyConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, ['data_source', 'tls', 'extracted_at_utc', 'timezone', 'filters', 'weeks', 'units', 'excluded', 'incomplete'])) return false;
  if (value.data_source !== 'test_database' || !['verified', 'encrypted_unverified'].includes(value.tls as string) || !utcTimestamp(value.extracted_at_utc) || value.timezone !== 'America/Los_Angeles' || typeof value.incomplete !== 'boolean') return false;
  if (!isReportFilterEcho(value.filters)) return false;
  if (!Array.isArray(value.weeks) || value.weeks.length !== 8 || !value.weeks.every(isWeek)) return false;
  const weeks = value.weeks as UnitOutcomeWeek[];
  if (weeks.some((week, index) => week.partial !== (index === 7))) return false;
  if (weeks[7].end_utc !== value.extracted_at_utc) return false;
  for (let index = 1; index < weeks.length; index += 1) {
    const expectedDate = new Date(`${weeks[index - 1].local_start_date}T12:00:00Z`);
    expectedDate.setUTCDate(expectedDate.getUTCDate() + 7);
    if (weeks[index - 1].end_utc !== weeks[index].start_utc || expectedDate.toISOString().slice(0, 10) !== weeks[index].local_start_date) return false;
  }
  if (!Array.isArray(value.units) || !value.units.every(isUnit)) return false;
  const units = value.units as UnitOutcomeItem[];
  if (new Set(units.map(unit => unit.unit_id)).size !== units.length) return false;
  const counts = new Map<string, number>(weeks.flatMap(week => [0, 1, 2].map(bucket => [`${week.local_start_date}:${bucket}`, 0] as [string, number])));
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const previous = units[index - 1];
    if (previous && (Date.parse(previous.finished_at_utc) < Date.parse(unit.finished_at_utc) || (previous.finished_at_utc === unit.finished_at_utc && previous.unit_id > unit.unit_id))) return false;
    const week = weeks.find(candidate => candidate.local_start_date === unit.week_start_date);
    if (!week || Date.parse(unit.finished_at_utc) < Date.parse(week.start_utc) || Date.parse(unit.finished_at_utc) >= Date.parse(week.end_utc)) return false;
    const bucket = unit.outcome === 'unrecoverable' ? 2 : unit.replaced ? 1 : 0;
    const key = `${unit.week_start_date}:${bucket}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (weeks.some(week => week.passed_no_replacement !== counts.get(`${week.local_start_date}:0`) || week.passed_after_replacement !== counts.get(`${week.local_start_date}:1`) || week.unrecoverable !== counts.get(`${week.local_start_date}:2`))) return false;
  if (!isRecord(value.excluded) || !exactKeys(value.excluded, UNIT_OUTCOMES_EXCLUDED_KEYS)) return false;
  const excluded = value.excluded;
  if (!UNIT_OUTCOMES_EXCLUDED_KEYS.every(key => nonnegativeInteger(excluded[key]))) return false;
  return true;
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadUnitOutcomesWeekly(
  purposes: readonly Purpose[],
  signal: AbortSignal,
  filters: ReportFilters = NO_FILTERS,
): Promise<UnitOutcomesWeeklyResult> {
  if (purposes.length < 1 || purposes.length > RUN_PURPOSES.length || new Set(purposes).size !== purposes.length || purposes.some(purpose => !RUN_PURPOSES.includes(purpose))) throw new RunActivityClientError('invalid_response');
  const query = new URLSearchParams();
  purposes.forEach(purpose => query.append('purpose', purpose));
  appendReportFilters(query, filters);
  const response = await fetch(`/api/v1/reporting/unit-outcomes-weekly?${query}`, { signal, headers: { Accept: 'application/json' } });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body) && exactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && exactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isUnitOutcomesWeeklyConnectedResponse(body) || !filterEchoMatches(body.filters, purposes, filters)) throw new RunActivityClientError('invalid_response');
  return body;
}

// Four whole-number grid intervals: step 1, 2, 5, 10, 20, 50, ...
function niceMaximum(total: number): number {
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const multiplier of [1, 2, 5]) {
      const step = multiplier * magnitude;
      if (step * 4 >= total) return step * 4;
    }
  }
}

export function unitOutcomeGeometry(weeks: readonly UnitOutcomeWeek[]): UnitOutcomeGeometry {
  const X0 = 44, X1 = 664, Y1 = 200, H = 170, width = 44, gap = 1;
  const maximum = niceMaximum(Math.max(0, ...weeks.map(week => week.passed_no_replacement + week.passed_after_replacement + week.unrecoverable)));
  const step = (X1 - X0) / weeks.length;
  const height = (value: number) => value === 0 ? 0 : Math.max(2, H * value / maximum);
  const bars = weeks.map((week, index): UnitOutcomeBar => {
    const values = [week.passed_no_replacement, week.passed_after_replacement, week.unrecoverable];
    const heights = values.map(height);
    let top = Y1;
    const positions = heights.map(segmentHeight => {
      if (segmentHeight === 0) return top;
      const position = top - segmentHeight;
      top = position - gap;
      return position;
    });
    const x = X0 + index * step + (step - width) / 2;
    const date = new Date(`${week.local_start_date}T12:00:00Z`);
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + (index === weeks.length - 1 ? ' *' : '');
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      x: x.toFixed(1), cx: (x + width / 2).toFixed(1),
      y1: positions[0].toFixed(1), h1: heights[0].toFixed(1),
      y2: positions[1].toFixed(1), h2: heights[1].toFixed(1),
      y3: positions[2].toFixed(1), h3: heights[2].toFixed(1),
      ty: (top - 7).toFixed(1), total: total === 0 ? '' : String(total), label,
      unrec: `${week.unrecoverable} unrec.`,
    };
  });
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = maximum * index / 4;
    const y = Y1 - H * index / 4;
    return { y: y.toFixed(1), ty: (y + 4).toFixed(1), label: String(value) };
  });
  return { maximum, bars, grid };
}
