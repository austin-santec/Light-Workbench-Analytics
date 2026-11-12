import type { Purpose } from '../../types';

export const COMPLETION_STATUSES = ['in_progress', 'complete', 'stopped', 'failed'] as const;
export const ANALYSIS_STATUSES = ['pending', 'included', 'excluded', 'superseded'] as const;
export const TIMING_QUALITIES = ['confirmed', 'checkpoint_estimate', 'partial', 'provisional', 'unavailable'] as const;
export const CLASSIFICATIONS = ['pass', 'warning', 'fail', 'too_good', 'unknown'] as const;
export const RUN_PURPOSES = ['production', 'engineering', 'training', 'calibration'] as const;

export type CompletionStatus = typeof COMPLETION_STATUSES[number];
export type AnalysisStatus = typeof ANALYSIS_STATUSES[number];
export type TimingQuality = typeof TIMING_QUALITIES[number];
export type Classification = typeof CLASSIFICATIONS[number];
export type TlsState = 'verified' | 'encrypted_unverified';

export interface UnitSearchItem {
  unit_id: number;
  main_board_serial: string;
  part_number: string | null;
  unit_model: string | null;
  current_switch_serial: string | null;
  current_switch_model: string | null;
  last_run_started_at_utc: string | null;
  run_count: number;
}

export interface UnitSearchConnectedResponse {
  data_source: 'test_database';
  tls: TlsState;
  items: UnitSearchItem[];
  has_more: boolean;
}

export interface UnitDetail {
  unit_id: number;
  main_board_serial: string;
  part_number: string | null;
  unit_model: string | null;
  front_panel_channel_count: number | null;
  created_at_utc: string;
  updated_at_utc: string;
}

export interface UnitAssignment {
  assignment_id: number;
  switch_serial: string;
  switch_model: string;
  firmware_version: string | null;
  installed_at_utc: string;
  installed_by: string;
  removed_at_utc: string | null;
  removed_by: string | null;
  removal_reason: string | null;
}

export interface RunLimits {
  model: string;
  wavelength_mode: 'SM' | 'MM';
  too_good_below_db: number;
  warning_enabled: boolean;
  warning_above_db: number | null;
  fail_above_db: number;
}

export interface UnitRun {
  run_id: number;
  assignment_id: number;
  run_number: number;
  run_started_at_utc: string;
  run_ended_at_utc: string | null;
  tested_by: string;
  station_number: number | null;
  wavelength_mode: 'SM' | 'MM';
  operating_band: string;
  front_panel_channel_count: number | null;
  part_number_snapshot: string | null;
  application_version: string;
  completion_status: CompletionStatus;
  run_purpose: Purpose;
  analysis_status: AnalysisStatus;
  superseded_by_run_id: number | null;
  void_info: { voided_at_utc: string; voided_by: string; reason: string } | null;
  limits: RunLimits | null;
  timing: {
    quality: TimingQuality;
    active_seconds: number | null;
    elapsed_seconds: number;
    stopped_seconds: number | null;
    session_count: number;
  };
  counts: {
    logical_channels_measured: number;
    failing_channels: number | null;
    warning_channels: number | null;
    extra_candidates_measured: number;
  };
}

export interface UnitDetailConnectedResponse {
  data_source: 'test_database';
  tls: TlsState;
  unit: UnitDetail;
  assignments: UnitAssignment[];
  assignments_incomplete: boolean;
  runs: UnitRun[];
  has_more: boolean;
}

export interface ChannelAttempt {
  measurement_id: number;
  logical_channel: number | null;
  physical_port: number;
  attempt_number: number;
  wavelength_1_nm: number;
  wavelength_1_il_db: number;
  wavelength_2_nm: number;
  wavelength_2_il_db: number;
  written_at_utc: string;
  written_by: string;
  is_current: boolean;
  classification: Classification | null;
  classification_rule: string | null;
}

