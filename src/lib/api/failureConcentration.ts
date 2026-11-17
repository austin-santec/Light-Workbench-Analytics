import type { Purpose } from '../../types';
import { CHANNEL_ACTIVITY_PERIODS, type ChannelActivityPeriodKey } from './channelActivity';
import { RUN_PURPOSES, RunActivityClientError } from './runActivity';

export interface FailureConcentrationCounts {
  failed: number;
  observed: number;
  rate: number | null;
  unknown_criteria: number;
}

export interface FailureConcentrationChannel extends FailureConcentrationCounts {
  logical_channel: number;
}

export interface FailureConcentrationPort extends FailureConcentrationCounts {
  physical_port: number;
  extra: boolean;
}

export interface FailureConcentrationConnectedResponse {
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
  totals: FailureConcentrationCounts;
  runs: number;
  channels: FailureConcentrationChannel[];
  ports: FailureConcentrationPort[];
  incomplete: boolean;
}

export type FailureConcentrationResult =
  | { data_source: 'not_connected' }
  | FailureConcentrationConnectedResponse;

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
  if (!nonnegativeInteger(value.failed) || !nonnegativeInteger(value.observed)
    || !nonnegativeInteger(value.unknown_criteria) || value.failed > value.observed) return false;
  if (value.observed === 0) return value.failed === 0 && value.rate === null;
  return typeof value.rate === 'number' && Number.isFinite(value.rate)
    && value.rate >= 0 && value.rate <= 1
    && Math.abs(value.rate - value.failed / value.observed) < 1e-12;
}

function isChannel(value: unknown): value is FailureConcentrationChannel {
  return isRecord(value) && exactKeys(value, ['logical_channel', ...COUNT_KEYS])
    && positiveInteger(value.logical_channel) && isCounts(value)
    && ((value.observed as number) + (value.unknown_criteria as number)) > 0;
}

function isPort(value: unknown): value is FailureConcentrationPort {
  return isRecord(value) && exactKeys(value, ['physical_port', 'extra', ...COUNT_KEYS])
    && positiveInteger(value.physical_port) && typeof value.extra === 'boolean' && isCounts(value)
    && ((value.observed as number) + (value.unknown_criteria as number)) > 0;
}

function validPurposes(value: unknown): value is Purpose[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= RUN_PURPOSES.length
    && new Set(value).size === value.length
    && value.every(purpose => RUN_PURPOSES.includes(purpose as Purpose));
}

export function isFailureConcentrationConnectedResponse(
  value: unknown,
): value is FailureConcentrationConnectedResponse {
  if (!isRecord(value) || !exactKeys(value, [
    'data_source', 'tls', 'extracted_at_utc', 'timezone', 'period', 'filters',
    'classification_rule', 'totals', 'runs', 'channels', 'ports', 'incomplete',
  ])) return false;
  if (value.data_source !== 'test_database'
    || !['verified', 'encrypted_unverified'].includes(value.tls as string)
    || !utcTimestamp(value.extracted_at_utc)
    || value.timezone !== 'America/Los_Angeles'
    || value.classification_rule !== 'strict >, run limit snapshot') return false;
  const period = value.period;
  if (!isRecord(period) || !exactKeys(period, ['key', 'start_utc', 'end_utc', 'partial'])
    || !CHANNEL_ACTIVITY_PERIODS.includes(period.key as ChannelActivityPeriodKey)
    || !utcTimestamp(period.start_utc) || !utcTimestamp(period.end_utc)
    || typeof period.partial !== 'boolean'
    || Date.parse(period.start_utc) > Date.parse(period.end_utc)) return false;
  const filters = value.filters;
  if (!isRecord(filters) || !exactKeys(filters, ['purpose']) || !validPurposes(filters.purpose)) return false;
  if (!isRecord(value.totals) || !exactKeys(value.totals, COUNT_KEYS) || !isCounts(value.totals)) return false;
  if (!nonnegativeInteger(value.runs) || typeof value.incomplete !== 'boolean') return false;
  if (!Array.isArray(value.channels) || !value.channels.every(isChannel)
    || !Array.isArray(value.ports) || !value.ports.every(isPort)) return false;
  const channels = value.channels;
  const ports = value.ports;
  if (channels.some((channel, index) => index > 0
    && channel.logical_channel <= channels[index - 1].logical_channel)) return false;
  if (ports.some((port, index) => index > 0 && (
    port.physical_port < ports[index - 1].physical_port
    || (port.physical_port === ports[index - 1].physical_port
      && (ports[index - 1].extra || port.extra === ports[index - 1].extra))
  ))) return false;
  if ((channels.length === 0 || ports.length === 0) !== (value.runs === 0)) return false;
  const totals = value.totals as unknown as FailureConcentrationCounts;
  const sumsMatch = (items: FailureConcentrationCounts[]) => (
    totals.failed === items.reduce((sum, item) => sum + item.failed, 0)
    && totals.observed === items.reduce((sum, item) => sum + item.observed, 0)
    && totals.unknown_criteria === items.reduce((sum, item) => sum + item.unknown_criteria, 0)
  );
  return sumsMatch(channels) && sumsMatch(ports);
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new RunActivityClientError('invalid_response'); }
}

export async function loadFailureConcentration(
  period: ChannelActivityPeriodKey,
  purposes: readonly Purpose[],
  signal: AbortSignal,
): Promise<FailureConcentrationResult> {
  if (!CHANNEL_ACTIVITY_PERIODS.includes(period) || !validPurposes([...purposes])) {
    throw new RunActivityClientError('invalid_response');
  }
  const query = new URLSearchParams({ period });
  purposes.forEach(purpose => query.append('purpose', purpose));
  const response = await fetch(`/api/v1/reporting/failure-concentration?${query}`, {
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
  if (!isFailureConcentrationConnectedResponse(body) || body.period.key !== period
    || body.filters.purpose.length !== purposes.length
    || body.filters.purpose.some((purpose, index) => purpose !== purposes[index])) {
    throw new RunActivityClientError('invalid_response');
  }
  return body;
}

function descendingCounts(
  left: FailureConcentrationCounts,
  right: FailureConcentrationCounts,
): number {
  return right.failed - left.failed || (right.rate ?? -1) - (left.rate ?? -1);
}

export function topConcentration(data: FailureConcentrationConnectedResponse, n = 5): {
  channels: FailureConcentrationChannel[];
  ports: FailureConcentrationPort[];
} {
  const limit = Math.max(0, Math.floor(n));
  return {
    channels: data.channels
      .filter(item => item.failed > 0)
      .sort((left, right) => descendingCounts(left, right)
        || left.logical_channel - right.logical_channel)
      .slice(0, limit),
    ports: data.ports
      .filter(item => item.failed > 0)
      .sort((left, right) => descendingCounts(left, right)
        || left.physical_port - right.physical_port
        || Number(left.extra) - Number(right.extra))
      .slice(0, limit),
  };
}
