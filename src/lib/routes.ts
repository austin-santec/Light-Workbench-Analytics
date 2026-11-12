import type { ScreenId } from '../types';

export const NAV_ITEMS: readonly { id: ScreenId; path: string; label: string }[] = [
  { id: 'overview', path: '/', label: 'Overview' },
  { id: 'failures', path: '/failures', label: 'Failures & replacements' },
  { id: 'unit', path: '/unit', label: 'Unit lookup' },
  { id: 'queries', path: '/queries', label: 'Query console' },
];

export function unitLink(serial: string): string { return `#/unit?serial=${encodeURIComponent(serial)}`; }
export function liveUnitLink(unitId: number, runId?: number | null): string {
  const query = new URLSearchParams({ unit: String(unitId) });
  if (runId !== undefined && runId !== null) query.set('run', String(runId));
  return `#/unit?${query}`;
}

export interface UnitHashRoute {
  serial: string | null;
  unitId: number | null;
  runId: number | null;
  malformed: boolean;
}

function positiveId(params: URLSearchParams, key: string): { value: number | null; malformed: boolean } {
  const raw = params.get(key);
  if (raw === null) return { value: null, malformed: false };
  if (!/^[1-9]\d*$/.test(raw)) return { value: null, malformed: true };
  const value = Number(raw);
  return Number.isSafeInteger(value) ? { value, malformed: false } : { value: null, malformed: true };
}

export function unitRouteFromHash(hash = location.hash): UnitHashRoute {
  const params = new URLSearchParams(hash.split('?')[1] || '');
  const unit = positiveId(params, 'unit');
  const run = positiveId(params, 'run');
  return {
    serial: params.get('serial'),
    unitId: unit.value,
    runId: run.value,
    malformed: unit.malformed || run.malformed || (run.value !== null && unit.value === null),
  };
}

export function serialFromHash(): string {
  return unitRouteFromHash().serial ?? 'DEMO-18793';
}