export interface RunChannelsConnectedResponse {
  data_source: 'test_database';
  tls: TlsState;
  run_id: number;
  logical_channels: ChannelAttempt[];
  extra_candidates: ChannelAttempt[];
  incomplete: boolean;
}

export interface ChannelMapItem {
  logical_channel: number;
  initial_physical_port: number;
  effective_physical_port: number;
  is_replaced: boolean;
  latest_replaced_at_utc: string | null;
}

export interface ReplacementItem {
  replacement_id: number;
  logical_channel: number;
  previous_physical_port: number;
  replacement_physical_port: number;
  reason: string;
  replaced_by: string;
  replaced_at_utc: string;
  related_run_id: number | null;
  source_recommendation_id: number | null;
  notes: string | null;
}

export interface ConfirmedExtraPortItem {
  physical_port: number;
  wavelength_1_nm: number;
  wavelength_1_il_db: number;
  wavelength_2_nm: number;
  wavelength_2_il_db: number;
  attempt_number: number;
  run_id: number;
  written_at_utc: string;
  analysis_status: AnalysisStatus;
}

export interface SpareItem {
  spare_event_id: number;
  physical_port: number;
  action: 'designated' | 'undesignated';
  recorded_by: string;
  recorded_at_utc: string;
}

export interface AnalysisRecommendationItem {
  recommendation_id: number;
  recommendation_rank: number;
  category: 'required' | 'optional';
  logical_channel: number;
  current_physical_port: number;
  candidate_physical_port: number;
  current_wavelength_1_il_db: number;
  current_wavelength_2_il_db: number;
  candidate_wavelength_1_il_db: number;
  candidate_wavelength_2_il_db: number;
  current_worst_loss_db: number;
  candidate_worst_loss_db: number;
  improvement_db: number;
  used: boolean;
}

export interface ReplacementAnalysisItem {
  analysis_id: number;
  run_id: number;
  analyzed_at_utc: string;
  analyzed_by: string;
  result_status: string;
  recommendations: AnalysisRecommendationItem[];
}

export interface AssignmentHardwareConnectedResponse {
  data_source: 'test_database';
  tls: TlsState;
  assignment_id: number;
  channel_map: ChannelMapItem[];
  replacements: ReplacementItem[];
  extra_ports: ConfirmedExtraPortItem[];
  spares: SpareItem[];
  analyses: ReplacementAnalysisItem[];
  incomplete: boolean;
}

export type NotConnectedResponse = { data_source: 'not_connected' };
export type LookupResponse<T> = T | NotConnectedResponse | { data_source: 'not_found' };
export type UnitLookupClientErrorKind = 'database' | 'unreachable' | 'invalid_response' | 'request_failed';

export class UnitLookupClientError extends Error {
  constructor(public readonly kind: UnitLookupClientErrorKind, public readonly code?: string) {
    super(kind);
    this.name = 'UnitLookupClientError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isEnum<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isString(value: unknown): value is string { return typeof value === 'string'; }
function isNullableString(value: unknown): value is string | null { return value === null || isString(value); }
function isBoolean(value: unknown): value is boolean { return typeof value === 'boolean'; }
function isPositiveInteger(value: unknown): value is number { return Number.isInteger(value) && (value as number) > 0; }
function isNonnegativeInteger(value: unknown): value is number { return Number.isInteger(value) && (value as number) >= 0; }
function isFiniteNumber(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function isNonnegativeNumber(value: unknown): value is number { return isFiniteNumber(value) && value >= 0; }
function isNullablePositiveInteger(value: unknown): value is number | null { return value === null || isPositiveInteger(value); }
function isNullableNonnegativeNumber(value: unknown): value is number | null { return value === null || isNonnegativeNumber(value); }
function isNullableFiniteNumber(value: unknown): value is number | null { return value === null || isFiniteNumber(value); }
function isUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value));
}
function isNullableUtcTimestamp(value: unknown): value is string | null { return value === null || isUtcTimestamp(value); }
function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] { return Array.isArray(value) && value.every(guard); }

