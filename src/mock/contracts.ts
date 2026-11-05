import type { ChannelCount, MeasurementMode, Model, Purpose, QualityOutcome, RecentRun, RecoveryReason, Station } from '../types';

// These contracts describe synthetic presentation fixtures, not production business rules.
export interface Tone { bg: string; fg: string }
export interface Sparkline { line: string; area: string }
export interface YGrid { y: string; ty: string; label: string }
export interface BarMark { x: string; cx: string; y: string; h: string; vy: string; count: string; label: string; fill: string }
export interface Kpi { label: string; value: string; sub: string }
export type SummaryFixture = [channels: number, failedChannels: number, firstPassUnits: number, recoveredUnits: number, noRecoveryUnits: number];
export type ConfigurationFixture = [model: Model, mode: MeasurementMode, channels: ChannelCount, units: number, meanSeconds: number, medianSeconds: number, p90Seconds: number, deltaSeconds: number, trend: number[]];
export type RecentFixture = [serial: string, configuration: string, station: Station, finished: string, duration: string, failures: number, replacements: number, worstIlDb: number, outcome: QualityOutcome, purpose: Purpose];
export interface SummaryView {
  label: string; prev: string; timeOff: number; outCaption: string; outAria: string;
  channels: string; chD: string; units: string; unitsD: string;
  fpy: string; fpyD: string; fail: string; failD: string; unrec: string; unrecD: string;
  out: [number, number, number]; perUnit: string;
}
export interface PurposeOption {
  value: Purpose; label: string; count: string; pressed: boolean;
  boxBorder: string; boxBg: string; checkOp: number; style: string;
}
export interface ConfigurationRow {
  model: Model; mode: MeasurementMode; ch: ChannelCount; units: string;
  avg: string; med: string; p90: string; perCh: string; spark: string; sparkColor: string;
  delta: string; dColor: string; mark: string; pressed: boolean;
}
export interface OverviewKpi extends Kpi, Sparkline { delta: string; dBg: string; dFg: string; valueColor: string }
export interface SelectedConfiguration { title: string; units: number; avg: string; med: string; p90: string; aria: string }
export interface ThroughputBar { x: string; cx: string; y: string; h: string; vy: string; value: string; wd: string; day: string; fill: string }
export interface StationView { name: string; units: string; spc: string; fail: string; w: string; barColor: string; fColor: string; retest: string }
export interface HeatCell { n: string; count: string; bg: string; fg: string; ring: string; title: string }
export interface OverviewValues {
  accent: string; d: SummaryView;
  purposes: PurposeOption[];
  scope: Tone & { show: boolean; heading: string; title: string; text: string };
  kpis: OverviewKpi[]; cfgRows: ConfigurationRow[]; sel: SelectedConfiguration;
  hist: (BarMark & { w: string; lx: string })[]; meanX: string; meanLX: string;
  outSegs: { pct: string; color: string }[];
  outLegend: { label: string; count: string; share: string; color: string }[];
  linePath: string; areaPath: string; lineGrid: YGrid[];
  dots: { x: string; y: string; r: number; label: string }[];
  avgY: string; lastX: string; lastY: string;
  bars: ThroughputBar[]; barGrid: YGrid[]; stations: StationView[]; cells: HeatCell[];
  legendCells: { bg: string }[]; runs: RecentRun[];
}
export interface FailureDistribution { units: number; extras: number; c: number[] }
export type FailureUnitFixture = [serial: string, configuration: string, station: Station, finished: string, channels: string[], extras: number, after: string, reason: RecoveryReason];
export interface WeeklyOutcome {
  x: string; cx: string; y1: string; h1: string; y2: string; h2: string; y3: string; h3: string;
  ty: string; total: string; label: string; unrec: string;
}
export interface FailureUnit extends Tone { unit: string; cfg: string; st: Station; when: string; chs: string[]; extras: string; after: string; afterColor: string; reason: string }
export interface FailuresValues {
  accent: string;
  kpis: (Kpi & { pct: number; bar: string; color: string })[];
  weeks: WeeklyOutcome[]; wGrid: YGrid[];
  reasons: { title: string; count: string; share: string; w: string; text: string; code: string; color: string }[];
  fbars: BarMark[];
  fp: { extras: number; zoneX: string; zoneW: string; zoneLX: string; caption: string; aria: string };
  topCh: { n: string; count: string; w: string }[];
  topPort: { n: string; count: string; w: string; tag: string; tagFg: string; bar: string }[];
  units: FailureUnit[];
}
export type WavelengthReadings = [nm1310: number, nm1550: number];
export type AttemptResult = 'fail' | 'pass' | 'replaced';
export type AttemptFixture = [channel: number, attempt: number, port: string, nm1310: number, nm1550: number, result: AttemptResult, opacity: number];
export interface UnitBar {
  x1: string; y1: string; h1: string; op1: number; x2: string; y2: string; h2: string; op2: number;
  cx: string; ly: number; label: string; lc: string; lw: number;
}
export interface ChannelCell { n: string; v: string; port: string; bg: string; fg: string; border: string; title: string }
export interface MeasurementAttempt extends Tone { ch: string; att: string; port: string; w1: string; w2: string; c1: string; c2: string; res: string; op: number }
export interface UnitValues {
  accent: string; ilBars: UnitBar[]; ilGrid: YGrid[]; chartDescription: string;
  warnY: string; failY: string; bandY: number; failH: string;
  cells: ChannelCell[];
  steps: { time: string; title: string; text: string; color: string }[];
  extras: (Tone & { port: string; a: string; b: string; c1: string; c2: string; status: string })[];
  repl: { t: string; ch: string; move: string; src: string; gain: string }[];
  attempts: MeasurementAttempt[];
}
export type SchemaFixture = [kind: 'T' | 'V', name: string, columns: [name: string, type: string][]];
export interface QueryResult { model: Model; mode: MeasurementMode; ch: string; units: string; sec: string; avgSeconds: number; time: string; spc: string; w: string }
export interface SchemaView { kind: string; kindBg: string; kindFg: string; name: string; open: boolean; rot: string; cols: { n: string; t: string }[] }
export interface QueriesValues {
  accent: string;
  builtin: { title: string; pressed: boolean; style: string }[];
  team: { title: string; by: string }[];
  tables: SchemaView[]; isTable: boolean; isChart: boolean; rows: QueryResult[]; stats: Kpi[];
  history: (Tone & { t: string; title: string; meta: string; state: string })[];
}
