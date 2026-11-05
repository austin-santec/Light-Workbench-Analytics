import type { ChannelCount, Choice, Purpose, QueryView, TimeRange, Wavelength } from '../types';
import type { Sparkline } from './contracts';

export const ACCENT = 'var(--accent)';
export const PURPOSES: readonly Purpose[] = ['production', 'engineering', 'training', 'calibration'];
export const TIME_RANGES: readonly Choice<TimeRange>[] = [
  { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' }, { value: 'month', label: 'Last 30 days' },
];
export const CHANNEL_OPTIONS: readonly Choice<ChannelCount>[] = [
  { value: 48, label: '48 ch' }, { value: 36, label: '36 ch' }, { value: 24, label: '24 ch' },
];
export const WAVELENGTH_OPTIONS: readonly Choice<Wavelength>[] = [
  { value: 'both', label: 'Both' }, { value: '1310', label: '1310 nm' }, { value: '1550', label: '1550 nm' },
];
export const RESULT_VIEWS: readonly Choice<QueryView>[] = [{ value: 'table', label: 'Table' }, { value: 'chart', label: 'Chart' }];
export const PRODUCTION_ONLY: Record<Purpose, boolean> = { production: true, engineering: false, training: false, calibration: false };

export function togglePurpose(current: Record<Purpose, boolean>, purpose: Purpose): Record<Purpose, boolean> {
  const next = { ...current, [purpose]: !current[purpose] };
  return PURPOSES.some(key => next[key]) ? next : current;
}
export function formatDuration(seconds: number): string {
  return Math.floor(seconds / 60) + 'm ' + String(Math.round(seconds % 60)).padStart(2, '0') + 's';
}
export function durationSeconds(label: string): number {
  const match = /^(\d+)m (\d+)s$/.exec(label);
  if (!match) throw new Error('Invalid synthetic duration fixture');
  return Number(match[1]) * 60 + Number(match[2]);
}
export function sparkline(values: readonly number[], width: number, height: number): Sparkline {
  if (values.length < 2) return { line: '', area: '' };
  const min = Math.min(...values), span = Math.max(...values) - min || 1;
  const points = values.map((v, i) => [(i * width / (values.length - 1)).toFixed(1), (height - 3 - (height - 6) * (v - min) / span).toFixed(1)]);
  return { line: points.map(p => p.join(',')).join(' '), area: 'M0,' + height + ' L' + points.map(p => p.join(',')).join(' L') + ' L' + width + ',' + height + ' Z' };
}
