import type { ScreenId } from '../types';

export const NAV_ITEMS: readonly { id: ScreenId; path: string; label: string }[] = [
  { id: 'overview', path: '/', label: 'Overview' },
  { id: 'failures', path: '/failures', label: 'Failures & replacements' },
  { id: 'unit', path: '/unit', label: 'Unit lookup' },
  { id: 'queries', path: '/queries', label: 'Query console' },
];

export function unitLink(serial: string): string { return `#/unit?serial=${encodeURIComponent(serial)}`; }
export function serialFromHash(): string {
  return new URLSearchParams(location.hash.split('?')[1] || '').get('serial') ?? 'DEMO-18793';
}