function isEnvelope(value: Record<string, unknown>): boolean {
  return value.data_source === 'test_database' && (value.tls === 'verified' || value.tls === 'encrypted_unverified');
}

function isUnitSearchItem(value: unknown): value is UnitSearchItem {
  return isRecord(value) && hasExactKeys(value, ['unit_id', 'main_board_serial', 'part_number', 'unit_model', 'current_switch_serial', 'current_switch_model', 'last_run_started_at_utc', 'run_count'])
    && isPositiveInteger(value.unit_id) && isString(value.main_board_serial) && isNullableString(value.part_number)
    && isNullableString(value.unit_model) && isNullableString(value.current_switch_serial) && isNullableString(value.current_switch_model)
    && isNullableUtcTimestamp(value.last_run_started_at_utc) && isNonnegativeInteger(value.run_count);
}

function isUnitSearchResponse(value: unknown): value is UnitSearchConnectedResponse {
  return isRecord(value) && hasExactKeys(value, ['data_source', 'tls', 'items', 'has_more']) && isEnvelope(value)
    && isArrayOf(value.items, isUnitSearchItem) && isBoolean(value.has_more);
}

function isUnitDetail(value: unknown): value is UnitDetail {
  return isRecord(value) && hasExactKeys(value, ['unit_id', 'main_board_serial', 'part_number', 'unit_model', 'front_panel_channel_count', 'created_at_utc', 'updated_at_utc'])
    && isPositiveInteger(value.unit_id) && isString(value.main_board_serial) && isNullableString(value.part_number) && isNullableString(value.unit_model)
    && isNullablePositiveInteger(value.front_panel_channel_count) && isUtcTimestamp(value.created_at_utc) && isUtcTimestamp(value.updated_at_utc);
}

function isUnitAssignment(value: unknown): value is UnitAssignment {
  return isRecord(value) && hasExactKeys(value, ['assignment_id', 'switch_serial', 'switch_model', 'firmware_version', 'installed_at_utc', 'installed_by', 'removed_at_utc', 'removed_by', 'removal_reason'])
    && isPositiveInteger(value.assignment_id) && isString(value.switch_serial) && isString(value.switch_model) && isNullableString(value.firmware_version)
    && isUtcTimestamp(value.installed_at_utc) && isString(value.installed_by) && isNullableUtcTimestamp(value.removed_at_utc)
    && isNullableString(value.removed_by) && isNullableString(value.removal_reason);
}

function isVoidInfo(value: unknown): value is UnitRun['void_info'] {
  return value === null || (isRecord(value) && hasExactKeys(value, ['voided_at_utc', 'voided_by', 'reason'])
    && isUtcTimestamp(value.voided_at_utc) && isString(value.voided_by) && isString(value.reason));
}

function isRunLimits(value: unknown): value is RunLimits | null {
  return value === null || (isRecord(value) && hasExactKeys(value, ['model', 'wavelength_mode', 'too_good_below_db', 'warning_enabled', 'warning_above_db', 'fail_above_db'])
    && isString(value.model) && isEnum(value.wavelength_mode, ['SM', 'MM']) && isFiniteNumber(value.too_good_below_db)
    && isBoolean(value.warning_enabled) && isNullableFiniteNumber(value.warning_above_db) && isFiniteNumber(value.fail_above_db));
}

