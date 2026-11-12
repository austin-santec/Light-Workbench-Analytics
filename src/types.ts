export type Purpose = 'production' | 'engineering' | 'training' | 'calibration';
export type ScreenId = 'overview' | 'failures' | 'unit' | 'queries';
export type TimeRange = 'today' | 'yesterday' | 'week' | 'month';
export type ChannelCount = 24 | 36 | 48;
export type Wavelength = 'both' | '1310' | '1550';
export type LiveWavelength = 'both' | 'first' | 'second';
export type QueryView = 'table' | 'chart';
export type Model = 'OSX-150' | 'OSX-100';
export type MeasurementMode = 'SM' | 'MM';
export type Station = 'St 1' | 'St 2' | 'St 3' | 'St 4';
export type QualityOutcome = 'pass' | 'repl' | 'bad';
export type RecoveryReason = 'viable' | 'extras' | 'review';
export interface Choice<T extends string | number> { value: T; label: string }
export interface OverviewState {
  range: TimeRange;
  cfg: number;
  purp: Record<Purpose, boolean>;
}
export interface FailuresState { ch: ChannelCount }
export interface UnitState { wl: Wavelength }
export interface QueriesState { view: QueryView; open: string }
export interface ActivityFilters { search: string; model: Model | 'all'; station: Station | 'all' }
export interface RecentRun {
  unit: string; cfg: string; st: string; when: string; dur: string;
  failed: string; repl: string; il: string; ilColor: string;
  result: string; bg: string; fg: string;
  tagOn: boolean; tag: string; tagTitle: string;
  durationSeconds: number; ilDb: number; model: Model; station: Station;
}
