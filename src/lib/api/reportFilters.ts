import type { Purpose } from '../../types';
import { RUN_PURPOSES } from './runActivity';

// Shared optional report filters (exact equality, ANDed) and their echo, per docs/API_CONTRACTS.md.
export interface ReportFilters {
  switch_model: string | null;
  wavelength_mode: 'SM' | 'MM' | null;
  channel_count: number | null;
  station: number | null;
}

export type ReportFilterEcho = { purpose: Purpose[] } & ReportFilters;

export const NO_FILTERS: ReportFilters = { switch_model: null, wavelength_mode: null, channel_count: null, station: null };

const FILTER_KEYS = ['switch_model', 'wavelength_mode', 'channel_count', 'station'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validReportFilters(value: ReportFilters): boolean {
  return (value.switch_model === null || (value.switch_model.length >= 1 && value.switch_model.length <= 30))
    && (value.wavelength_mode === null || value.wavelength_mode === 'SM' || value.wavelength_mode === 'MM')
    && (value.channel_count === null || (Number.isInteger(value.channel_count) && value.channel_count >= 1 && value.channel_count <= 200))
    && (value.station === null || (Number.isInteger(value.station) && value.station >= 1));
}

export function appendReportFilters(query: URLSearchParams, filters: ReportFilters): void {
  if (filters.switch_model !== null) query.set('switch_model', filters.switch_model);
  if (filters.wavelength_mode !== null) query.set('wavelength_mode', filters.wavelength_mode);
  if (filters.channel_count !== null) query.set('channel_count', String(filters.channel_count));
  if (filters.station !== null) query.set('station', String(filters.station));
}

export function isReportFilterEcho(value: unknown): value is ReportFilterEcho {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = ['purpose', ...FILTER_KEYS].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return false;
  const purpose = value.purpose;
  if (!Array.isArray(purpose) || purpose.length < 1 || purpose.length > RUN_PURPOSES.length
    || new Set(purpose).size !== purpose.length
    || !purpose.every(item => typeof item === 'string' && RUN_PURPOSES.includes(item as Purpose))) return false;
  if (!(value.switch_model === null || typeof value.switch_model === 'string')
    || !(value.wavelength_mode === null || typeof value.wavelength_mode === 'string')
    || !(value.channel_count === null || typeof value.channel_count === 'number')
    || !(value.station === null || typeof value.station === 'number')) return false;
  return validReportFilters(value as unknown as ReportFilters);
}

export function filterEchoMatches(echo: ReportFilterEcho, purposes: readonly Purpose[], filters: ReportFilters): boolean {
  return echo.purpose.length === purposes.length
    && echo.purpose.every((purpose, index) => purpose === purposes[index])
    && FILTER_KEYS.every(key => echo[key] === filters[key]);
}

export function filtersKey(filters: ReportFilters): string {
  return FILTER_KEYS.map(key => String(filters[key] ?? '')).join('|');
}
