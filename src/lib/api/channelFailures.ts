import type { Purpose } from '../../types';
import { CHANNEL_ACTIVITY_PERIODS, type ChannelActivityPeriodKey } from './channelActivity';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';

export interface ChannelFailureCounts {
  failed: number;
  observed: number;
  rate: number | null;
  unknown_criteria: number;
}

export interface ChannelFailure extends ChannelFailureCounts {
  logical_channel: number;
}

export interface ChannelFailuresConnectedResponse {
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
  filters: { purpose: Purpose[]; wavelength_mode: 'SM' | 'MM' | null; switch_model: string | null };
  classification_rule: 'strict >, run limit snapshot';
  totals: ChannelFailureCounts;
  runs: number;
  max_channel: number | null;
  channels: ChannelFailure[];
  incomplete: boolean;
}

export type ChannelFailuresResult = { data_source: 'not_connected' } | ChannelFailuresConnectedResponse;

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

const COUNT_KEYS = ['failed', 'observed', 'rate', 'unknown_criteria'] as const;

function isCounts(value: Record<string, unknown>): boolean {
  if (!nonnegativeInteger(value.failed) || !nonnegativeInteger(value.observed) || !nonnegativeInteger(value.unknown_criteria) || value.failed > value.observed) return false;
  if (value.observed === 0) return value.failed === 0 && value.rate === null;
  return typeof value.rate === 'number' && Number.isFinite(value.rate) && value.rate >= 0 && value.rate <= 1
    && Math.abs(value.rate - value.failed / value.observed) < 1e-12;
}

function isChannel(value: unknown): value is ChannelFailure {
  return isRecord(value) && exactKeys(value, ['logical_channel', ...COUNT_KEYS]) && positiveInteger(value.logical_channel) && isCounts(value)
    && ((value.observed as number) + (value.unknown_criteria as number)) > 0;
}

export function isChannelFailuresConnectedResponse(value: unknown): value is ChannelFailuresConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, [
    'data_source', 'tls', 'extracted_at_utc', 'timezone', 'period', 'filters', 'classification_rule',
    'totals', 'runs', 'max_channel', 'channels', 'incomplete',
  ])) return false;
  if (value.data_source !== 'test_database' || !['verified', 'encrypted_unverified'].includes(value.tls as string) || !utcTimestamp(value.extracted_at_utc) || value.timezone !== 'America/Los_Angeles' || value.classification_rule !== 'strict >, run limit snapshot') return false;
  const period = value.period;
  if (!isRecord(period) || !exactKeys(period, ['key', 'start_utc', 'end_utc', 'partial']) || !CHANNEL_ACTIVITY_PERIODS.includes(period.key as ChannelActivityPeriodKey) || !utcTimestamp(period.start_utc) || !utcTimestamp(period.end_utc) || typeof period.partial !== 'boolean' || Date.parse(period.start_utc) > Date.parse(period.end_utc)) return false;
  const filters = value.filters;
  if (!isRecord(filters) || !exactKeys(filters, ['purpose', 'wavelength_mode', 'switch_model']) || !Array.isArray(filters.purpose) || filters.purpose.length < 1 || filters.purpose.length > RUN_PURPOSES.length || new Set(filters.purpose).size !== filters.purpose.length || !filters.purpose.every(purpose => RUN_PURPOSES.includes(purpose as Purpose))) return false;
  if (!(filters.wavelength_mode === null || filters.wavelength_mode === 'SM' || filters.wavelength_mode === 'MM') || !(filters.switch_model === null || typeof filters.switch_model === 'string')) return false;
  if (!isRecord(value.totals) || !exactKeys(value.totals, COUNT_KEYS) || !isCounts(value.totals)) return false;
  if (!nonnegativeInteger(value.runs) || typeof value.incomplete !== 'boolean') return false;
  if (!Array.isArray(value.channels) || !value.channels.every(isChannel)) return false;
  const channels = value.channels;
  if (channels.some((channel, index) => index > 0 && channel.logical_channel <= channels[index - 1].logical_channel)) return false;
  if (channels.length === 0 ? value.max_channel !== null || value.runs !== 0 : !positiveInteger(value.max_channel) || channels[channels.length - 1].logical_channel > value.max_channel || value.runs < 1) return false;
  const totals = value.totals as unknown as ChannelFailureCounts;
  const sum = (key: 'failed' | 'observed' | 'unknown_criteria') => channels.reduce((total, channel) => total + channel[key], 0);
  return totals.failed === sum('failed') && totals.observed === sum('observed') && totals.unknown_criteria === sum('unknown_criteria');
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadChannelFailures(
  period: ChannelActivityPeriodKey,
  purposes: readonly Purpose[],
  signal: AbortSignal,
): Promise<ChannelFailuresResult> {
  if (!CHANNEL_ACTIVITY_PERIODS.includes(period) || purposes.length < 1 || purposes.length > RUN_PURPOSES.length || new Set(purposes).size !== purposes.length || purposes.some(purpose => !RUN_PURPOSES.includes(purpose))) {
    throw new RunActivityClientError('invalid_response');
  }
  const query = new URLSearchParams({ period });
  purposes.forEach(purpose => query.append('purpose', purpose));
  const response = await fetch(`/api/v1/reporting/channel-failures?${query}`, { signal, headers: { Accept: 'application/json' } });
  const body = await readJson(response);
  if (response.status === 503) {
    const code = isRecord(body) && exactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new RunActivityClientError('invalid_response');
    throw new RunActivityClientError('database', code);
  }
  if (!response.ok) throw new RunActivityClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  if (isRecord(body) && exactKeys(body, ['data_source']) && body.data_source === 'not_connected') return { data_source: 'not_connected' };
  if (!isChannelFailuresConnectedResponse(body) || body.period.key !== period || body.filters.wavelength_mode !== null || body.filters.switch_model !== null
    || body.filters.purpose.length !== purposes.length || body.filters.purpose.some((purpose, index) => purpose !== purposes[index])) throw new RunActivityClientError('invalid_response');
  return body;
}