function isUnitRun(value: unknown): value is UnitRun {
  if (!isRecord(value) || !hasExactKeys(value, ['run_id', 'assignment_id', 'run_number', 'run_started_at_utc', 'run_ended_at_utc', 'tested_by', 'station_number', 'wavelength_mode', 'operating_band', 'front_panel_channel_count', 'part_number_snapshot', 'application_version', 'completion_status', 'run_purpose', 'analysis_status', 'superseded_by_run_id', 'void_info', 'limits', 'timing', 'counts'])) return false;
  if (!isRecord(value.timing) || !hasExactKeys(value.timing, ['quality', 'active_seconds', 'elapsed_seconds', 'stopped_seconds', 'session_count'])) return false;
  if (!isRecord(value.counts) || !hasExactKeys(value.counts, ['logical_channels_measured', 'failing_channels', 'warning_channels', 'extra_candidates_measured'])) return false;
  return isPositiveInteger(value.run_id) && isPositiveInteger(value.assignment_id) && isPositiveInteger(value.run_number)
    && isUtcTimestamp(value.run_started_at_utc) && isNullableUtcTimestamp(value.run_ended_at_utc) && isString(value.tested_by)
    && isNullablePositiveInteger(value.station_number) && isEnum(value.wavelength_mode, ['SM', 'MM']) && isString(value.operating_band)
    && isNullablePositiveInteger(value.front_panel_channel_count) && isNullableString(value.part_number_snapshot) && isString(value.application_version)
    && isEnum(value.completion_status, COMPLETION_STATUSES) && isEnum(value.run_purpose, RUN_PURPOSES) && isEnum(value.analysis_status, ANALYSIS_STATUSES)
    && isNullablePositiveInteger(value.superseded_by_run_id) && isVoidInfo(value.void_info) && isRunLimits(value.limits)
    && isEnum(value.timing.quality, TIMING_QUALITIES) && isNullableNonnegativeNumber(value.timing.active_seconds)
    && isNonnegativeNumber(value.timing.elapsed_seconds) && isNullableNonnegativeNumber(value.timing.stopped_seconds) && isNonnegativeInteger(value.timing.session_count)
    && isNonnegativeInteger(value.counts.logical_channels_measured) && (value.counts.failing_channels === null || isNonnegativeInteger(value.counts.failing_channels))
    && (value.counts.warning_channels === null || isNonnegativeInteger(value.counts.warning_channels)) && isNonnegativeInteger(value.counts.extra_candidates_measured);
}

function isUnitDetailResponse(value: unknown): value is UnitDetailConnectedResponse {
  return isRecord(value) && hasExactKeys(value, ['data_source', 'tls', 'unit', 'assignments', 'assignments_incomplete', 'runs', 'has_more']) && isEnvelope(value)
    && isUnitDetail(value.unit) && isArrayOf(value.assignments, isUnitAssignment) && isBoolean(value.assignments_incomplete)
    && isArrayOf(value.runs, isUnitRun) && isBoolean(value.has_more);
}

function isChannelAttempt(value: unknown): value is ChannelAttempt {
  return isRecord(value) && hasExactKeys(value, ['measurement_id', 'logical_channel', 'physical_port', 'attempt_number', 'wavelength_1_nm', 'wavelength_1_il_db', 'wavelength_2_nm', 'wavelength_2_il_db', 'written_at_utc', 'written_by', 'is_current', 'classification', 'classification_rule'])
    && isPositiveInteger(value.measurement_id) && isNullablePositiveInteger(value.logical_channel) && isPositiveInteger(value.physical_port)
    && isPositiveInteger(value.attempt_number) && isPositiveInteger(value.wavelength_1_nm) && isFiniteNumber(value.wavelength_1_il_db)
    && isPositiveInteger(value.wavelength_2_nm) && isFiniteNumber(value.wavelength_2_il_db) && isUtcTimestamp(value.written_at_utc)
    && isString(value.written_by) && isBoolean(value.is_current) && (value.classification === null || isEnum(value.classification, CLASSIFICATIONS))
    && isNullableString(value.classification_rule) && (value.is_current ? value.classification !== null && value.classification_rule !== null : value.classification === null && value.classification_rule === null);
}

function isRunChannelsResponse(value: unknown): value is RunChannelsConnectedResponse {
  return isRecord(value) && hasExactKeys(value, ['data_source', 'tls', 'run_id', 'logical_channels', 'extra_candidates', 'incomplete']) && isEnvelope(value)
    && isPositiveInteger(value.run_id) && isArrayOf(value.logical_channels, isChannelAttempt) && value.logical_channels.every(item => item.logical_channel !== null)
    && isArrayOf(value.extra_candidates, isChannelAttempt) && value.extra_candidates.every(item => item.logical_channel === null) && isBoolean(value.incomplete);
}

