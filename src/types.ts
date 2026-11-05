export type Purpose = 'production' | 'engineering' | 'training' | 'calibration';
export interface OverviewState {
  range: string;
  cfg: number;
  purp: Record<Purpose, boolean>;
}
export interface FailuresState { ch: number }
export interface UnitState { wl: string }
export interface QueriesState { view: string; open: string }
export interface RecentRun {
  unit: string; cfg: string; st: string; when: string; dur: string;
  failed: string; repl: string; il: string; ilColor: string;
  result: string; bg: string; fg: string;
  tagOn: boolean; tag: string; tagTitle: string;
}
