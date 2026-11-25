import type { Purpose } from '../../types';
import { CHANNEL_ACTIVITY_PERIODS, type ChannelActivityPeriodKey } from './channelActivity';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';
import { appendReportFilters, filterEchoMatches, isReportFilterEcho, NO_FILTERS, type ReportFilterEcho, type ReportFilters } from './reportFilters';

export interface RecommendationUsageCounts {
  total: number;
  required: number;
  optional: number;
  other: number;
}

export interface RecommendationUsageAverage {
  value: string | null;
  n: number;
}

export interface RecommendationUsageConnectedResponse {
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
  filters: ReportFilterEcho;
  analyses: { cohort: number; with_recommendations: number; on_invalid_runs: number };
  recommendations: RecommendationUsageCounts;
  linked: RecommendationUsageCounts;
  linked_share: string | null;
  avg_improvement_linked_db: RecommendationUsageAverage;
  avg_improvement_all_db: RecommendationUsageAverage;
  unlinked_events: number;
  unlinked_unattributed: number;
  linked_events_in_period: number;
}

export type RecommendationUsageResult =
  | { data_source: 'not_connected' }
  | RecommendationUsageConnectedResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

const nonnegativeInteger = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const fourPlaceDecimal = (value: unknown): value is string => typeof value === 'string' && /^-?\d+\.\d{4}$/.test(value) && Number.isFinite(Number(value));
const utcTimestamp = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));

function isCounts(value: unknown): value is RecommendationUsageCounts {
  return isRecord(value)
    && exactKeys(value, ['total', 'required', 'optional', 'other'])
    && ['total', 'required', 'optional', 'other'].every(key => nonnegativeInteger(value[key]))
    && value.total === (value.required as number) + (value.optional as number) + (value.other as number);
}

function isAverage(value: unknown): value is RecommendationUsageAverage {
  return isRecord(value)
    && exactKeys(value, ['value', 'n'])
    && nonnegativeInteger(value.n)
    && ((value.n === 0 && value.value === null) || ((value.n as number) > 0 && fourPlaceDecimal(value.value)));
}

export function isRecommendationUsageConnectedResponse(value: unknown): value is RecommendationUsageConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, [
    'data_source', 'tls', 'extracted_at_utc', 'timezone', 'period', 'filters', 'analyses',
    'recommendations', 'linked', 'linked_share', 'avg_improvement_linked_db',
    'avg_improvement_all_db', 'unlinked_events', 'unlinked_unattributed', 'linked_events_in_period',
  ])) return false;
  if (value.data_source !== 'test_database' || !['verified', 'encrypted_unverified'].includes(value.tls as string) || !utcTimestamp(value.extracted_at_utc) || value.timezone !== 'America/Los_Angeles') return false;
  if (!isRecord(value.period) || !exactKeys(value.period, ['key', 'start_utc', 'end_utc', 'partial']) || typeof value.period.key !== 'string' || !CHANNEL_ACTIVITY_PERIODS.includes(value.period.key as ChannelActivityPeriodKey) || !utcTimestamp(value.period.start_utc) || !utcTimestamp(value.period.end_utc) || typeof value.period.partial !== 'boolean' || Date.parse(value.period.start_utc) > Date.parse(value.period.end_utc)) return false;
  if (!isReportFilterEcho(value.filters)) return false;
  if (!isRecord(value.analyses)) return false;
  const analyses = value.analyses;
  if (!exactKeys(analyses, ['cohort', 'with_recommendations', 'on_invalid_runs']) || !['cohort', 'with_recommendations', 'on_invalid_runs'].every(key => nonnegativeInteger(analyses[key])) || (analyses.with_recommendations as number) > (analyses.cohort as number)) return false;
  if (!isCounts(value.recommendations) || !isCounts(value.linked) || value.linked.total > value.recommendations.total) return false;
  if (value.linked_share === null ? value.recommendations.total !== 0 : !fourPlaceDecimal(value.linked_share) || Number(value.linked_share) < 0 || Number(value.linked_share) > 1) return false;
  if (!isAverage(value.avg_improvement_linked_db) || !isAverage(value.avg_improvement_all_db) || value.avg_improvement_linked_db.n !== value.linked.total || value.avg_improvement_all_db.n !== value.recommendations.total) return false;
  return nonnegativeInteger(value.unlinked_events) && nonnegativeInteger(value.unlinked_unattributed) && nonnegativeInteger(value.linked_events_in_period);
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadRecommendationUsage(
  period: ChannelActivityPeriodKey,
  purposes: readonly Purpose[],
  signal: AbortSignal,
  filters: ReportFilters = NO_FILTERS,
): Promise<RecommendationUsageResult> {
  if (!CHANNEL_ACTIVITY_PERIODS.includes(period) || purposes.length < 1 || purposes.length > RUN_PURPOSES.length || new Set(purposes).size !== purposes.length || purposes.some(purpose => !RUN_PURPOSES.includes(purpose))) {
    throw new RunActivityClientError('invalid_response');
  }
  const query = new URLSearchParams({ period });
  purposes.forEach(purpose => query.append('purpose', purpose));
  appendReportFilters(query, filters);
  const response = await fetch(`/api/v1/reporting/recommendation-usage?${query}`, { signal, headers: { Accept: 'application/json' } });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body) && exactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && exactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isRecommendationUsageConnectedResponse(body) || body.period.key !== period || !filterEchoMatches(body.filters, purposes, filters)) throw new RunActivityClientError('invalid_response');
  return body;
}