function isChannelMapItem(value: unknown): value is ChannelMapItem {
  return isRecord(value) && hasExactKeys(value, ['logical_channel', 'initial_physical_port', 'effective_physical_port', 'is_replaced', 'latest_replaced_at_utc'])
    && isPositiveInteger(value.logical_channel) && isPositiveInteger(value.initial_physical_port) && isPositiveInteger(value.effective_physical_port)
    && isBoolean(value.is_replaced) && isNullableUtcTimestamp(value.latest_replaced_at_utc);
}

function isReplacementItem(value: unknown): value is ReplacementItem {
  return isRecord(value) && hasExactKeys(value, ['replacement_id', 'logical_channel', 'previous_physical_port', 'replacement_physical_port', 'reason', 'replaced_by', 'replaced_at_utc', 'related_run_id', 'source_recommendation_id', 'notes'])
    && isPositiveInteger(value.replacement_id) && isPositiveInteger(value.logical_channel) && isPositiveInteger(value.previous_physical_port)
    && isPositiveInteger(value.replacement_physical_port) && isString(value.reason) && isString(value.replaced_by) && isUtcTimestamp(value.replaced_at_utc)
    && isNullablePositiveInteger(value.related_run_id) && isNullablePositiveInteger(value.source_recommendation_id) && isNullableString(value.notes);
}

function isExtraPort(value: unknown): value is ConfirmedExtraPortItem {
  return isRecord(value) && hasExactKeys(value, ['physical_port', 'wavelength_1_nm', 'wavelength_1_il_db', 'wavelength_2_nm', 'wavelength_2_il_db', 'attempt_number', 'run_id', 'written_at_utc', 'analysis_status'])
    && isPositiveInteger(value.physical_port) && isPositiveInteger(value.wavelength_1_nm) && isFiniteNumber(value.wavelength_1_il_db)
    && isPositiveInteger(value.wavelength_2_nm) && isFiniteNumber(value.wavelength_2_il_db) && isPositiveInteger(value.attempt_number)
    && isPositiveInteger(value.run_id) && isUtcTimestamp(value.written_at_utc) && isEnum(value.analysis_status, ANALYSIS_STATUSES);
}

function isSpare(value: unknown): value is SpareItem {
  return isRecord(value) && hasExactKeys(value, ['spare_event_id', 'physical_port', 'action', 'recorded_by', 'recorded_at_utc'])
    && isPositiveInteger(value.spare_event_id) && isPositiveInteger(value.physical_port) && isEnum(value.action, ['designated', 'undesignated'])
    && isString(value.recorded_by) && isUtcTimestamp(value.recorded_at_utc);
}

function isRecommendation(value: unknown): value is AnalysisRecommendationItem {
  return isRecord(value) && hasExactKeys(value, ['recommendation_id', 'recommendation_rank', 'category', 'logical_channel', 'current_physical_port', 'candidate_physical_port', 'current_wavelength_1_il_db', 'current_wavelength_2_il_db', 'candidate_wavelength_1_il_db', 'candidate_wavelength_2_il_db', 'current_worst_loss_db', 'candidate_worst_loss_db', 'improvement_db', 'used'])
    && isPositiveInteger(value.recommendation_id) && isPositiveInteger(value.recommendation_rank) && isEnum(value.category, ['required', 'optional'])
    && isPositiveInteger(value.logical_channel) && isPositiveInteger(value.current_physical_port) && isPositiveInteger(value.candidate_physical_port)
    && isFiniteNumber(value.current_wavelength_1_il_db) && isFiniteNumber(value.current_wavelength_2_il_db)
    && isFiniteNumber(value.candidate_wavelength_1_il_db) && isFiniteNumber(value.candidate_wavelength_2_il_db)
    && isFiniteNumber(value.current_worst_loss_db) && isFiniteNumber(value.candidate_worst_loss_db) && isFiniteNumber(value.improvement_db) && isBoolean(value.used);
}