export interface ChannelHeatCell {
  channel: number;
  failed: number | null;
  level: number | null;
  highlight: boolean;
  title: string;
}

/** Presentation for the 8-column heatmap: whole rows, rate-relative 5-step levels, top-3 highlight. */
export function channelHeatmap(data: ChannelFailuresConnectedResponse): { cells: ChannelHeatCell[]; standouts: number[] } {
  const byChannel = new Map(data.channels.map(channel => [channel.logical_channel, channel]));
  const span = Math.ceil(Math.max(data.max_channel ?? 0, 8) / 8) * 8;
  const maxRate = data.channels.reduce((max, channel) => Math.max(max, channel.rate ?? 0), 0);
  const standouts = data.channels
    .filter(channel => channel.failed > 0 && channel.rate !== null)
    .sort((a, b) => (b.rate as number) - (a.rate as number) || b.failed - a.failed || a.logical_channel - b.logical_channel)
    .slice(0, 3)
    .map(channel => channel.logical_channel);
  const cells: ChannelHeatCell[] = [];
  for (let channel = 1; channel <= span; channel++) {
    const counts = byChannel.get(channel);
    if (!counts || counts.observed === 0) {
      cells.push({ channel, failed: null, level: null, highlight: false, title: counts ? `Logical channel ${channel}: ${counts.unknown_criteria} observations with unknown limits` : `Logical channel ${channel}: no observations` });
      continue;
    }
    const rate = counts.rate ?? 0;
    const level = counts.failed === 0 || maxRate === 0 ? 0 : Math.max(1, Math.min(4, Math.ceil(rate / maxRate * 4)));
    cells.push({
      channel,
      failed: counts.failed,
      level,
      highlight: standouts.includes(channel),
      title: `Logical channel ${channel}: ${counts.failed} of ${counts.observed} first observations failed (${(rate * 100).toFixed(1)}%)`,
    });
  }
  return { cells, standouts };
}