function isAnalysis(value: unknown): value is ReplacementAnalysisItem {
  return isRecord(value) && hasExactKeys(value, ['analysis_id', 'run_id', 'analyzed_at_utc', 'analyzed_by', 'result_status', 'recommendations'])
    && isPositiveInteger(value.analysis_id) && isPositiveInteger(value.run_id) && isUtcTimestamp(value.analyzed_at_utc)
    && isString(value.analyzed_by) && isString(value.result_status) && isArrayOf(value.recommendations, isRecommendation);
}

function isHardwareResponse(value: unknown): value is AssignmentHardwareConnectedResponse {
  return isRecord(value) && hasExactKeys(value, ['data_source', 'tls', 'assignment_id', 'channel_map', 'replacements', 'extra_ports', 'spares', 'analyses', 'incomplete']) && isEnvelope(value)
    && isPositiveInteger(value.assignment_id) && isArrayOf(value.channel_map, isChannelMapItem) && isArrayOf(value.replacements, isReplacementItem)
    && isArrayOf(value.extra_ports, isExtraPort) && isArrayOf(value.spares, isSpare) && isArrayOf(value.analyses, isAnalysis) && isBoolean(value.incomplete);
}

function isNotConnected(value: unknown): value is NotConnectedResponse {
  return isRecord(value) && hasExactKeys(value, ['data_source']) && value.data_source === 'not_connected';
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { throw new UnitLookupClientError('invalid_response'); }
}

async function request<T>(path: string, signal: AbortSignal, guard: (value: unknown) => value is T): Promise<LookupResponse<T>> {
  let response: Response;
  try { response = await fetch(path, { signal, headers: { Accept: 'application/json' } }); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new UnitLookupClientError('unreachable');
  }
  if (response.status === 404) return { data_source: 'not_found' };
  if (response.status === 503) {
    const body = await readJson(response);
    const code = isRecord(body) && hasExactKeys(body, ['code']) && typeof body.code === 'string' && /^[a-z0-9_]{1,64}$/.test(body.code) ? body.code : undefined;
    if (!code) throw new UnitLookupClientError('invalid_response');
    throw new UnitLookupClientError('database', code);
  }
  if (!response.ok) throw new UnitLookupClientError(response.status >= 500 ? 'unreachable' : 'request_failed');
  const body = await readJson(response);
  if (isNotConnected(body)) return body;
  if (!guard(body)) throw new UnitLookupClientError('invalid_response');
  return body;
}

export function searchUnits(text: string, signal: AbortSignal): Promise<LookupResponse<UnitSearchConnectedResponse>> {
  const query = new URLSearchParams({ q: text.trim() });
  return request(`/api/v1/units/search?${query}`, signal, isUnitSearchResponse);
}

export async function loadUnitDetail(unitId: number, signal: AbortSignal): Promise<LookupResponse<UnitDetailConnectedResponse>> {
  const result = await request(`/api/v1/units/${unitId}`, signal, isUnitDetailResponse);
  if (result.data_source === 'test_database' && result.unit.unit_id !== unitId) throw new UnitLookupClientError('invalid_response');
  return result;
}

export async function loadRunChannels(runId: number, signal: AbortSignal): Promise<LookupResponse<RunChannelsConnectedResponse>> {
  const result = await request(`/api/v1/runs/${runId}/channels`, signal, isRunChannelsResponse);
  if (result.data_source === 'test_database' && result.run_id !== runId) throw new UnitLookupClientError('invalid_response');
  return result;
}

export async function loadAssignmentHardware(assignmentId: number, signal: AbortSignal): Promise<LookupResponse<AssignmentHardwareConnectedResponse>> {
  const result = await request(`/api/v1/assignments/${assignmentId}/hardware`, signal, isHardwareResponse);
  if (result.data_source === 'test_database' && result.assignment_id !== assignmentId) throw new UnitLookupClientError('invalid_response');
  return result;
}
