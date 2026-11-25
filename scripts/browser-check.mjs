import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.QA_OUTPUT || '.local/qa';
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH, headless: true } : { channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const checks = [];
let runActivityMode = 'not_connected';
let unitStatusMode = 'values';
let unitTestTimeMode = 'values';
let unitOutcomesWeeklyMode = 'values';
let queryResponseMode = 'success';
let recommendationUsageMode = 'values';
let channelFailuresMode = 'values';
let failureConcentrationMode = 'values';
let stationMode = 'values';
let recentFinishedMode = 'values';
let failureWavelengthsMode = 'values';
let failureKpisMode = 'values';
const runActivityRequests = [];
const configurationTimingRequests = [];
const channelActivityRequests = [];
const failureRateRequests = [];
const replacementActivityRequests = [];
const unitStatusRequests = [];
const unitTestTimeRequests = [];
const unitOutcomesWeeklyRequests = [];
const recommendationUsageRequests = [];
const channelFailuresRequests = [];
const failureConcentrationRequests = [];
const stationSummaryRequests = [];
const filterOptionsRequests = [];
const recentFinishedRequests = [];
const failureWavelengthsRequests = [];
const failureKpisRequests = [];
const unitSearchRequests = [];
const purposeTotals = { production: 2, engineering: 3, training: 1, calibration: 4 };
const purposeOpenRuns = { production: 0, engineering: 1, training: 0, calibration: 0 };
const purposeConfirmed = { production: 1, engineering: 1, training: 0, calibration: 0 };
const channelPeriodTotals = {
  production: { today: 1008, yesterday: 2520, this_week: 8184, last_30_days: 51048 },
  engineering: { today: 120, yesterday: 216, this_week: 552, last_30_days: 3552 },
  training: { today: 0, yesterday: 48, this_week: 144, last_30_days: 648 },
  calibration: { today: 0, yesterday: 0, this_week: 48, last_30_days: 288 },
};
const failurePeriodTotals = {
  production: { today: [5, 100, 2], yesterday: [10, 250, 0], this_week: [20, 400, 3], last_30_days: [48, 1200, 7] },
  engineering: { today: [2, 20, 1], yesterday: [3, 30, 0], this_week: [5, 60, 1], last_30_days: [12, 180, 2] },
  training: { today: [0, 0, 0], yesterday: [1, 10, 1], this_week: [1, 20, 1], last_30_days: [4, 70, 2] },
  calibration: { today: [0, 0, 0], yesterday: [0, 0, 0], this_week: [0, 5, 0], last_30_days: [1, 30, 0] },
};
// Echo of the shared report filters (docs/API_CONTRACTS.md): absent query values echo null.
const filterEcho = (url, purpose) => {
  const number = key => url.searchParams.has(key) ? Number(url.searchParams.get(key)) : null;
  return {
    purpose,
    switch_model: url.searchParams.get('switch_model'),
    wavelength_mode: url.searchParams.get('wavelength_mode'),
    channel_count: number('channel_count'),
    station: number('station'),
  };
};
const filterOptionsFixture = url => ({
  data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-13T20:00:00Z', timezone: 'America/Los_Angeles',
  period: { key: 'last_30_days', start_utc: '2026-10-14T07:00:00Z', end_utc: '2026-11-13T08:00:00Z', partial: false },
  filters: { purpose: url.searchParams.getAll('purpose') },
  switch_models: ['DEMO-MODEL-A', 'DEMO-MODEL-B'], wavelength_modes: ['MM', 'SM'], channel_counts: [24, 48], stations: [1, 2],
  incomplete: false,
});
const sampleState = n => n === 0 ? 'no_data' : n < 10 ? 'small_sample' : 'ok';
const durationStatistics = (n, multiplier) => ({
  n,
  mean: n ? n * multiplier : null,
  median: n ? n * multiplier : null,
  p90: n ? n * multiplier + 10 : null,
  sample_state: sampleState(n),
});
const runActivityFixture = url => {
  const purpose = url.searchParams.get('purpose');
  const purposes = purpose ? [purpose] : Object.keys(purposeTotals);
  const byPurpose = Object.fromEntries(Object.keys(purposeTotals).map(key => [key, purposes.includes(key) ? purposeTotals[key] : 0]));
  const total = Object.values(byPurpose).reduce((sum, count) => sum + count, 0);
  const openRuns = purposes.reduce((sum, key) => sum + purposeOpenRuns[key], 0);
  const confirmed = purposes.reduce((sum, key) => sum + purposeConfirmed[key], 0);
  const unavailable = total - openRuns - confirmed;
  const ended = total - openRuns;
  return {
    data_source: 'test_database',
    tls: 'encrypted_unverified',
    window: {
      started_from: new Date(url.searchParams.get('started_from')).toISOString().replace('.000Z', 'Z'),
      started_before: new Date(url.searchParams.get('started_before')).toISOString().replace('.000Z', 'Z'),
    },
    filters: { purpose, wavelength_mode: null, switch_model: null },
    incomplete: false,
    runs: {
      count_basis: 'runs_started_in_window_not_units',
      total,
      by_run_purpose: byPurpose,
      by_completion_status: { in_progress: openRuns, complete: total - openRuns, stopped: 0, failed: 0 },
    },
    timing: {
      open_runs: openRuns,
      by_quality: { confirmed, checkpoint_estimate: 0, partial: 0, provisional: 0, unavailable },
      active_seconds: durationStatistics(confirmed, 50),
      elapsed_seconds: durationStatistics(ended, 80),
      stopped_seconds: { n: confirmed, mean: confirmed ? 15 : null, sample_state: sampleState(confirmed) },
      flagged_over_90_min: 0,
    },
  };
};
const configurationTimingFixture = url => {
  const purpose = url.searchParams.get('purpose');
  const runs = purpose ? purposeTotals[purpose] : Object.values(purposeTotals).reduce((sum, count) => sum + count, 0);
  const confirmed = purpose ? purposeConfirmed[purpose] : Object.values(purposeConfirmed).reduce((sum, count) => sum + count, 0);
  const openRuns = purpose ? purposeOpenRuns[purpose] : Object.values(purposeOpenRuns).reduce((sum, count) => sum + count, 0);
  const ended = runs - openRuns;
  return {
    data_source: 'test_database',
    tls: 'encrypted_unverified',
    window: {
      started_from: new Date(url.searchParams.get('started_from')).toISOString().replace('.000Z', 'Z'),
      started_before: new Date(url.searchParams.get('started_before')).toISOString().replace('.000Z', 'Z'),
    },
    filters: { purpose, wavelength_mode: null },
    incomplete: false,
    configurations: [{
      switch_model: 'OSX-150',
      wavelength_mode: 'SM',
      front_panel_channel_count: 48,
      runs: ended,
      open_runs: openRuns,
      elapsed_seconds: durationStatistics(ended, 80),
      active_seconds: durationStatistics(confirmed, 50),
      confirmed_timing_runs: confirmed,
      unavailable_timing_runs: ended - confirmed,
      seconds_per_channel: ended ? ended * 80 / 48 : null,
      flagged_over_90_min: 0,
    }],
  };
};
const channelActivityFixture = url => {
  const purposes = url.searchParams.getAll('purpose');
  const selected = purposes.length ? purposes : ['production'];
  const total = key => selected.reduce((sum, purpose) => sum + channelPeriodTotals[purpose][key], 0);
  const daily = Array.from({ length: 31 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 14 + index));
    const dateLabel = date.toISOString().slice(0, 10);
    const channels = index === 30 ? total('today') : selected.reduce((sum, purpose, purposeIndex) => sum + ((index + 3) * (purposeIndex + 2) * (channelPeriodTotals[purpose].last_30_days ? 3 : 0)), 0);
    return {
      date: dateLabel,
      start_utc: `${dateLabel}T07:00:00Z`,
      end_utc: index === 30 ? '2026-11-13T20:00:00Z' : `${new Date(date.getTime() + 86400000).toISOString().slice(0, 10)}T07:00:00Z`,
      partial: index === 30,
      channels_tested: channels,
      attempts: channels + (channels ? 5 : 0),
      units: channels ? Math.max(1, Math.ceil(channels / 48)) : 0,
      runs: channels ? Math.max(1, Math.ceil(channels / 96)) : 0,
      extra_candidate_attempts: channels ? 2 : 0,
      excluded_unknown_boundary: channels ? 1 : 0,
    };
  });
  const period = (key, start, end, partial) => {
    const channels = total(key);
    return { start_utc: start, end_utc: end, partial, channels_tested: channels, attempts: channels + (channels ? 10 : 0), units: channels ? Math.max(1, Math.ceil(channels / 48)) : 0, runs: channels ? Math.max(1, Math.ceil(channels / 96)) : 0, extra_candidate_attempts: channels ? 3 : 0, excluded_unknown_boundary: channels ? 1 : 0 };
  };
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-13T20:00:00Z', timezone: 'America/Los_Angeles',
    filters: filterEcho(url, selected),
    periods: {
      today: period('today', '2026-11-13T08:00:00Z', '2026-11-13T20:00:00Z', true),
      yesterday: period('yesterday', '2026-11-12T08:00:00Z', '2026-11-13T08:00:00Z', false),
      this_week: period('this_week', '2026-11-09T08:00:00Z', '2026-11-13T20:00:00Z', true),
      last_30_days: period('last_30_days', '2026-10-14T07:00:00Z', '2026-11-13T08:00:00Z', false),
    },
    daily,
    incomplete: false,
  };
};
const failureRateFixture = url => {
  const purposes = url.searchParams.getAll('purpose');
  const selected = purposes.length ? purposes : ['production'];
  const total = key => selected.reduce((sum, purpose) => sum.map((value, index) => value + failurePeriodTotals[purpose][key][index]), [0, 0, 0]);
  const counts = ([failed, observed, unknown]) => ({ failed, observed, rate: observed ? failed / observed : null, unknown_criteria: unknown });
  const daily = Array.from({ length: 31 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 14 + index));
    const label = date.toISOString().slice(0, 10);
    const noData = index === 5 || index === 12;
    const observed = noData ? 0 : selected.length * (80 + index);
    const failed = noData ? 0 : selected.reduce((sum, _purpose, purposeIndex) => sum + ((index + purposeIndex) % 7), 0);
    return {
      date: label,
      start_utc: `${label}T07:00:00Z`,
      end_utc: index === 30 ? '2026-11-13T20:00:00Z' : `${new Date(date.getTime() + 86400000).toISOString().slice(0, 10)}T07:00:00Z`,
      partial: index === 30,
      ...counts([failed, observed, noData ? 1 : index % 9 === 0 ? 2 : 0]),
    };
  });
  const period = (key, start, end, partial) => ({ start_utc: start, end_utc: end, partial, ...counts(total(key)) });
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-13T20:00:00Z', timezone: 'America/Los_Angeles',
    filters: filterEcho(url, selected),
    classification_rule: 'strict >, run limit snapshot',
    periods: {
      today: period('today', '2026-11-13T08:00:00Z', '2026-11-13T20:00:00Z', true),
      yesterday: period('yesterday', '2026-11-12T08:00:00Z', '2026-11-13T08:00:00Z', false),
      this_week: period('this_week', '2026-11-09T08:00:00Z', '2026-11-13T20:00:00Z', true),
      last_30_days: period('last_30_days', '2026-10-14T07:00:00Z', '2026-11-13T08:00:00Z', false),
    },
    daily, incomplete: false,
  };
};
const replacementActivityFixture = url => {
  const counts = (events, channels, units, linked = 0, notCurrent = 0) => ({
    events, channels_replaced: channels, units,
    events_per_unit: units ? events / units : null,
    from_recommendation: linked, related_run_not_current: notCurrent,
  });
  const buckets = multiplier => ({
    all: counts(12 * multiplier, 9 * multiplier, 6 * multiplier, 5 * multiplier, multiplier),
    production: counts(7 * multiplier, 6 * multiplier, 4 * multiplier, 3 * multiplier, multiplier),
    engineering: counts(2 * multiplier, 2 * multiplier, 2 * multiplier),
    training: counts(multiplier, multiplier, multiplier),
    calibration: counts(multiplier, multiplier, multiplier),
    unattributed: counts(multiplier, multiplier, multiplier, multiplier),
  });
  const daily = Array.from({ length: 31 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 9, 14 + index));
    const label = date.toISOString().slice(0, 10);
    return {
      date: label, start_utc: `${label}T07:00:00Z`,
      end_utc: index === 30 ? '2026-11-13T20:00:00Z' : `${new Date(date.getTime() + 86400000).toISOString().slice(0, 10)}T07:00:00Z`,
      partial: index === 30, by_attribution: buckets(index % 4 === 0 ? 0 : 1),
    };
  });
  const period = (start, end, partial, multiplier) => ({ start_utc: start, end_utc: end, partial, by_attribution: buckets(multiplier) });
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-13T20:00:00Z', timezone: 'America/Los_Angeles',
    filters: { switch_model: url.searchParams.get('switch_model') },
    periods: {
      today: period('2026-11-13T08:00:00Z', '2026-11-13T20:00:00Z', true, 1),
      yesterday: period('2026-11-12T08:00:00Z', '2026-11-13T08:00:00Z', false, 2),
      this_week: period('2026-11-09T08:00:00Z', '2026-11-13T20:00:00Z', true, 3),
      last_30_days: period('2026-10-14T07:00:00Z', '2026-11-13T08:00:00Z', false, 4),
    },
    daily, administrative_exclusions: 0, incomplete: false,
  };
};
const unitStatusFixture = url => {
  const period = url.searchParams.get('period') || 'last_30_days';
  const purposes = url.searchParams.getAll('purpose').length ? url.searchParams.getAll('purpose') : ['production'];
  const windows = {
    today: ['2026-11-13T08:00:00Z', '2026-11-13T20:00:00Z', true],
    yesterday: ['2026-11-12T08:00:00Z', '2026-11-13T08:00:00Z', false],
    this_week: ['2026-11-09T08:00:00Z', '2026-11-13T20:00:00Z', true],
    last_30_days: ['2026-10-14T07:00:00Z', '2026-11-13T08:00:00Z', false],
  };
  const [start_utc, end_utc, partial] = windows[period];
  const analysis = (id, current, unused, result_status = 'fail_no_viable_recovery') => ({ analysis_id: id, result_status, analyzed_at_utc: '2026-11-13T18:00:00Z', current, unused_recommendations: unused });
  const base = (id, status, channel_count = null) => ({
    unit_id: id, main_board_serial: `DEMO-STATUS-${id}`, assignment_id: id + 100,
    switch_serial: `DEMO-SW-${id}`, switch_model: 'OSX-150', context_run_id: id + 200,
    channel_count,
    status, failing_channels: [], latest_analysis: null, review_reasons: [],
  });
  const failing = (id, status, latest, channelCount, failingCount) => ({
    ...base(id, status, channelCount), latest_analysis: latest,
    failing_channels: Array.from({ length: failingCount }, (_, index) => ({ logical_channel: id + index, effective_port: id + index + 48, wavelength_1_il_db: 2.6001, wavelength_2_il_db: 1.1 })),
  });
  const defaultUnits = [
    failing(1, 'failing_no_measured_recovery', analysis(301, true, 0), 48, 1),
    failing(2, 'failing_needs_analysis', analysis(302, false, 0), 36, 2),
    failing(3, 'failing_recovery_available', analysis(303, true, 2, 'recommendations_available'), 48, 7),
    { ...base(4, 'review_required', period === 'this_week' ? 49 : 8), review_reasons: ['DEMO incompatible wavelength evidence.'] },
    base(5, 'not_evaluated', 49),
    base(6, 'passing', null),
    ...(period === 'this_week' ? [base(7, 'passing', 36), base(8, 'passing', 48), base(9, 'passing', null)] : []),
  ];
  const reasonUnits = [
    failing(11, 'failing_recovery_available', analysis(311, true, 2, 'z_recovery_result'), 48, 1),
    failing(12, 'failing_recovery_available', analysis(312, true, 1, 'recommendations_available'), 48, 2),
    failing(13, 'failing_no_measured_recovery', analysis(313, true, 0, 'fail_no_viable_recovery'), 48, 1),
    failing(14, 'failing_no_measured_recovery', analysis(314, true, 0, 'fail_no_viable_recovery'), 48, 3),
    failing(15, 'failing_no_measured_recovery', analysis(315, true, 0, 'not_applicable_no_extra_ports'), 48, 2),
    failing(16, 'failing_no_measured_recovery', analysis(316, true, 0, 'z_other_saved_result'), 48, 4),
    failing(17, 'failing_no_measured_recovery', analysis(317, true, 0, 'manual_review'), 48, 1),
    failing(18, 'failing_needs_analysis', analysis(318, false, 0, 'stale_saved_result'), 48, 2),
    failing(19, 'failing_needs_analysis', null, 48, 1),
    { ...base(20, 'review_required', 48), review_reasons: ['DEMO review evidence.'] },
    { ...base(21, 'review_required', 48), review_reasons: ['DEMO review evidence.'] },
  ];
  const singularReasonUnits = [
    failing(31, 'failing_needs_analysis', null, 48, 1),
    { ...base(32, 'review_required', 48), review_reasons: ['DEMO review evidence.'] },
  ];
  const units = unitStatusMode === 'zero'
    ? []
    : unitStatusMode === 'reasons' || unitStatusMode === 'reasons_incomplete'
      ? reasonUnits
      : unitStatusMode === 'reasons_singular'
        ? singularReasonUnits
        : defaultUnits;
  const counts = {
    cohort_units: units.length,
    review_required: 0,
    not_evaluated: 0,
    passing: 0,
    failing_recovery_available: 0,
    failing_needs_analysis: 0,
    failing_no_measured_recovery: 0,
  };
  units.forEach(unit => { counts[unit.status] += 1; });
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-13T20:00:00Z', timezone: 'America/Los_Angeles',
    period: { key: period, start_utc, end_utc, partial }, filters: filterEcho(url, purposes),
    classification_rule: 'strict >, run limit snapshot',
    counts,
    units,
    incomplete: unitStatusMode === 'incomplete' || unitStatusMode === 'reasons_incomplete',
  };
};
const unitTestTimeFixture = url => {
  const period = url.searchParams.get('period') || 'last_30_days';
  const purposes = url.searchParams.getAll('purpose').length ? url.searchParams.getAll('purpose') : ['production'];
  const unit = (unit_id, outcome, finished_at_utc, total_ms, run_count, active_run_count, fallback_run_count) => ({
    unit_id, main_board_serial: `DEMO-TIME-${unit_id}`, outcome, finished_at_utc,
    total_ms, run_count, active_run_count, fallback_run_count,
  });
  const allUnits = [
    unit(4, 'unrecoverable', '2026-11-12T18:00:00Z', 6_000_000, 1, 0, 1),
    unit(3, 'unrecoverable', '2026-11-11T18:00:00Z', 5_400_000, 2, 2, 0),
    unit(2, 'passed', '2026-11-10T18:00:00Z', 1_200_000, 2, 1, 1),
    unit(1, 'passed', '2026-11-09T18:00:00Z', 600_000, 1, 1, 0),
  ];
  const units = unitTestTimeMode === 'no_data' ? [] : unitTestTimeMode === 'singular' ? [allUnits[3]] : allUnits;
  const finished = unitTestTimeMode === 'no_data'
    ? { passed: 0, unrecoverable: 0 }
    : unitTestTimeMode === 'singular'
      ? { passed: 1, unrecoverable: 0 }
      : { passed: 3, unrecoverable: 2 };
  const excluded = Object.fromEntries([
    'review_required', 'not_evaluated', 'failing_recovery_available', 'failing_needs_analysis',
    'other_saved_result', 'run_in_progress', 'missing_duration', 'outside_period',
  ].map((key, index) => [key, unitTestTimeMode === 'no_data' ? 0 : index === 0 || index === 5 || index === 6 ? 1 : 0]));
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-23T07:30:00Z', timezone: 'America/Los_Angeles',
    period: { key: period, start_utc: '2026-10-14T07:00:00Z', end_utc: '2026-11-13T08:00:00Z', partial: false },
    filters: filterEcho(url, purposes), units, finished, excluded,
    incomplete: unitTestTimeMode === 'incomplete',
  };
};
const unitOutcomesWeeklyFixture = url => {
  const purposes = url.searchParams.getAll('purpose').length ? url.searchParams.getAll('purpose') : ['production'];
  const starts = [
    '2026-09-28T07:00:00Z', '2026-10-05T07:00:00Z', '2026-10-12T07:00:00Z', '2026-10-19T07:00:00Z',
    '2026-10-26T07:00:00Z', '2026-11-02T08:00:00Z', '2026-11-09T08:00:00Z', '2026-11-16T08:00:00Z',
  ];
  const dates = ['2026-09-28', '2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16'];
  const values = unitOutcomesWeeklyMode === 'empty'
    ? Array.from({ length: 8 }, () => [0, 0, 0])
    : unitOutcomesWeeklyMode === 'singular'
      ? [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [1, 0, 0]]
      : [[2, 3, 1], [4, 1, 0], [2, 2, 1], [3, 0, 0], [1, 3, 1], [2, 1, 0], [3, 2, 1], [1, 1, 0]];
  const weeks = values.map(([passed_no_replacement, passed_after_replacement, unrecoverable], index) => ({
    start_utc: starts[index], end_utc: index === 7 ? '2026-11-17T20:00:00Z' : starts[index + 1],
    local_start_date: dates[index], partial: index === 7,
    passed_no_replacement, passed_after_replacement, unrecoverable,
  }));
  let unitId = 0;
  const units = weeks.flatMap((week, weekIndex) => [
    ...Array.from({ length: week.passed_no_replacement }, () => ({ outcome: 'passed', replaced: false })),
    ...Array.from({ length: week.passed_after_replacement }, () => ({ outcome: 'passed', replaced: true })),
    ...Array.from({ length: week.unrecoverable }, () => ({ outcome: 'unrecoverable', replaced: false })),
  ].map((value, itemIndex) => {
    unitId += 1;
    return { unit_id: unitId, main_board_serial: `DEMO-WEEK-${unitId}`, ...value, finished_at_utc: new Date(Date.parse(starts[weekIndex]) + (itemIndex + 1) * 3_600_000).toISOString().replace('.000Z', 'Z'), week_start_date: dates[weekIndex] };
  })).sort((left, right) => Date.parse(right.finished_at_utc) - Date.parse(left.finished_at_utc) || left.unit_id - right.unit_id);
  const excluded = Object.fromEntries([
    'review_required', 'not_evaluated', 'failing_recovery_available', 'failing_needs_analysis',
    'other_saved_result', 'run_in_progress', 'outside_period',
  ].map((key, index) => [key, unitOutcomesWeeklyMode === 'empty' ? 0 : index === 0 ? 2 : index === 5 ? 1 : 0]));
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-17T20:00:00Z', timezone: 'America/Los_Angeles',
    filters: filterEcho(url, purposes), weeks, units, excluded,
    incomplete: unitOutcomesWeeklyMode === 'incomplete',
  };
};
const failureWavelengthsFixture = url => {
  const period = url.searchParams.get('period') || 'last_30_days';
  const purposes = url.searchParams.getAll('purpose').length ? url.searchParams.getAll('purpose') : ['production'];
  const windows = {
    today: ['2026-11-23T08:00:00Z', '2026-11-23T20:00:00Z', true],
    yesterday: ['2026-11-22T08:00:00Z', '2026-11-23T08:00:00Z', false],
    this_week: ['2026-11-23T08:00:00Z', '2026-11-23T20:00:00Z', true],
    last_30_days: ['2026-10-25T07:00:00Z', '2026-11-23T08:00:00Z', false],
  };
  const [start_utc, end_utc, partial] = windows[period];
  const sm = { wavelength_mode: 'SM', wavelength_1_nm: 1310, wavelength_2_nm: 1550, failed: 20, first_only: 12, second_only: 5, both: 3 };
  const mm = { wavelength_mode: 'MM', wavelength_1_nm: 850, wavelength_2_nm: 1300, failed: 1, first_only: 0, second_only: 1, both: 0 };
  const pairs = failureWavelengthsMode === 'empty' ? [] : period === 'last_30_days' ? [mm, sm] : [sm];
  const failed = pairs.reduce((sum, pair) => sum + pair.failed, 0);
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-23T20:00:00Z', timezone: 'America/Los_Angeles',
    period: { key: period, start_utc, end_utc, partial }, filters: filterEcho(url, purposes), pairs,
    totals: { failed, observed: failed + 400, unknown_criteria: failureWavelengthsMode === 'incomplete' ? 2 : 0, runs: 9 },
    incomplete: failureWavelengthsMode === 'incomplete',
  };
};
const recentFinishedFixture = url => {
  const period = url.searchParams.get('period') || 'last_30_days';
  const purposes = url.searchParams.getAll('purpose').length ? url.searchParams.getAll('purpose') : ['production'];
  const windows = {
    today: ['2026-11-23T08:00:00Z', '2026-11-23T20:00:00Z', true],
    yesterday: ['2026-11-22T08:00:00Z', '2026-11-23T08:00:00Z', false],
    this_week: ['2026-11-23T08:00:00Z', '2026-11-23T20:00:00Z', true],
    last_30_days: ['2026-10-25T07:00:00Z', '2026-11-23T08:00:00Z', false],
  };
  const [start_utc, end_utc, partial] = windows[period];
  const baseUnits = [
    { unit_id: 701, main_board_serial: 'DEMO-LIVE-701', switch_model: 'OSX-150', wavelength_mode: 'SM', channel_count: 48, station_number: 2, finished_at_utc: '2026-11-23T16:12:00Z', outcome: 'passed_no_replacement', replaced_channels: 0, failed_channels: 1, failed_unknown: false, total_ms: 3_300_000, worst_il_db: '2.7500', worst_il_wavelength_nm: 1550, worst_il_over_limit: true },
    { unit_id: 702, main_board_serial: 'DEMO-LIVE-702', switch_model: 'OSX-100', wavelength_mode: 'MM', channel_count: null, station_number: null, finished_at_utc: '2026-11-23T00:40:00Z', outcome: 'passed_after_replacement', replaced_channels: 2, failed_channels: null, failed_unknown: true, total_ms: null, worst_il_db: null, worst_il_wavelength_nm: null, worst_il_over_limit: null },
    { unit_id: 703, main_board_serial: 'DEMO-LIVE-703', switch_model: 'OSX-150', wavelength_mode: 'SM', channel_count: 24, station_number: 1, finished_at_utc: '2026-11-18T17:05:00Z', outcome: 'unrecoverable', replaced_channels: 1, failed_channels: 2, failed_unknown: false, total_ms: 600_000, worst_il_db: '3.1000', worst_il_wavelength_nm: 1310, worst_il_over_limit: true },
  ];
  const truncatedUnits = Array.from({ length: 100 }, (_, index) => ({
    ...baseUnits[0], unit_id: 800 + index, main_board_serial: `DEMO-LIVE-${800 + index}`,
    finished_at_utc: new Date(Date.parse('2026-11-23T19:59:00Z') - index * 60_000).toISOString().replace('.000Z', 'Z'),
  }));
  const units = recentFinishedMode === 'empty' ? [] : recentFinishedMode === 'truncated' ? truncatedUnits
    : baseUnits.filter(unit => Date.parse(unit.finished_at_utc) >= Date.parse(start_utc) && Date.parse(unit.finished_at_utc) < Date.parse(end_utc));
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-23T20:00:00Z', timezone: 'America/Los_Angeles',
    period: { key: period, start_utc, end_utc, partial }, filters: filterEcho(url, purposes), units,
    truncated: recentFinishedMode === 'truncated', incomplete: recentFinishedMode === 'incomplete',
  };
};
const channelFailuresFixture = url => {
  const period = url.searchParams.get('period') || 'last_30_days';
  const purposes = url.searchParams.getAll('purpose').length ? url.searchParams.getAll('purpose') : ['production'];
  const windows = {
    today: ['2026-11-13T08:00:00Z', '2026-11-13T20:00:00Z', true],
    yesterday: ['2026-11-12T08:00:00Z', '2026-11-13T08:00:00Z', false],
    this_week: ['2026-11-09T08:00:00Z', '2026-11-13T20:00:00Z', true],
    last_30_days: ['2026-10-14T07:00:00Z', '2026-11-13T08:00:00Z', false],
  };
  const [start_utc, end_utc, partial] = windows[period];
  const channel = (logical_channel, failed, observed, unknown_criteria = 0) => ({
    logical_channel, failed, observed, rate: observed ? failed / observed : null, unknown_criteria,
  });
  let channels;
  let maxChannel;
  if (channelFailuresMode === 'zero') {
    channels = Array.from({ length: 24 }, (_, index) => channel(index + 1, 0, 1));
    maxChannel = 24;
  } else if (period === 'this_week') {
    channels = Array.from({ length: 24 }, (_, index) => channel(index + 1, index === 4 ? 1 : 0, 2));
    maxChannel = 24;
  } else {
    // Mixed 24- and 48-channel DEMO runs; channels 41-48 have no observations.
    channels = Array.from({ length: 40 }, (_, index) => {
      const number = index + 1;
      const observed = number <= 24 ? 3 : 1;
      const failed = number === 3 ? 2 : number === 7 || number === 30 ? 1 : 0;
      return channel(number, failed, observed, number === 12 ? 1 : 0);
    });
    maxChannel = 48;
  }
  const sum = key => channels.reduce((total, item) => total + item[key], 0);
  const failed = sum('failed');
  const observed = sum('observed');
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-13T20:00:00Z', timezone: 'America/Los_Angeles',
    period: { key: period, start_utc, end_utc, partial },
    filters: filterEcho(url, purposes),
    classification_rule: 'strict >, run limit snapshot',
    totals: { failed, observed, rate: observed ? failed / observed : null, unknown_criteria: sum('unknown_criteria') },
    runs: channelFailuresMode === 'zero' ? 1 : 4,
    max_channel: maxChannel,
    channels,
    incomplete: channelFailuresMode === 'incomplete',
  };
};
const failureKpisFixture = url => {
  const period = url.searchParams.get('period') || 'last_30_days';
  const purposes = url.searchParams.getAll('purpose').length ? url.searchParams.getAll('purpose') : ['production'];
  const windows = {
    today: ['2026-11-13T08:00:00Z', '2026-11-13T20:00:00Z', true],
    yesterday: ['2026-11-12T08:00:00Z', '2026-11-13T08:00:00Z', false],
    this_week: ['2026-11-09T08:00:00Z', '2026-11-13T20:00:00Z', true],
    last_30_days: ['2026-10-14T07:00:00Z', '2026-11-13T08:00:00Z', false],
  };
  const [start_utc, end_utc, partial] = windows[period];
  const units = failureKpisMode === 'zero'
    ? { finished: 0, passed_no_replacement: 0, passed_after_replacement: 0, unrecoverable: 0, replacement_units: 0, replaced_channels: 0, first_pass: 0, first_pass_unknown: 0 }
    : period === 'last_30_days'
      ? { finished: 8, passed_no_replacement: 5, passed_after_replacement: 3, unrecoverable: 0, replacement_units: 3, replaced_channels: 7, first_pass: 4, first_pass_unknown: 0 }
      : { finished: 4, passed_no_replacement: 2, passed_after_replacement: 1, unrecoverable: 1, replacement_units: 2, replaced_channels: 5, first_pass: 1, first_pass_unknown: 1 };
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-13T20:00:00Z', timezone: 'America/Los_Angeles',
    period: { key: period, start_utc, end_utc, partial }, filters: filterEcho(url, purposes), units,
    retest: failureKpisMode === 'zero' ? { active_run_channels: 0, retested_run_channels: 0 } : { active_run_channels: 110, retested_run_channels: 7 },
    incomplete: failureKpisMode === 'incomplete',
  };
};
const failureConcentrationFixture = url => {
  const period = url.searchParams.get('period') || 'last_30_days';
  const purposes = url.searchParams.getAll('purpose').length ? url.searchParams.getAll('purpose') : ['production'];
  const windows = {
    today: ['2026-11-13T08:00:00Z', '2026-11-13T20:00:00Z', true],
    yesterday: ['2026-11-12T08:00:00Z', '2026-11-13T08:00:00Z', false],
    this_week: ['2026-11-09T08:00:00Z', '2026-11-13T20:00:00Z', true],
    last_30_days: ['2026-10-14T07:00:00Z', '2026-11-13T08:00:00Z', false],
  };
  const [start_utc, end_utc, partial] = windows[period];
  const counts = (failed, observed, unknown_criteria = 0) => ({
    failed, observed, rate: observed ? failed / observed : null, unknown_criteria,
  });
  const empty = failureConcentrationMode === 'empty';
  const channels = empty ? [] : [
    { logical_channel: 1, ...counts(2, 20) },
    { logical_channel: 2, ...counts(4, 40) },
    { logical_channel: 3, ...counts(4, 20) },
    { logical_channel: 4, ...counts(4, 20) },
    { logical_channel: 5, ...counts(1, 5) },
    { logical_channel: 6, ...counts(0, 5) },
    { logical_channel: 7, ...counts(0, 0, 2) },
  ];
  const ports = empty ? [] : [
    { physical_port: 1, extra: false, ...counts(4, 20) },
    { physical_port: 2, extra: false, ...counts(4, 40) },
    { physical_port: 5, extra: false, ...counts(2, 20) },
    { physical_port: 50, extra: false, ...counts(4, 20) },
    { physical_port: 50, extra: true, ...counts(1, 10, 2) },
  ];
  const sum = (items, key) => items.reduce((total, item) => total + item[key], 0);
  const failed = sum(channels, 'failed');
  const observed = sum(channels, 'observed');
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-13T20:00:00Z', timezone: 'America/Los_Angeles',
    period: { key: period, start_utc, end_utc, partial }, filters: filterEcho(url, purposes),
    classification_rule: 'strict >, run limit snapshot',
    totals: { failed, observed, rate: observed ? failed / observed : null, unknown_criteria: sum(channels, 'unknown_criteria') },
    runs: empty ? 0 : 4,
    channels,
    ports,
    incomplete: failureConcentrationMode === 'incomplete',
  };
};
const stationSummaryFixture = url => {
  const purposes = url.searchParams.getAll('purpose').length ? url.searchParams.getAll('purpose') : ['production'];
  const counts = (runs, units, failed, observed, unknown, active, retested, median, n) => ({
    failed, observed, rate: observed ? failed / observed : null, unknown_criteria: unknown, runs, units,
    active_run_channels: active, retested_run_channels: retested,
    retest_share: active ? retested / active : null,
    seconds_per_channel: { median, n },
  });
  const stations = stationMode === 'empty' ? [] : [
    { station_number: 1, ...counts(4, 3, 3, 120, 0, 130, 6, '18.2500', 4) },
    { station_number: 2, ...counts(2, 2, 4, 50, 0, 50, 5, '21.0000', 1) },
    { station_number: null, ...counts(1, 1, 0, 0, 24, 24, 0, null, 0) },
  ];
  const sum = key => stations.reduce((total, station) => total + station[key], 0);
  const totals = stations.length
    ? counts(sum('runs'), 5, sum('failed'), sum('observed'), sum('unknown_criteria'), sum('active_run_channels'), sum('retested_run_channels'), '19.0000', 5)
    : counts(0, 0, 0, 0, 0, 0, 0, null, 0);
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-13T20:00:00Z', timezone: 'America/Los_Angeles',
    period: { key: url.searchParams.get('period') || 'last_30_days', start_utc: '2026-10-14T07:00:00Z', end_utc: '2026-11-13T08:00:00Z', partial: false },
    filters: filterEcho(url, purposes),
    classification_rule: 'strict >, run limit snapshot',
    stations,
    totals,
    incomplete: stationMode === 'incomplete',
  };
};
const recommendationUsageFixture = url => {
  const period = url.searchParams.get('period') || 'last_30_days';
  const purposes = url.searchParams.getAll('purpose').length ? url.searchParams.getAll('purpose') : ['production'];
  const windows = {
    today: ['2026-11-13T08:00:00Z', '2026-11-13T20:00:00Z', true],
    yesterday: ['2026-11-12T08:00:00Z', '2026-11-13T08:00:00Z', false],
    this_week: ['2026-11-09T08:00:00Z', '2026-11-13T20:00:00Z', true],
    last_30_days: ['2026-10-14T07:00:00Z', '2026-11-13T08:00:00Z', false],
  };
  const [start_utc, end_utc, partial] = windows[period];
  const empty = recommendationUsageMode === 'nulls';
  return {
    data_source: 'test_database', tls: 'encrypted_unverified', extracted_at_utc: '2026-11-13T20:00:00Z', timezone: 'America/Los_Angeles',
    period: { key: period, start_utc, end_utc, partial }, filters: filterEcho(url, purposes),
    analyses: { cohort: empty ? 0 : 4, with_recommendations: empty ? 0 : 3, on_invalid_runs: empty ? 0 : 2 },
    recommendations: { total: empty ? 0 : 5, required: empty ? 0 : 2, optional: empty ? 0 : 2, other: empty ? 0 : 1 },
    linked: { total: empty ? 0 : 3, required: empty ? 0 : 2, optional: empty ? 0 : 1, other: 0 },
    linked_share: empty ? null : '0.6000',
    avg_improvement_linked_db: { value: empty ? null : '0.4250', n: empty ? 0 : 3 },
    avg_improvement_all_db: { value: empty ? null : '0.3849', n: empty ? 0 : 5 },
    unlinked_events: empty ? 0 : 4, unlinked_unattributed: empty ? 0 : 1,
    linked_events_in_period: empty ? 0 : 2,
  };
};
const querySchemaFixture = {
  data_source: 'test_database', tls: 'encrypted_unverified', source: 'reviewed_grant_contract',
  objects: [
    ['SCHEMA_MIGRATIONS', 'table', ['migration_id', 'migration_name', 'script_checksum']],
    ['IL_RUNS', 'table', ['run_id', 'assignment_id', 'run_number', 'run_started_at_utc', 'run_ended_at_utc', 'wavelength_mode', 'completion_status', 'run_purpose', 'analysis_status', 'front_panel_channel_count']],
    ['UNIT_SWITCH_ASSIGNMENTS', 'table', ['assignment_id', 'unit_id', 'switch_id', 'installed_at_utc']],
    ['UNITS', 'table', ['unit_id', 'main_board_serial', 'part_number', 'front_panel_channel_count', 'unit_model']],
    ['SWITCHES', 'table', ['switch_id', 'switch_serial', 'switch_model', 'firmware_version']],
    ['vw_RunTimingSummary', 'view', ['run_id', 'active_test_ms', 'elapsed_ms', 'stopped_ms', 'timing_quality']],
    ['IL_MEASUREMENTS', 'table', ['measurement_id', 'run_id', 'logical_channel', 'measurement_role', 'written_at_utc']],
    ['vw_CurrentILMeasurements', 'view', ['measurement_id', 'run_id', 'logical_channel', 'physical_port']],
    ['CHANNEL_REPLACEMENTS', 'table', ['replacement_id', 'assignment_id', 'logical_channel', 'replaced_at_utc']],
    ['vw_CurrentChannelMap', 'view', ['assignment_id', 'logical_channel', 'effective_physical_port']],
    ['vw_ConfirmedExtraPorts', 'view', ['assignment_id', 'run_id', 'physical_port']],
    ['DESIGNATED_SPARES', 'table', ['spare_event_id', 'assignment_id', 'physical_port']],
    ['REPLACEMENT_ANALYSES', 'table', ['analysis_id', 'run_id', 'analyzed_at_utc', 'result_status']],
    ['REPLACEMENT_ANALYSIS_RECOMMENDATIONS', 'table', ['recommendation_id', 'analysis_id', 'logical_channel', 'improvement_db']],
  ].map(([name, kind, columns]) => ({ name, kind, columns })),
};
const querySuccessFixture = (truncated = false) => ({
  data_source: 'test_database', tls: 'encrypted_unverified', executed_at_utc: '2026-11-16T20:00:00Z', elapsed_ms: 42,
  columns: [{ name: 'switch_model', type: 'string' }, { name: 'runs', type: 'integer' }, { name: 'avg_seconds', type: 'decimal' }],
  rows: [['DEMO-MODEL-A', 12, '45.25'], ['DEMO-MODEL-B', 8, '51.50']], row_count: 2, truncated, multiple_result_sets: false,
});
await page.route('**/api/v1/reporting/run-activity?*', async route => {
  const url = new URL(route.request().url());
  runActivityRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : runActivityFixture(url)),
  });
});
await page.route('**/api/v1/reporting/test-time-by-configuration?*', async route => {
  const url = new URL(route.request().url());
  configurationTimingRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : configurationTimingFixture(url)),
  });
});
await page.route('**/api/v1/reporting/channel-activity?*', async route => {
  const url = new URL(route.request().url());
  channelActivityRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : channelActivityFixture(url)),
  });
});
await page.route('**/api/v1/reporting/failure-rate?*', async route => {
  const url = new URL(route.request().url());
  failureRateRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : failureRateFixture(url)),
  });
});
await page.route('**/api/v1/reporting/replacement-activity*', async route => {
  const url = new URL(route.request().url());
  replacementActivityRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : replacementActivityFixture(url)),
  });
});
await page.route('**/api/v1/reporting/unit-status?*', async route => {
  const url = new URL(route.request().url());
  unitStatusRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : unitStatusFixture(url)),
  });
});
await page.route('**/api/v1/reporting/unit-test-time?*', async route => {
  const url = new URL(route.request().url());
  unitTestTimeRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : unitTestTimeFixture(url)),
  });
});
await page.route('**/api/v1/reporting/recent-finished-units?*', async route => {
  const url = new URL(route.request().url());
  recentFinishedRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : recentFinishedFixture(url)),
  });
});
await page.route('**/api/v1/reporting/failure-wavelengths?*', async route => {
  const url = new URL(route.request().url());
  failureWavelengthsRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : failureWavelengthsFixture(url)),
  });
});
await page.route('**/api/v1/reporting/unit-outcomes-weekly?*', async route => {
  const url = new URL(route.request().url());
  unitOutcomesWeeklyRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : unitOutcomesWeeklyFixture(url)),
  });
});
await page.route('**/api/v1/reporting/channel-failures?*', async route => {
  const url = new URL(route.request().url());
  channelFailuresRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : channelFailuresFixture(url)),
  });
});
await page.route('**/api/v1/reporting/failure-kpis?*', async route => {
  const url = new URL(route.request().url());
  failureKpisRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : failureKpisFixture(url)),
  });
});
await page.route('**/api/v1/reporting/failure-concentration?*', async route => {
  const url = new URL(route.request().url());
  failureConcentrationRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : failureConcentrationFixture(url)),
  });
});
await page.route('**/api/v1/reporting/filter-options?*', async route => {
  const url = new URL(route.request().url());
  filterOptionsRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : filterOptionsFixture(url)),
  });
});
await page.route('**/api/v1/reporting/station-summary*', async route => {
  const url = new URL(route.request().url());
  stationSummaryRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : stationSummaryFixture(url)),
  });
});
await page.route('**/api/v1/reporting/recommendation-usage?*', async route => {
  const url = new URL(route.request().url());
  recommendationUsageRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : recommendationUsageFixture(url)),
  });
});
await page.route('**/api/v1/units/search?*', async route => {
  unitSearchRequests.push(new URL(route.request().url()));
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data_source: 'not_connected' }) });
});
await page.route('**/api/v1/query/schema', route => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(runActivityMode === 'connected' ? querySchemaFixture : { data_source: 'not_connected' }),
}));
await page.route('**/api/v1/query/execute', async route => {
  const body = route.request().postDataJSON();
  assert.equal(typeof body.sql, 'string');
  if (queryResponseMode === 'cancel') await new Promise(resolve => setTimeout(resolve, 300));
  if (queryResponseMode === 'rejected') {
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'statement_rejected', reason: 'forbidden_keyword:UPDATE' }) });
  } else if (queryResponseMode === 'sql_error') {
    await route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ code: 'query_failed', sql_error_number: 208, message: "Invalid object name '<database>.dbo.Missing'." }) });
  } else {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(querySuccessFixture(queryResponseMode === 'truncated')) });
  }
});
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  const expectedQueryHttpError = message.type() === 'error'
    && message.text().startsWith('Failed to load resource: the server responded with a status of')
    && ['rejected', 'sql_error'].includes(queryResponseMode);
  if (message.type() === 'error' && !expectedQueryHttpError) errors.push(message.text());
});
page.on('response', response => {
  const expectedQueryResponse = new URL(response.url()).pathname === '/api/v1/query/execute' && [400, 422].includes(response.status());
  if (response.status() >= 400 && !expectedQueryResponse) errors.push(`HTTP ${response.status()}: ${response.url()}`);
});
page.on('requestfailed', request => {
  const pathname = new URL(request.url()).pathname;
  const expectedUnmountCancellation = ['/api/v1/reporting/run-activity', '/api/v1/reporting/test-time-by-configuration', '/api/v1/reporting/channel-activity', '/api/v1/reporting/failure-rate', '/api/v1/reporting/replacement-activity', '/api/v1/reporting/unit-status', '/api/v1/reporting/unit-test-time', '/api/v1/reporting/recent-finished-units', '/api/v1/reporting/failure-wavelengths', '/api/v1/reporting/unit-outcomes-weekly', '/api/v1/reporting/recommendation-usage', '/api/v1/reporting/channel-failures', '/api/v1/reporting/failure-concentration', '/api/v1/reporting/failure-kpis', '/api/v1/reporting/station-summary', '/api/v1/reporting/filter-options', '/api/v1/units/search', '/api/v1/query/schema', '/api/v1/query/execute'].includes(pathname) && request.failure()?.errorText === 'net::ERR_ABORTED';
  if (!expectedUnmountCancellation) errors.push(`Request failed: ${request.url()} ${request.failure()?.errorText}`);
});
const check = label => { checks.push(label); console.log(`PASS ${label}`); };
const visit = async route => {
  await page.goto(`${base}/#${route}`);
  await page.locator('h1').waitFor();
  if (route === '/queries' && runActivityMode === 'connected') await page.getByText('Live · test database', { exact: true }).first().waitFor();
};
const assertText = async (locator, text) => assert.ok((await locator.innerText()).includes(text), `Expected ${text}`);
const assertFocus = async locator => assert.ok(await locator.evaluate(element => element === document.activeElement), 'Expected keyboard focus');
const channelFailuresPanel = () => page.getByRole('heading', { name: 'Failures by logical channel', exact: true }).locator('..').locator('..').locator('..').locator('..');
const stationPanel = () => page.getByRole('heading', { name: /^Stations, / }).locator('..').locator('..').locator('..').locator('..');
const unitOutcomesPanel = () => page.getByRole('heading', { name: 'Unit outcomes', exact: true }).locator('..').locator('..').locator('..').locator('..');
const unitTestTimePanel = (target = page) => target.locator('#unit-test-time-panel');
const kpiTile = (label, target = page) => target.getByRole('region', { name: 'Key metrics' }).getByText(label, { exact: true }).locator('..').locator('..');
const weeklyOutcomesPanel = (target = page) => target.getByRole('heading', { name: 'Unit outcomes by week', exact: true }).locator('..').locator('..').locator('..');
const failureHistogramPanel = () => page.getByRole('heading', { name: 'Failed channels per unit', exact: true }).locator('..').locator('..').locator('..');
const failureReasonsPanel = (target = page) => target.getByRole('region', { name: 'Failing unit reasons' });
const assertFocusRing = async locator => {
  const ring = await locator.evaluate(element => { const s = getComputedStyle(element); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }; });
  assert.ok(ring.style !== 'none' && ring.width >= 2, 'Expected a visible focus outline');
};
function contrast(first, second) {
  const luminance = color => {
    const [r, g, b] = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const n = color.startsWith('color(srgb') ? value : value / 255;
      return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
    });
    return .2126 * r + .7152 * g + .0722 * b;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

try {
  await visit('/');
  await assertText(page.getByRole('heading', { level: 1 }), 'Production overview');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '1,008');
  assert.ok((await page.locator('body').innerText()).includes('Development · Demo data + live test-database panels'));
  assert.equal(await page.getByRole('button', { name: 'Refresh', exact: true }).getAttribute('title'), 'Preview — unavailable in this frontend milestone');
  check('Overview renders synthetic summary');

  const liveCard = page.getByRole('region', { name: 'Run activity' });
  await liveCard.getByText('Live data is off. Start the backend with reporting settings to see test-database numbers.').first().waitFor();
  assert.equal(await liveCard.getByText('Live data is off. Start the backend with reporting settings to see test-database numbers.').count(), 2);
  const firstLiveRequest = runActivityRequests.find(url => url.searchParams.get('purpose') === 'production');
  assert.ok(firstLiveRequest);
  const startedFrom = new Date(firstLiveRequest.searchParams.get('started_from'));
  const startedBefore = new Date(firstLiveRequest.searchParams.get('started_before'));
  assert.equal(startedBefore.getTime() - startedFrom.getTime(), 30 * 24 * 60 * 60 * 1000);
  assert.equal(startedBefore.toISOString().slice(11), '00:00:00.000Z');
  assert.equal(firstLiveRequest.searchParams.get('purpose'), 'production');
  assert.equal(channelActivityRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  assert.equal(failureRateRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  assert.equal(unitStatusRequests.at(-1).searchParams.get('period'), 'today');
  await page.getByRole('region', { name: 'Key metrics' }).getByText('Demo', { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('region', { name: 'Key metrics' }).getByText('Demo', { exact: true }).count(), 6);
  await assertText(page.locator('body'), 'Thursday, November 5, 2026');
  await assertText(page.locator('body'), 'Demo snapshot · Nov 5, 2026');
  await kpiTile('First-pass yield').getByText('Demo', { exact: true }).waitFor();
  const demoUnitOutcomes = unitOutcomesPanel();
  await assertText(demoUnitOutcomes, '24 units finished today');
  await demoUnitOutcomes.getByText('Passed first time', { exact: true }).waitFor();
  await demoUnitOutcomes.getByText('Passed after replacement', { exact: true }).waitFor();
  await demoUnitOutcomes.getByText('Unrecoverable', { exact: true }).waitFor();
  assert.equal(await demoUnitOutcomes.getByText('Live · test database', { exact: true }).count(), 0);
  assert.equal(await demoUnitOutcomes.getByText('Demo', { exact: true }).count(), 0);
  await page.getByText('First-pass channels over the fail limit at either wavelength, last 20 workdays.').waitFor();
  const demoChannelFailures = channelFailuresPanel();
  await assertText(demoChannelFailures, '48-channel units, first pass, last 30 days.');
  await assertText(demoChannelFailures, 'Ch 19, 33, 41 stand out');
  assert.equal(await demoChannelFailures.getByText('Live · test database', { exact: true }).count(), 0);
  assert.equal(await demoChannelFailures.locator('[title^="Logical channel 19: 96 first-pass failures"]').count(), 1);
  assert.equal(channelFailuresRequests.at(-1).searchParams.get('period'), 'today');
  const demoStations = stationPanel();
  await assertText(demoStations, 'Time is per channel so 24, 36 and 48-channel units compare fairly.');
  await assertText(demoStations, 'Station 2 fails 0.5 pts above the line average');
  assert.equal(await demoStations.getByText('Live · test database', { exact: true }).count(), 0);
  assert.equal(stationSummaryRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  assert.equal(stationSummaryRequests.at(-1).searchParams.get('period'), 'today');
  const demoUnitTestTime = unitTestTimePanel();
  await assertText(demoUnitTestTime, 'OSX-150 · SM · 48 channels · 412 units, last 30 days');
  assert.equal(await demoUnitTestTime.getByText('Live · test database', { exact: true }).count(), 0);
  assert.equal(await demoUnitTestTime.getByRole('button', { name: 'All', exact: true }).count(), 0);
  assert.ok(unitTestTimeRequests.some(url => url.searchParams.get('period') === 'today' && url.searchParams.getAll('purpose').join(',') === 'production'));
  await page.getByRole('heading', { name: 'Insertion-loss test time by configuration', exact: true }).waitFor();
  const demoRecent = page.getByRole('table', { name: 'Recently finished units' });
  await demoRecent.getByRole('link', { name: /^DEMO-/ }).first().waitFor();
  assert.ok(await demoRecent.locator('tbody tr').count() > 0);
  assert.equal(await page.getByRole('status').filter({ hasText: 'synthetic units' }).count(), 1);
  assert.equal(await page.getByText('Detailed fixture: DEMO-18793.', { exact: false }).count(), 1);
  assert.ok(recentFinishedRequests.some(url => url.searchParams.get('period') === 'today' && url.searchParams.getAll('purpose').join(',') === 'production'));
  check('Live cards, Unit outcomes, channel heatmap and stations keep the unchanged demo path when not connected');

  await visit('/failures');
  const replacementPanel = page.getByRole('region', { name: 'Replacement activity' });
  await replacementPanel.getByText('Live data is off. Start the backend with reporting settings to see test-database numbers.').waitFor();
  await replacementPanel.getByText('Live · test database', { exact: true }).waitFor();
  assert.equal(replacementActivityRequests.at(-1).searchParams.has('switch_model'), false);
  const recommendationPanel = page.getByRole('region', { name: 'Recommendation usage' });
  await recommendationPanel.getByText('From vw_ReplacementRecommendationUsage: recommended swaps that were recorded as replacements.').waitFor();
  await recommendationPanel.getByText('2,036', { exact: true }).waitFor();
  await recommendationPanel.getByText('Used as recommended', { exact: true }).waitFor();
  assert.equal(await recommendationPanel.getByText('Live · test database', { exact: true }).count(), 0);
  const demoFailureHistogram = failureHistogramPanel();
  await demoFailureHistogram.getByText('More failures than usable extras (4)', { exact: true }).waitFor();
  await demoFailureHistogram.getByText('failed channels in one unit, first pass', { exact: true }).waitFor();
  assert.equal(await demoFailureHistogram.getByText('Live · test database', { exact: true }).count(), 0);
  const demoFailureReasons = failureReasonsPanel();
  await demoFailureReasons.getByRole('heading', { name: 'Why units were unrecoverable', exact: true }).waitFor();
  await demoFailureReasons.getByText("27 units, from each run's latest replacement analysis.", { exact: true }).waitFor();
  assert.equal(await demoFailureReasons.locator('code').count(), 3);
  assert.equal(await demoFailureReasons.getByText('Live · test database', { exact: true }).count(), 0);
  const demoWeeklyOutcomes = weeklyOutcomesPanel();
  await demoWeeklyOutcomes.getByText('Passed first time', { exact: true }).waitFor();
  assert.equal(await demoWeeklyOutcomes.getByText('Passed, no replacement', { exact: true }).count(), 0);
  assert.equal(await demoWeeklyOutcomes.getByRole('button', { name: 'Refresh unit outcomes' }).count(), 0);
  assert.equal(unitOutcomesWeeklyRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  assert.equal(unitOutcomesWeeklyRequests.at(-1).searchParams.has('period'), false);
  await demoFailureHistogram.getByRole('button', { name: '24 ch', exact: true }).click();
  assert.ok((await demoFailureHistogram.getByRole('img').getAttribute('aria-label')).includes('24-channel'));
  const demoConcentration = page.getByRole('region', { name: 'Failure concentration' });
  await demoConcentration.getByText('Extra port 50 fails as a replacement candidate 31% of the time, about 3× the other extras.', { exact: true }).waitFor();
  assert.equal(await demoConcentration.getByText('Live · test database', { exact: true }).count(), 0);
  assert.equal(failureConcentrationRequests.at(-1).searchParams.get('period'), 'last_30_days');
  assert.equal(failureConcentrationRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  check('Replacement activity is honestly off; recommendation usage, failure histogram, and concentration keep the unchanged demo path');
  await visit('/queries');
  await page.getByText('Synthetic query design preview. Schema and SQL are illustrative. No SQL is executed or sent to a server.').waitFor();
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await page.locator('.recharts-surface').waitFor();
  assert.ok(await page.getByRole('button', { name: 'Run Ctrl ↵', exact: true }).isDisabled());
  assert.ok((await page.locator('body').textContent()).includes('Illustrative schema · dbo'));
  check('Query console keeps the existing demo when reporting is not connected');
  await visit('/');

  const downPage = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await downPage.route('**/api/v1/reporting/run-activity?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/test-time-by-configuration?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/channel-activity?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/failure-rate?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/replacement-activity*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/unit-status?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/unit-test-time?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/recent-finished-units?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/failure-wavelengths?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/unit-outcomes-weekly?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/recommendation-usage?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/channel-failures?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/failure-concentration?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/failure-kpis?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/station-summary*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/filter-options?*', route => route.abort('connectionrefused'));
  try {
    await downPage.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
    await downPage.getByRole('region', { name: 'Run activity' }).getByText('Backend not reachable on 127.0.0.1:8000').first().waitFor();
    await assertText(unitTestTimePanel(downPage), 'OSX-150 · SM · 48 channels · 412 units, last 30 days');
    await downPage.getByRole('img', { name: 'Failed channels by wavelength: 1550 nm only 58 percent, 1310 nm only 27 percent, both 15 percent', exact: true }).waitFor();
    assert.equal(await downPage.locator('#failure-wavelengths').count(), 0);
    check('Live card backend-down state');
    await downPage.goto(`${base}/#/failures`, { waitUntil: 'domcontentloaded' });
    await downPage.getByRole('region', { name: 'Replacement activity' }).getByText('Backend not reachable on 127.0.0.1:8000').waitFor();
    await downPage.getByText('More failures than usable extras (4)', { exact: true }).waitFor();
    await downPage.getByRole('region', { name: 'Key metrics' }).getByText('838', { exact: true }).waitFor();
    assert.equal(await downPage.getByRole('region', { name: 'Key metrics' }).getByText('Demo', { exact: true }).count(), 5);
    await downPage.getByText('Last 30 days · Oct 7 to Nov 5, 2026', { exact: true }).waitFor();
    await downPage.getByText('failed channels in one unit, first pass', { exact: true }).waitFor();
    await failureReasonsPanel(downPage).getByText("27 units, from each run's latest replacement analysis.", { exact: true }).waitFor();
    await weeklyOutcomesPanel(downPage).getByText('Passed first time', { exact: true }).waitFor();
    await downPage.getByText('Extra port 50 fails as a replacement candidate 31% of the time, about 3× the other extras.', { exact: true }).waitFor();
    check('Replacement activity and failure concentration backend-down states');
  } finally { await downPage.close(); }

  const databaseFailurePage = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await databaseFailurePage.route('**/api/v1/reporting/replacement-activity*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'query_timeout' }),
  }));
  await databaseFailurePage.route('**/api/v1/reporting/failure-concentration?*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'query_timeout' }),
  }));
  await databaseFailurePage.route('**/api/v1/reporting/unit-test-time?*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'query_timeout' }),
  }));
  await databaseFailurePage.route('**/api/v1/reporting/recent-finished-units?*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'query_timeout' }),
  }));
  await databaseFailurePage.route('**/api/v1/reporting/unit-outcomes-weekly?*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'query_timeout' }),
  }));
  try {
    await databaseFailurePage.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
    await assertText(unitTestTimePanel(databaseFailurePage), 'OSX-150 · SM · 48 channels · 412 units, last 30 days');
    await databaseFailurePage.goto(`${base}/#/failures`, { waitUntil: 'domcontentloaded' });
    await databaseFailurePage.getByRole('region', { name: 'Replacement activity' }).getByText('Database check failed').waitFor();
    await databaseFailurePage.getByText('query_timeout', { exact: true }).waitFor();
    await databaseFailurePage.getByText('Extra port 50 fails as a replacement candidate 31% of the time, about 3× the other extras.', { exact: true }).waitFor();
    await weeklyOutcomesPanel(databaseFailurePage).getByText('Passed first time', { exact: true }).waitFor();
    check('Replacement activity sanitized database-failure state; failure concentration keeps demo fallback');
  } finally { await databaseFailurePage.close(); }

  runActivityMode = 'connected';
  await page.reload();
  await page.locator('h1').waitFor();
  await page.getByText('Sunday, November 22, 2026', { exact: true }).waitFor();
  await page.getByText('Test database · read 11:30 PM Pacific', { exact: true }).waitFor();
  await liveCard.getByRole('button', { name: 'Refresh live data' }).click();
  await page.getByRole('button', { name: 'Refresh channel activity' }).click();
  await page.getByRole('button', { name: 'Refresh failure rate' }).click();
  await page.getByRole('button', { name: 'Refresh unit status' }).waitFor();
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveCard.getByText('Raw run activity, not units').waitFor();
  await assertText(liveCard, 'Encrypted, certificate not verified');
  await liveCard.getByText('Runs started').locator('..').getByText('2', { exact: true }).waitFor();
  await assertText(liveCard, 'Small sample');
  const liveConfigurationTable = liveCard.getByRole('table', { name: 'Live test time by configuration' });
  await liveConfigurationTable.getByText('OSX-150').waitFor();
  await assertText(liveConfigurationTable, '48 ch');
  await assertText(liveConfigurationTable, '1 / 2 confirmed');
  assert.equal(configurationTimingRequests.at(-1).searchParams.get('purpose'), 'production');
  assert.equal(await page.getByRole('heading', { name: 'Insertion-loss test time by configuration', exact: true }).count(), 0);
  const unitsCompletedKpi = kpiTile('Units completed');
  await unitsCompletedKpi.getByText('5', { exact: true }).waitFor();
  await assertText(unitsCompletedKpi, '3 passed · 2 unrecoverable');
  await assertText(unitsCompletedKpi, 'Finished units · Production');
  await assertText(unitsCompletedKpi, 'Not a final manufacturing disposition.');
  const averageKpi = kpiTile('Avg test time per unit');
  await averageKpi.getByText('55m 00s', { exact: true }).waitFor();
  await assertText(averageKpi, '4 finished units · Small Sample');
  await assertText(averageKpi, '1 finished without a known duration, not averaged.');
  const yieldKpi = kpiTile('First-pass yield (proxy)');
  await yieldKpi.getByText('33.3%', { exact: true }).waitFor();
  await assertText(yieldKpi, '1 of 4 finished units, no failed first reading or replacement · 1 unknown');
  assert.equal(await yieldKpi.getByText('Demo', { exact: true }).count(), 0);
  assert.equal(await yieldKpi.locator('svg').count(), 0);
  assert.equal(await yieldKpi.getByText('First-pass yield (proxy)', { exact: true }).getAttribute('title'), 'Proxy: strict first-pass yield needs a recorded first manufacturing test.');
  assert.ok(failureKpisRequests.some(url => url.searchParams.get('period') === 'today' && url.searchParams.getAll('purpose').join(',') === 'production'));
  failureKpisMode = 'zero';
  await page.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await yieldKpi.getByText('—', { exact: true }).waitFor();
  failureKpisMode = 'values';
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await yieldKpi.getByText('33.3%', { exact: true }).waitFor();
  assert.ok(unitTestTimeRequests.some(url => url.searchParams.get('period') === 'today' && url.searchParams.getAll('purpose').join(',') === 'production'));

  unitTestTimeMode = 'no_data';
  await page.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await averageKpi.getByText('—', { exact: true }).waitFor();
  await assertText(averageKpi, '0 finished units · No Data');
  unitTestTimeMode = 'singular';
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await averageKpi.getByText('10m 00s', { exact: true }).waitFor();
  await assertText(averageKpi, '1 finished unit · Small Sample');
  unitTestTimeMode = 'incomplete';
  await page.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await unitsCompletedKpi.getByText('Bounded cohort is incomplete.', { exact: true }).waitFor();
  unitTestTimeMode = 'values';
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await averageKpi.getByText('55m 00s', { exact: true }).waitFor();
  check('Connected header and finished-unit KPIs cover Pacific rollover, missing duration, singular, Small Sample, No Data, incomplete, and Demo yield');
  const liveUnitTestTime = unitTestTimePanel();
  await liveUnitTestTime.getByText('Live · test database', { exact: true }).waitFor();
  await liveUnitTestTime.getByText('4 finished units, today · Small Sample', { exact: true }).waitFor();
  assert.equal(await liveUnitTestTime.getByText('55m 00s', { exact: true }).count(), 2);
  await liveUnitTestTime.getByText('100m 00s+', { exact: true }).waitFor();
  assert.equal(await liveUnitTestTime.locator('svg rect').count(), 8);
  assert.equal(await liveUnitTestTime.locator('[data-mean-bin="true"]').count(), 1);
  assert.equal(await liveUnitTestTime.locator('[data-mean-line="true"]').count(), 1);
  await liveUnitTestTime.getByText('2 of 6 runs used start-to-end time.', { exact: true }).waitFor();
  await liveUnitTestTime.getByText('1 over 90 minutes, included.', { exact: true }).waitFor();
  await assertText(liveUnitTestTime, 'Not counted: 1 review required, 1 run in progress, 1 missing duration.');
  const testTimeOutcome = liveUnitTestTime.getByRole('group', { name: 'Unit test time outcome' });
  await testTimeOutcome.getByRole('button', { name: 'Passed', exact: true }).click();
  await liveUnitTestTime.getByText('2 finished units, today · Small Sample', { exact: true }).waitFor();
  assert.equal(await liveUnitTestTime.getByText('15m 00s', { exact: true }).count(), 2);
  await liveUnitTestTime.getByText('20m 00s+', { exact: true }).waitFor();
  await testTimeOutcome.getByRole('button', { name: 'Unrecoverable', exact: true }).click();
  assert.equal(await liveUnitTestTime.getByText('95m 00s', { exact: true }).count(), 2);
  await liveUnitTestTime.getByText('100m 00s+', { exact: true }).waitFor();
  await testTimeOutcome.getByRole('button', { name: 'All', exact: true }).click();
  const unitTestTimeRequestsBeforeRefresh = unitTestTimeRequests.length;
  await liveUnitTestTime.getByRole('button', { name: 'Refresh unit test time' }).click();
  assert.ok(unitTestTimeRequests.length > unitTestTimeRequestsBeforeRefresh);
  assert.equal(unitTestTimeRequests.at(-1).searchParams.get('period'), 'today');
  assert.equal(unitTestTimeRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');

  unitTestTimeMode = 'no_data';
  await liveUnitTestTime.getByRole('button', { name: 'Refresh unit test time' }).click();
  await liveUnitTestTime.getByText('0 finished units, today · No Data', { exact: true }).waitFor();
  await liveUnitTestTime.getByText('No finished units in this range.', { exact: true }).waitFor();
  assert.equal(await liveUnitTestTime.getByText('—', { exact: true }).count(), 3);
  assert.equal(await liveUnitTestTime.locator('svg rect').count(), 0);

  unitTestTimeMode = 'singular';
  await liveUnitTestTime.getByRole('button', { name: 'Refresh unit test time' }).click();
  await liveUnitTestTime.getByText('1 finished unit, today · Small Sample', { exact: true }).waitFor();

  unitTestTimeMode = 'incomplete';
  await liveUnitTestTime.getByRole('button', { name: 'Refresh unit test time' }).click();
  await liveUnitTestTime.getByText('Bounded cohort is incomplete.', { exact: true }).waitFor();

  unitTestTimeMode = 'values';
  await liveUnitTestTime.getByRole('button', { name: 'Refresh unit test time' }).click();
  await liveUnitTestTime.getByText('4 finished units, today · Small Sample', { exact: true }).waitFor();
  check('Live unit test time covers connected stats, even median, nearest-rank P90, outcome filters, histogram, notes, refresh, Small Sample, No Data, singular wording, and incomplete state');
  await assertText(page.getByRole('button', { name: /^Engineering / }), '3');
  assert.ok((await page.getByRole('button', { name: /^Engineering / }).innerText()).includes('3'));
  await page.getByRole('region', { name: 'Key metrics' }).getByText('Live · test database', { exact: true }).first().waitFor();
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '1,018 attempts · 21 units');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '5 of 100 first channel observations · strict > run limits');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '2 first observations excluded: unknown criteria');
  assert.equal(await page.getByRole('region', { name: 'Key metrics' }).getByText('Live · test database', { exact: true }).count(), 6);
  assert.equal(await page.getByRole('region', { name: 'Key metrics' }).getByText('Demo', { exact: true }).count(), 0);
  await assertText(page.getByRole('region', { name: 'Key metrics' }), 'currently failing, no measured recovery');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '+ 1 need analysis · 1 recovery available');
  const liveUnitOutcomes = unitOutcomesPanel();
  await assertText(liveUnitOutcomes, 'Current status of 6 units tested today.');
  await liveUnitOutcomes.getByText('Live · test database', { exact: true }).first().waitFor();
  for (const label of ['Passing', 'Recovery available', 'Needs analysis', 'No measured recovery', 'Review required', 'Not evaluated']) {
    const row = liveUnitOutcomes.getByText(label, { exact: true }).locator('..').locator('..');
    await assertText(row, '1');
    await assertText(row, '16.7%');
  }
  assert.equal(await liveUnitOutcomes.getByRole('img', { name: 'Current unit status: 1 passing, 1 recovery available, 1 needs analysis, 1 no measured recovery, 1 review required, 1 not evaluated' }).count(), 1);
  await liveUnitOutcomes.getByText('Current measured status at extraction time. Not a first-pass yield or a final scrap decision.', { exact: true }).waitFor();
  await liveUnitOutcomes.locator('#failure-wavelengths').waitFor();
  assert.equal(await liveUnitOutcomes.getByText('Demo', { exact: true }).count(), 0);

  unitStatusMode = 'zero';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveUnitOutcomes.getByText('No units tested in this range.', { exact: true }).waitFor();
  assert.equal(await liveUnitOutcomes.getByText('—', { exact: true }).count(), 6);
  assert.ok((await liveUnitOutcomes.innerText()).includes('—'));

  unitStatusMode = 'incomplete';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveUnitOutcomes.getByText('Bounded cohort is incomplete.', { exact: true }).waitFor();

  unitStatusMode = 'values';
  const unitStatusRequestsBeforeRange = unitStatusRequests.length;
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await liveUnitOutcomes.getByText('Current status of 9 units tested this week.', { exact: true }).waitFor();
  const passingRow = liveUnitOutcomes.getByText('Passing', { exact: true }).locator('..').locator('..');
  await assertText(passingRow, '4');
  await assertText(passingRow, '44.4%');
  assert.ok(unitStatusRequests.length > unitStatusRequestsBeforeRange);
  assert.equal(unitStatusRequests.at(-1).searchParams.get('period'), 'this_week');
  check('Overview Unit outcomes covers connected counts, shares, note, wavelength demo, zero, incomplete, and range refresh');
  const liveChannelFailures = channelFailuresPanel();
  await liveChannelFailures.getByText('Live · test database', { exact: true }).waitFor();
  await assertText(liveChannelFailures, "First observation per run-channel, strict > each run's saved limit · 4 runs this week.");
  assert.equal(await liveChannelFailures.locator('[title^="Logical channel "]').count(), 24);
  await liveChannelFailures.getByText('Ch 5 stands out', { exact: true }).waitFor();
  assert.equal(await liveChannelFailures.locator('[title="Logical channel 5: 1 of 2 first observations failed (50.0%)"]').count(), 1);
  const channelRequestsBeforeRange = channelFailuresRequests.length;
  await page.getByRole('button', { name: 'Last 30 days', exact: true }).click();
  await liveChannelFailures.getByText('Ch 30, 3, 7 stand out', { exact: true }).waitFor();
  await assertText(liveChannelFailures, '· 4 runs in the last 30 days.');
  assert.ok(channelFailuresRequests.length > channelRequestsBeforeRange);
  assert.equal(channelFailuresRequests.at(-1).searchParams.get('period'), 'last_30_days');
  assert.equal(channelFailuresRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  assert.equal(await liveChannelFailures.locator('[title^="Logical channel "]').count(), 48);
  assert.equal(await liveChannelFailures.locator('[title$=": no observations"]').count(), 8);
  assert.equal(await liveChannelFailures.getByText('—', { exact: true }).count(), 8);
  await assertText(liveChannelFailures, 'Ch 30, 3, 7 stand out');
  assert.equal(await liveChannelFailures.locator('[title="Logical channel 3: 2 of 3 first observations failed (66.7%)"]').count(), 1);
  assert.equal(await liveChannelFailures.locator('[title="Logical channel 30: 1 of 1 first observations failed (100.0%)"]').evaluate(element => element.style.outline), '2px solid var(--ink)');
  assert.equal(await liveChannelFailures.locator('[title="Logical channel 12: 0 of 3 first observations failed (0.0%)"]').evaluate(element => element.style.outline), 'none');
  await liveChannelFailures.getByText('1 observations with unknown limits not counted.', { exact: true }).waitFor();
  channelFailuresMode = 'incomplete';
  await page.getByRole('button', { name: 'Refresh channel failures' }).click();
  await liveChannelFailures.getByText('Run cap reached; results are incomplete.', { exact: true }).waitFor();
  channelFailuresMode = 'zero';
  await page.getByRole('button', { name: 'Refresh channel failures' }).click();
  await liveChannelFailures.getByText('No failures in this range', { exact: true }).waitFor();
  assert.equal(await liveChannelFailures.locator('[title^="Logical channel "]').count(), 24);
  assert.equal(await liveChannelFailures.getByText('1 observations with unknown limits not counted.', { exact: true }).count(), 0);
  channelFailuresMode = 'values';
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await liveChannelFailures.getByText('Ch 5 stands out', { exact: true }).waitFor();
  check('Overview channel heatmap covers connected cells, empty channels, standouts, notes, zero failures, and range refresh');
  const liveStations = stationPanel();
  await liveStations.getByText('Live · test database', { exact: true }).waitFor();
  await assertText(liveStations, 'Time is wall-clock run time per channel (median)');
  const stationRows = liveStations.getByRole('table', { name: 'Station comparison' }).getByRole('row');
  assert.equal(await stationRows.count(), 5);
  assert.deepEqual(
    (await stationRows.allInnerTexts()).slice(1).map(text => text.split('\n')[0].trim()),
    ['Station 1', 'Station 2', 'No station recorded', 'All stations'],
  );
  const station1 = stationRows.nth(1);
  await assertText(station1, '18.3');
  await assertText(station1, '2.5%');
  await assertText(station1, '4.6%');
  assert.equal(await station1.locator('[title="3 of 120 first observations failed"]').count(), 1);
  assert.equal(await station1.locator('[title="6 of 130 run-channels retested"]').count(), 1);
  assert.equal(await station1.locator('[title="Median of 4 runs"]').count(), 1);
  // Station 2 has the highest rate (8.0%), so its bar is full width; station 1 is relative to it.
  assert.equal(await stationRows.nth(2).locator('[title="4 of 50 first observations failed"] span span').evaluate(element => element.style.width), '100%');
  assert.equal(await station1.locator('[title="3 of 120 first observations failed"] span span').evaluate(element => element.style.width), '31.3%');
  const noStation = stationRows.nth(3);
  assert.equal(await noStation.getByText('—', { exact: true }).count(), 2);
  await assertText(stationRows.nth(4), '4.1%');
  await liveStations.getByText('Station-level only. Rates pool first observations; a station with few runs can swing widely.', { exact: true }).waitFor();
  await liveStations.getByText('24 observations with unknown limits not counted.', { exact: true }).waitFor();
  assert.equal(await liveStations.getByText(/Station 2 fails/).count(), 0);
  stationMode = 'incomplete';
  await page.getByRole('button', { name: 'Refresh station summary' }).click();
  await liveStations.getByText('Run cap reached; results are incomplete.', { exact: true }).waitFor();
  stationMode = 'empty';
  await page.getByRole('button', { name: 'Refresh station summary' }).click();
  await liveStations.getByText('No station activity this week.', { exact: true }).waitFor();
  assert.equal(await stationRows.count(), 1);
  stationMode = 'values';
  const stationRequestsBeforePurpose = stationSummaryRequests.length;
  await page.getByRole('button', { name: /^Engineering / }).click();
  await liveStations.getByText('All stations', { exact: true }).waitFor();
  assert.ok(stationSummaryRequests.length > stationRequestsBeforePurpose);
  assert.equal(stationSummaryRequests.at(-1).searchParams.getAll('purpose').join(','), 'production,engineering');
  await page.getByRole('button', { name: /^Engineering / }).click();
  await page.getByRole('button', { name: /^Engineering / }).and(page.locator('[aria-pressed="false"]')).waitFor();
  check('Overview stations cover connected rows, totals, titles, relative bars, null station, notes, empty state, and purpose refresh');
  await page.getByRole('heading', { name: 'Stations, this week', exact: true }).waitFor();
  assert.ok(filterOptionsRequests.some(url => url.searchParams.getAll('purpose').join(',') === 'production'));
  const filteredEndpoints = [channelActivityRequests, failureRateRequests, unitStatusRequests, unitTestTimeRequests, recentFinishedRequests, channelFailuresRequests, failureKpisRequests, failureWavelengthsRequests, stationSummaryRequests];
  const lastRequestsMatch = async (expected, label) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (filteredEndpoints.every(requests => Object.entries(expected).every(([key, value]) => requests.at(-1)?.searchParams.get(key) === value))) return;
      await page.waitForTimeout(50);
    }
    assert.fail(`not every live Overview request sent ${label}`);
  };
  const modeSelect = page.getByLabel('Mode filter', { exact: true });
  assert.deepEqual(await modeSelect.locator('option').allTextContents(), ['SM + MM', 'MM', 'SM']);
  assert.deepEqual(await page.getByLabel('Station filter', { exact: true }).locator('option').allTextContents(), ['All stations', 'Station 1', 'Station 2']);
  assert.deepEqual(await page.getByLabel('Model filter', { exact: true }).locator('option').allTextContents(), ['All models', 'DEMO-MODEL-A', 'DEMO-MODEL-B']);
  assert.equal(await page.locator('label', { hasText: /^Operator/ }).locator('select').isDisabled(), true);
  await modeSelect.selectOption('SM');
  await lastRequestsMatch({ wavelength_mode: 'SM', station: null }, 'wavelength_mode=SM');
  await page.getByLabel('Station filter', { exact: true }).selectOption('2');
  await page.getByLabel('Channels filter', { exact: true }).selectOption('48');
  await lastRequestsMatch({ wavelength_mode: 'SM', station: '2', channel_count: '48' }, 'mode, station and channel filters');
  await stationPanel().getByText('Live · test database', { exact: true }).waitFor();
  await page.getByRole('img', { name: /^Live daily first-observation run-channel failure rate/ }).locator('[data-selected-range="true"]').waitFor();
  assert.ok(await page.getByRole('img', { name: /^Live bar chart of channels/ }).locator('rect[style*="opacity: 0.28"]').count() > 0);
  await modeSelect.selectOption('');
  await page.getByLabel('Station filter', { exact: true }).selectOption('');
  await page.getByLabel('Channels filter', { exact: true }).selectOption('');
  await lastRequestsMatch({ wavelength_mode: null, station: null, channel_count: null }, 'no filters after reset');
  check('Overview filters come from filter-options, apply to every live panel, and the 31-day charts highlight the selected range');
  assert.equal(await page.getByRole('img', { name: /^Live bar chart of channels/ }).locator('rect').count(), 31);
  const liveFailureChart = page.getByRole('img', { name: /^Live daily first-observation run-channel failure rate/ });
  await liveFailureChart.waitFor();
  assert.equal(await liveFailureChart.locator('path').count(), 3);
  await assertText(page.getByText('First observation per run-channel; retest runs have their own first observations.'), 'Pacific dates');
  assert.equal(failureRateRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  await assertText(page.getByText('Thirty complete local dates plus today in Pacific time; today is partial.'), 'Pacific time');
  check('Synthetic connected channel activity and Q02 tile/chart, null gaps, criteria note, labels, and refresh');

  await visit('/failures');
  const liveWeeklyOutcomes = weeklyOutcomesPanel();
  await liveWeeklyOutcomes.getByText('Passed, no replacement', { exact: true }).waitFor();
  await liveWeeklyOutcomes.getByText('Units finished each week (Pacific, Monday start), last 8 weeks. The current week is partial.', { exact: true }).waitFor();
  await liveWeeklyOutcomes.getByText('Live · test database', { exact: true }).waitFor();
  const weeklyChart = liveWeeklyOutcomes.locator('svg[data-source="live-unit-outcomes"]');
  assert.equal(await weeklyChart.getAttribute('data-y-maximum'), '8');
  assert.equal(await weeklyChart.getAttribute('aria-label'), '35 units finished in the last 8 weeks: 18 passed with no replacement, 13 passed after replacement, 4 unrecoverable.');
  await liveWeeklyOutcomes.getByText('Sep 28', { exact: true }).waitFor();
  await liveWeeklyOutcomes.getByText('Nov 16 *', { exact: true }).waitFor();
  assert.deepEqual(await liveWeeklyOutcomes.getByText(/unrec\.$/).allTextContents(), ['1 unrec.', '0 unrec.', '1 unrec.', '0 unrec.', '1 unrec.', '0 unrec.', '1 unrec.', '0 unrec.']);
  assert.equal(await weeklyChart.locator('rect[data-week="0"][data-series="passed-no-replacement"]').getAttribute('height'), '42.5');
  assert.equal(await weeklyChart.locator('rect[data-week="0"][data-series="passed-after-replacement"]').getAttribute('height'), '63.8');
  assert.equal(await weeklyChart.locator('rect[data-week="0"][data-series="unrecoverable"]').getAttribute('height'), '21.3');
  await assertText(liveWeeklyOutcomes, 'Not counted: 2 review required, 1 run in progress.');
  assert.equal(unitOutcomesWeeklyRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  assert.equal(unitOutcomesWeeklyRequests.at(-1).searchParams.has('period'), false);
  const weeklyRequestsBeforeRange = unitOutcomesWeeklyRequests.length;
  await replacementPanel.getByText('Channels replaced').waitFor();
  await assertText(replacementPanel, 'of which production: 24');
  await assertText(replacementPanel, '48 events / 24 units');
  await assertText(replacementPanel, 'no related run recorded');
  await assertText(replacementPanel, 'Related run since voided/superseded: 4');
  await assertText(replacementPanel, 'Administrative-error exclusions: 0');
  assert.equal(await replacementPanel.getByRole('img', { name: /Daily replacement events/ }).locator('span').count(), 31);
  await replacementPanel.getByRole('button', { name: 'Today', exact: true }).click();
  assert.equal(unitOutcomesWeeklyRequests.length, weeklyRequestsBeforeRange);
  await assertText(replacementPanel, '12 events / 6 units');
  const weeklyRequestsBeforeRefresh = unitOutcomesWeeklyRequests.length;
  await liveWeeklyOutcomes.getByRole('button', { name: 'Refresh unit outcomes' }).click();
  assert.ok(unitOutcomesWeeklyRequests.length > weeklyRequestsBeforeRefresh);
  assert.equal(unitOutcomesWeeklyRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  assert.equal(unitOutcomesWeeklyRequests.at(-1).searchParams.has('period'), false);
  unitOutcomesWeeklyMode = 'singular';
  await liveWeeklyOutcomes.getByRole('button', { name: 'Refresh unit outcomes' }).click();
  await liveWeeklyOutcomes.getByRole('img', { name: '1 unit finished in the last 8 weeks: 1 passed with no replacement, 0 passed after replacement, 0 unrecoverable.', exact: true }).waitFor();
  unitOutcomesWeeklyMode = 'empty';
  await liveWeeklyOutcomes.getByRole('button', { name: 'Refresh unit outcomes' }).click();
  await liveWeeklyOutcomes.getByText('No finished units in the last 8 weeks.', { exact: true }).waitFor();
  assert.equal(await weeklyChart.locator('rect').count(), 0);
  unitOutcomesWeeklyMode = 'incomplete';
  await liveWeeklyOutcomes.getByRole('button', { name: 'Refresh unit outcomes' }).click();
  await liveWeeklyOutcomes.getByText('Bounded cohort is incomplete.', { exact: false }).waitFor();
  await assertText(liveWeeklyOutcomes, 'Not counted: 2 review required, 1 run in progress.');
  unitOutcomesWeeklyMode = 'values';
  await liveWeeklyOutcomes.getByRole('button', { name: 'Refresh unit outcomes' }).click();
  await liveWeeklyOutcomes.getByText('6', { exact: true }).first().waitFor();
  check('Weekly unit outcomes covers demo fallback, connected geometry and labels, aria totals and singular wording, exclusions, incomplete, empty, refresh, and range independence');
  const concentrationPanel = page.getByRole('region', { name: 'Failure concentration' });
  await concentrationPanel.getByText('Failed first observations, today · 15 of 110 failed.', { exact: true }).waitFor();
  await concentrationPanel.getByText('Live · test database', { exact: true }).waitFor();
  const logicalColumn = concentrationPanel.getByText('Logical channel', { exact: true }).locator('..');
  const portColumn = concentrationPanel.getByText('Physical port', { exact: true }).locator('..');
  assert.deepEqual(await logicalColumn.locator('[title*="first observations failed"]').allInnerTexts(), [
    'Ch 3\n4', 'Ch 4\n4', 'Ch 2\n4', 'Ch 1\n2', 'Ch 5\n1',
  ]);
  assert.deepEqual(await portColumn.locator('[title*="first observations failed"]').allInnerTexts(), [
    'Port 1\n4', 'Port 50\n4', 'Port 2\n4', 'Port 5\n2', 'Port 50 EXTRA\n1',
  ]);
  assert.equal(await logicalColumn.locator('[title="4 of 20 first observations failed (20.0%)"]').first().count(), 1);
  assert.equal(await portColumn.getByText('EXTRA', { exact: true }).count(), 1);
  const logicalRows = logicalColumn.locator('[title*="first observations failed"]');
  const portRows = portColumn.locator('[title*="first observations failed"]');
  assert.equal(await logicalRows.first().locator('div').last().evaluate(element => element.style.width), '100%');
  assert.equal(await logicalRows.last().locator('div').last().evaluate(element => element.style.width), '25%');
  assert.equal(await portRows.last().locator('div').last().evaluate(element => element.style.background), 'var(--o3)');
  await concentrationPanel.getByText('2 observations with unknown limits not counted.', { exact: false }).waitFor();
  assert.equal(failureConcentrationRequests.at(-1).searchParams.get('period'), 'today');
  assert.equal(failureConcentrationRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  const concentrationRequestsBeforeRefresh = failureConcentrationRequests.length;
  await concentrationPanel.getByRole('button', { name: 'Refresh failure concentration' }).click();
  await concentrationPanel.getByText('Failed first observations, today · 15 of 110 failed.', { exact: true }).waitFor();
  assert.ok(failureConcentrationRequests.length > concentrationRequestsBeforeRefresh);
  failureConcentrationMode = 'incomplete';
  await concentrationPanel.getByRole('button', { name: 'Refresh failure concentration' }).click();
  await concentrationPanel.getByText('Run cap reached; results are incomplete.', { exact: true }).waitFor();
  failureConcentrationMode = 'empty';
  await concentrationPanel.getByRole('button', { name: 'Refresh failure concentration' }).click();
  await concentrationPanel.getByText('Failed first observations, today · 0 of 0 failed.', { exact: true }).waitFor();
  assert.equal(await concentrationPanel.getByText('No failed first observations in this range.', { exact: true }).count(), 2);
  failureConcentrationMode = 'values';
  await concentrationPanel.getByRole('button', { name: 'Refresh failure concentration' }).click();
  await concentrationPanel.getByText('Failed first observations, today · 15 of 110 failed.', { exact: true }).waitFor();
  check('Failure concentration covers connected ranking, ties, counts, titles, relative bars, same-number extra ports, notes, empty state, range, and refresh');

  // Failures KPI tiles follow the shared live range (Today here).
  const kpis = page.locator('#failure-kpis');
  const kpiValue = key => kpis.locator(`[data-kpi="${key}"]`);
  await kpiValue('needing').getByText('2', { exact: true }).waitFor();
  assert.equal(failureKpisRequests.at(-1).searchParams.get('period'), 'today');
  assert.equal(failureKpisRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  await assertText(kpiValue('needing'), '50.0% of 4 finished units');
  await assertText(kpiValue('swapped'), '2.5');
  await assertText(kpiValue('swapped'), '5 replaced channels across 2 units');
  await assertText(kpiValue('recovered'), '50.0%');
  await assertText(kpiValue('recovered'), '1 of 2 units that needed replacement now pass');
  await assertText(kpiValue('unrecoverable'), '25.0% of 4 finished units');
  await assertText(kpiValue('retested'), '6.4%');
  await assertText(kpiValue('retested'), '7 of 110 run-channels had another attempt in the same run');
  assert.equal(await kpis.getByText('Demo', { exact: true }).count(), 0);
  assert.equal(await page.getByText('838', { exact: true }).count(), 0);
  await page.getByText('Today · Nov 13, 2026', { exact: true }).waitFor();
  failureKpisMode = 'zero';
  await kpis.getByRole('button', { name: 'Refresh key metrics' }).click();
  await kpiValue('needing').getByText('No finished units in this range', { exact: true }).waitFor();
  await kpiValue('swapped').getByText('—', { exact: true }).waitFor();
  await assertText(kpiValue('recovered'), 'No units needed replacement');
  await assertText(kpiValue('retested'), 'No channel activity in this range');
  failureKpisMode = 'incomplete';
  await kpis.getByRole('button', { name: 'Refresh key metrics' }).click();
  await kpis.getByText('Bounded cohort is incomplete.', { exact: true }).waitFor();
  failureKpisMode = 'values';
  await kpis.getByRole('button', { name: 'Refresh key metrics' }).click();
  await kpiValue('swapped').getByText('2.5', { exact: true }).waitFor();
  check('Failures KPI tiles show live counts, ratios, null ratios, incomplete, refresh, and the live header period');
  const liveFailureHistogram = failureHistogramPanel();
  await liveFailureHistogram.getByText('4 evaluated units tested today · 3 currently failing.', { exact: true }).waitFor();
  await liveFailureHistogram.getByText('Live · test database', { exact: true }).waitFor();
  await liveFailureHistogram.getByText('currently failing channels in one unit', { exact: true }).waitFor();
  await liveFailureHistogram.getByText('Current measured status at extraction time, not first-pass results.', { exact: false }).waitFor();
  await liveFailureHistogram.getByText('2 review-required or not-evaluated units not shown.', { exact: false }).waitFor();
  assert.equal(await liveFailureHistogram.getByText(/^More failures than usable extras/).count(), 0);
  const liveHistogramChart = liveFailureHistogram.getByRole('img');
  assert.equal(await liveHistogramChart.getAttribute('aria-label'), 'Histogram of currently failing channels per unit: 1 unit with none, 1 with 1, 1 with 2, 0 with 3, 0 with 4, 0 with 5, 0 with 6, 1 with 7 or more.');
  const channelCountControl = liveFailureHistogram.getByRole('group', { name: 'Channel count' });
  assert.deepEqual(await channelCountControl.getByRole('button').allTextContents(), ['All', '8', '36', '48', '49']);
  await channelCountControl.getByRole('button', { name: '48', exact: true }).click();
  await liveFailureHistogram.getByText('2 evaluated units tested today · 2 currently failing.', { exact: true }).waitFor();
  assert.equal(await liveHistogramChart.getAttribute('aria-label'), 'Histogram of currently failing channels per unit: 0 units with none, 1 with 1, 0 with 2, 0 with 3, 0 with 4, 0 with 5, 0 with 6, 1 with 7 or more.');
  await channelCountControl.getByRole('button', { name: 'All', exact: true }).click();
  assert.equal(await liveHistogramChart.getAttribute('aria-label'), 'Histogram of currently failing channels per unit: 1 unit with none, 1 with 1, 1 with 2, 0 with 3, 0 with 4, 0 with 5, 0 with 6, 1 with 7 or more.');
  await channelCountControl.getByRole('button', { name: '8', exact: true }).click();
  await replacementPanel.getByRole('button', { name: 'This week', exact: true }).click();
  await liveFailureHistogram.getByText('7 evaluated units tested this week · 3 currently failing.', { exact: true }).waitFor();
  await concentrationPanel.getByText('Failed first observations, this week · 15 of 110 failed.', { exact: true }).waitFor();
  assert.equal(failureConcentrationRequests.at(-1).searchParams.get('period'), 'this_week');
  assert.equal(failureConcentrationRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  assert.equal(await channelCountControl.getByRole('button', { name: 'All', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await channelCountControl.getByRole('button').allTextContents(), ['All', '36', '48', '49']);
  await replacementPanel.getByRole('button', { name: 'Today', exact: true }).click();
  await liveFailureHistogram.getByText('4 evaluated units tested today · 3 currently failing.', { exact: true }).waitFor();
  check('Live failed-channels histogram covers bars, caption, aria, dynamic filters, null-count All behavior, exclusions, and range reset');
  const liveUnitTable = page.getByRole('table', { name: 'Unrecoverable units' });
  await liveUnitTable.getByText('DEMO-STATUS-1').waitFor();
  await assertText(liveUnitTable, 'No measured recovery');
  await assertText(liveUnitTable, 'Needs analysis');
  await assertText(liveUnitTable, 'Recovery available');
  assert.equal(unitStatusRequests.at(-1).searchParams.get('period'), 'today');
  assert.equal(unitStatusRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  const liveFailureReasons = failureReasonsPanel();
  await liveFailureReasons.getByRole('heading', { name: "Why failing units aren't recovered", exact: true }).waitFor();
  await liveFailureReasons.getByText('Live · test database', { exact: true }).waitFor();
  await liveFailureReasons.getByText("3 currently failing units today, by each unit's latest saved analysis.", { exact: true }).waitFor();
  unitStatusMode = 'reasons';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveFailureReasons.getByText("9 currently failing units today, by each unit's latest saved analysis.", { exact: true }).waitFor();
  const expectedReasonRows = [
    ['Recovery available', '2 22%', 'recommendations_available', 'z_recovery_result'],
    ['No viable recovery found', '2 22%', 'fail_no_viable_recovery'],
    ['No usable extra ports', '1 11%', 'not_applicable_no_extra_ports'],
    ['Other saved result', '2 22%', 'manual_review', 'z_other_saved_result'],
    ['Analysis out of date', '1 11%', 'stale_saved_result'],
    ['No saved analysis', '1 11%'],
  ];
  for (const [title, countAndShare, ...codes] of expectedReasonRows) {
    const row = liveFailureReasons.getByText(title, { exact: true }).locator('..').locator('..');
    await row.waitFor();
    assert.ok((await row.innerText()).replace(/\s+/g, ' ').includes(countAndShare));
    for (const code of codes) await assertText(row, code);
    assert.equal(await row.locator('code').count(), codes.length ? 1 : 0);
  }
  assert.deepEqual(await liveFailureReasons.locator('code').allTextContents(), [
    "result_status = 'recommendations_available', 'z_recovery_result'",
    "result_status = 'fail_no_viable_recovery'",
    "result_status = 'not_applicable_no_extra_ports'",
    "result_status = 'manual_review', 'z_other_saved_result'",
    "result_status = 'stale_saved_result'",
  ]);
  assert.deepEqual(await liveFailureReasons.locator('[data-reason-bar]').evaluateAll(elements => elements.map(element => element.style.width)), ['100%', '100%', '50%', '100%', '50%', '50%']);
  await assertText(liveFailureReasons, '2 review-required units not shown.');
  unitStatusMode = 'reasons_incomplete';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveFailureReasons.getByText('Bounded cohort is incomplete.', { exact: false }).waitFor();
  unitStatusMode = 'reasons_singular';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveFailureReasons.getByText("1 currently failing unit today, by each unit's latest saved analysis.", { exact: true }).waitFor();
  await assertText(liveFailureReasons, '1 review-required unit not shown.');
  assert.equal(await liveFailureReasons.locator('[data-reason-bar]').count(), 1);
  assert.equal(await liveFailureReasons.getByText('No saved analysis', { exact: true }).count(), 1);
  assert.equal(await liveFailureReasons.getByText('Recovery available', { exact: true }).count(), 0);
  unitStatusMode = 'zero';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveFailureReasons.getByText('No currently failing units in this range.', { exact: true }).waitFor();
  assert.equal(await liveFailureReasons.locator('[data-reason-bar]').count(), 0);
  unitStatusMode = 'reasons';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await replacementPanel.getByRole('button', { name: 'This week', exact: true }).click();
  await liveFailureReasons.getByText("9 currently failing units this week, by each unit's latest saved analysis.", { exact: true }).waitFor();
  assert.equal(unitStatusRequests.at(-1).searchParams.get('period'), 'this_week');
  await replacementPanel.getByRole('button', { name: 'Today', exact: true }).click();
  await liveFailureReasons.getByText("9 currently failing units today, by each unit's latest saved analysis.", { exact: true }).waitFor();
  unitStatusMode = 'values';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveFailureReasons.getByText("3 currently failing units today, by each unit's latest saved analysis.", { exact: true }).waitFor();
  check('Failing-unit reasons cover demo fallback, live groups and codes, hidden zero groups, shares, relative bars, notes, singular, empty, and range changes');
  await recommendationPanel.getByText('Linked to a replacement', { exact: true }).waitFor();
  await assertText(recommendationPanel, 'Saved recommendations from analyses in Today · replacement links recorded through now.');
  await assertText(recommendationPanel, '5');
  await assertText(recommendationPanel, '2 required · 2 optional · 1 other');
  await assertText(recommendationPanel, '3 60.0%');
  await assertText(recommendationPanel, '+ 1 unattributed');
  await assertText(recommendationPanel, '0.42 dB');
  await assertText(recommendationPanel, '3 linked · all recommendations 0.38 dB (5)');
  await assertText(recommendationPanel, "A missing link means usage wasn't recorded, not that the recommendation was ignored.");
  await assertText(recommendationPanel, '2 analyses on voided or superseded runs not counted.');
  assert.ok((await recommendationPanel.innerText()).includes('·'));
  assert.equal(recommendationUsageRequests.at(-1).searchParams.get('period'), 'today');
  assert.equal(recommendationUsageRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  await assertText(page.getByText(/review required ·/), '1 review required · 1 not evaluated');
  unitStatusMode = 'incomplete';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveFailureHistogram.getByText('Bounded cohort is incomplete.', { exact: false }).waitFor();
  unitStatusMode = 'zero';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveFailureHistogram.getByText('No evaluated units in this range.', { exact: true }).waitFor();
  assert.equal(await liveFailureHistogram.getByRole('img').getAttribute('aria-label'), 'Histogram of currently failing channels per unit: 0 units with none, 0 with 1, 0 with 2, 0 with 3, 0 with 4, 0 with 5, 0 with 6, 0 with 7 or more.');
  unitStatusMode = 'values';
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
  await liveFailureHistogram.getByText('4 evaluated units tested today · 3 currently failing.', { exact: true }).waitFor();
  await replacementPanel.getByRole('button', { name: 'Refresh replacement activity' }).click();
  const recommendationRequestsBeforeRefresh = recommendationUsageRequests.length;
  await recommendationPanel.getByRole('button', { name: 'Refresh', exact: true }).click();
  await recommendationPanel.getByText('Linked to a replacement', { exact: true }).waitFor();
  assert.ok(recommendationUsageRequests.length > recommendationRequestsBeforeRefresh);
  recommendationUsageMode = 'nulls';
  await recommendationPanel.getByRole('button', { name: 'Refresh', exact: true }).click();
  await recommendationPanel.getByText('0', { exact: true }).first().waitFor();
  assert.ok((await recommendationPanel.innerText()).includes('—'));
  await assertText(recommendationPanel, '0 linked · all recommendations — (0)');
  recommendationUsageMode = 'values';
  await recommendationPanel.getByRole('button', { name: 'Refresh', exact: true }).click();
  await recommendationPanel.getByText('3 60.0%', { exact: true }).waitFor();
  assert.ok(replacementActivityRequests.length >= 3);
  check('Replacement activity, recommendation usage, and current unit status cover shared range, connected/null values, notes, and refresh');
  {
    const failureEndpoints = [unitStatusRequests, recommendationUsageRequests, failureConcentrationRequests, failureKpisRequests, unitOutcomesWeeklyRequests];
    const lastFailuresRequestsMatch = async (expected, label) => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (failureEndpoints.every(requests => Object.entries(expected).every(([key, value]) => key === 'purpose'
          ? requests.at(-1)?.searchParams.getAll('purpose').join(',') === value
          : requests.at(-1)?.searchParams.get(key) === value))) return;
        await page.waitForTimeout(50);
      }
      assert.fail(`not every live Failures request sent ${label}`);
    };
    const periodSelect = page.getByLabel('Period filter', { exact: true });
    await periodSelect.waitFor();
    assert.deepEqual(await periodSelect.locator('option').allTextContents(), ['Last 30 days', 'This week', 'Yesterday', 'Today']);
    assert.deepEqual(await page.getByLabel('Run purpose filter', { exact: true }).locator('option').allTextContents(), ['Production', 'Engineering', 'Production + engineering', 'Training', 'Calibration', 'All purposes']);
    assert.deepEqual(await page.getByLabel('Station filter', { exact: true }).locator('option').allTextContents(), ['All stations', 'Station 1', 'Station 2']);
    assert.equal(await page.getByRole('button', { name: /Export CSV/ }).isDisabled(), true);
    await periodSelect.selectOption('week');
    await page.getByRole('group', { name: 'Live replacement range' }).getByRole('button', { name: 'This week', exact: true }).and(page.locator('[aria-pressed="true"]')).waitFor();
    await page.getByRole('group', { name: 'Live replacement range' }).getByRole('button', { name: 'Last 30 days', exact: true }).click();
    assert.equal(await periodSelect.inputValue(), 'month');
    await page.getByLabel('Run purpose filter', { exact: true }).selectOption('production_engineering');
    await page.getByLabel('Mode filter', { exact: true }).selectOption('SM');
    await page.getByLabel('Station filter', { exact: true }).selectOption('2');
    await lastFailuresRequestsMatch({ purpose: 'production,engineering', wavelength_mode: 'SM', station: '2', switch_model: null }, 'purpose, mode and station');
    await page.getByText('Production + engineering units finished', { exact: false }).waitFor();
    const replacementBefore = replacementActivityRequests.length;
    await page.getByLabel('Model filter', { exact: true }).selectOption('DEMO-MODEL-A');
    await lastFailuresRequestsMatch({ switch_model: 'DEMO-MODEL-A' }, 'the model');
    for (let attempt = 0; attempt < 100 && replacementActivityRequests.length === replacementBefore; attempt += 1) await page.waitForTimeout(50);
    assert.equal(replacementActivityRequests.at(-1).searchParams.get('switch_model'), 'DEMO-MODEL-A');
    assert.equal(replacementActivityRequests.at(-1).searchParams.has('purpose'), false);
    await page.getByRole('region', { name: 'Replacement activity' }).getByText('DEMO-MODEL-A only', { exact: false }).waitFor();
    await page.getByLabel('Model filter', { exact: true }).selectOption('');
    await page.getByLabel('Mode filter', { exact: true }).selectOption('');
    await page.getByLabel('Station filter', { exact: true }).selectOption('');
    await page.getByLabel('Run purpose filter', { exact: true }).selectOption('production');
    await lastFailuresRequestsMatch({ purpose: 'production', wavelength_mode: null, station: null, switch_model: null }, 'the reset filters');
    check('Failures header Period, Run purpose and filters are live, stay in sync with the replacement range, and apply to every live panel');
  }
  await visit('/');

  await page.reload();
  await page.locator('h1').waitFor();
  await page.keyboard.press('Tab');
  await assertFocus(page.getByRole('link', { name: 'Skip to content' }));
  await page.keyboard.press('Enter');
  await assertFocus(page.locator('main'));
  const productionFailureTrend = await page.getByRole('img', { name: /^Live daily first-observation/ }).locator('path').last().getAttribute('d');

  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '8,184');
  await page.getByRole('button', { name: /^Engineering / }).click();
  await assertText(page.getByRole('heading', { level: 1 }), 'Production + engineering');
  await page.getByRole('region', { name: 'Key metrics' }).getByText('8,736', { exact: true }).waitFor();
  await page.getByText('Live · test database · Production + Engineering', { exact: true }).first().waitFor();
  assert.equal(failureRateRequests.at(-1).searchParams.getAll('purpose').join(','), 'production,engineering');
  assert.ok(unitTestTimeRequests.some(url => url.searchParams.get('period') === 'this_week' && url.searchParams.getAll('purpose').join(',') === 'production,engineering'));
  assert.notEqual(await page.getByRole('img', { name: /^Live daily first-observation/ }).locator('path').last().getAttribute('d'), productionFailureTrend);
  await liveCard.getByText('Runs started').locator('..').getByText('5', { exact: true }).waitFor();
  await liveCard.getByText('Select one purpose or all to see timing').waitFor();
  await liveCard.getByText('Select one purpose or all to see times by configuration').waitFor();
  await page.getByRole('button', { name: /^Training / }).click();
  await page.getByRole('button', { name: /^Calibration / }).click();
  await liveCard.getByText('Runs started').locator('..').getByText('10', { exact: true }).waitFor();
  await liveCard.getByText('Elapsed time').waitFor();
  assert.equal(runActivityRequests.at(-1).searchParams.has('purpose'), false);
  assert.equal(configurationTimingRequests.at(-1).searchParams.has('purpose'), false);
  assert.ok(unitTestTimeRequests.some(url => url.searchParams.get('period') === 'this_week' && url.searchParams.getAll('purpose').join(',') === 'production,engineering,training,calibration'));
  check('Live counts combine across selected purposes; timing is refused for partial combinations and restored for all-purpose request');
  await page.getByRole('button', { name: 'Back to production only' }).click();
  await liveCard.getByText('Runs started').locator('..').getByText('2', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Production / }).click();
  assert.equal(await page.getByRole('button', { name: /^Production / }).getAttribute('aria-pressed'), 'true');
  check('Range and purpose filters update summary; final purpose cannot be deselected');

  const liveHistogramLabel = await page.getByRole('img', { name: /^Histogram of/ }).getAttribute('aria-label');
  assert.equal(await page.getByRole('heading', { name: 'Insertion-loss test time by configuration', exact: true }).count(), 0);
  check('Connected unit-time panel hides the redundant demo configuration table');
  assert.equal(await page.getByRole('img', { name: /^Live daily first-observation/ }).locator('path').last().getAttribute('d'), productionFailureTrend);
  await page.getByRole('button', { name: 'Yesterday', exact: true }).focus();
  await page.keyboard.press('Space');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '2,520');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '8,184');
  assert.equal(await page.getByRole('img', { name: /^Histogram of/ }).getAttribute('aria-label'), liveHistogramLabel);
  assert.ok(unitTestTimeRequests.some(url => url.searchParams.get('period') === 'this_week' && url.searchParams.getAll('purpose').join(',') === 'production'));
  check('Skip link, keyboard range selection, visible focus, and restored production Q02 trend');

  await page.getByRole('button', { name: 'Last 30 days', exact: true }).click();
  const table = page.getByRole('table', { name: 'Recently finished units' });
  await page.getByText('Live · test database', { exact: true }).last().waitFor();
  await assertText(page.getByText('Newest first. Finished means passing', { exact: false }), 'not a final manufacturing disposition');
  assert.equal(recentFinishedRequests.at(-1).searchParams.get('period'), 'last_30_days');
  assert.equal(recentFinishedRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  // Last 30 days covers complete Pacific dates only, so DEMO-LIVE-701 (finished today) is not in it.
  assert.equal(await table.locator('tbody tr').count(), 2);
  await assertText(table, 'Yesterday 16:40');
  await assertText(table, 'Nov 18 09:05');
  assert.equal(await table.locator('[title="No known duration"]').count(), 1);
  assert.equal(await table.locator('[title="Unknown criteria"]').count(), 1);
  assert.equal(await table.locator('[title*="over saved limit"]').count(), 1);
  await page.getByLabel('Activity model').selectOption('OSX-100');
  assert.ok((await table.locator('tbody').innerText()).includes('OSX-100'));
  assert.ok(!(await table.locator('tbody').innerText()).includes('OSX-150'));
  await page.getByLabel('Activity model').selectOption({ label: 'All models' });
  assert.deepEqual(await page.getByLabel('Activity station').locator('option').allTextContents(), ['All stations', 'St 1']);
  await page.getByLabel('Activity station').selectOption({ label: 'St 1' });
  assert.equal(await table.locator('tbody tr').count(), 1);
  assert.ok(!(await table.locator('tbody').innerText()).includes('OSX-100'));
  await page.getByLabel('Activity station').selectOption({ label: 'All stations' });
  await page.getByRole('button', { name: 'Unit', exact: true }).click();
  assert.equal(await table.locator('th').first().getAttribute('aria-sort'), 'ascending');
  await page.getByRole('searchbox', { name: 'Find a unit' }).fill('missing');
  await assertText(page.getByRole('status').filter({ hasText: 'No finished' }), 'No finished units match');
  await page.getByRole('button', { name: 'Reset activity filters' }).focus();
  await page.keyboard.press('Enter');
  await assertFocus(page.getByRole('searchbox', { name: 'Find a unit' }));
  assert.equal(await table.locator('tbody tr').count(), 2);
  await page.getByRole('searchbox', { name: 'Find a unit' }).fill('  demo-live-703  ');
  assert.equal(await table.locator('tbody tr').count(), 1);
  assert.equal(await table.getByRole('link', { name: 'DEMO-LIVE-703' }).getAttribute('href'), '#/unit?unit=703');
  await page.getByRole('button', { name: 'Reset activity filters' }).click();
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await table.getByRole('link', { name: 'DEMO-LIVE-701' }).waitFor();
  await assertText(table, 'Today 08:12');
  await assertText(table, 'OSX-150 · SM · 48');
  await page.getByRole('status').filter({ hasText: /^1 unit$/ }).waitFor();
  recentFinishedMode = 'empty';
  await page.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await page.getByText('No finished units in this range.', { exact: true }).waitFor();
  recentFinishedMode = 'truncated';
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByText('Showing the newest 100 units.', { exact: true }).waitFor();
  recentFinishedMode = 'incomplete';
  await page.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await page.getByText('Bounded cohort is incomplete.', { exact: true }).last().waitFor();
  recentFinishedMode = 'values';
  await page.getByRole('button', { name: 'Last 30 days', exact: true }).click();
  await table.getByRole('link', { name: 'DEMO-LIVE-703' }).waitFor();
  check('Live activity rows, links, Pacific dates, nulls, limit color, dynamic filters, sorting, empty, truncated, incomplete, and summary re-requests');

  const wavelengths = page.locator('#failure-wavelengths');
  await wavelengths.waitFor();
  assert.equal(failureWavelengthsRequests.at(-1).searchParams.get('period'), 'last_30_days');
  assert.equal(failureWavelengthsRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  // Pairs come from the data in contract order (MM before SM); longer wavelength is listed first in each bar.
  assert.deepEqual(await wavelengths.getByRole('img').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), [
    'MM 850/1300 nm, 1 failed observation: 1300 nm only 1 (100%), 850 nm only 0 (0%), Both 0 (0%)',
    'SM 1310/1550 nm, 20 failed observations: 1550 nm only 5 (25%), 1310 nm only 12 (60%), Both 3 (15%)',
  ]);
  assert.equal(await wavelengths.getByRole('img').first().locator('div').count(), 1);
  assert.equal(await wavelengths.locator('.live-unit-badge').count(), 1);
  assert.equal(await page.getByText('Failed channels by wavelength: 1550 nm only 58 percent', { exact: false }).count(), 0);
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await wavelengths.getByRole('img', { name: /^SM 1310\/1550 nm, 20 failed/ }).waitFor();
  assert.equal(await wavelengths.getByRole('img').count(), 1);
  failureWavelengthsMode = 'incomplete';
  await page.getByRole('button', { name: 'Yesterday', exact: true }).click();
  await wavelengths.getByText('Run cap reached; results are incomplete.', { exact: true }).waitFor();
  await assertText(wavelengths, '2 observations with unknown limits not counted.');
  failureWavelengthsMode = 'empty';
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await wavelengths.getByText('No failed first observations in this range.', { exact: true }).waitFor();
  failureWavelengthsMode = 'values';
  await page.getByRole('button', { name: 'Last 30 days', exact: true }).click();
  await wavelengths.getByRole('img', { name: /^MM 850\/1300 nm/ }).waitFor();
  check('Live wavelength strip shows real pairs, longer-first segments, range changes, unknown, incomplete, and empty states');

  // The following Unit lookup checks start from the demo detail fixture the demo table used to link to.
  await visit('/unit?serial=DEMO-18793');
  await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();

  await page.getByRole('button', { name: '1310 nm', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '1310 nm', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('searchbox', { name: 'Look up a unit' }).fill('NO-FIXTURE');
  await page.getByRole('heading', { name: 'No unit fixture found' }).waitFor();
  await page.getByRole('button', { name: 'Load example unit' }).click();
  await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
  await assertFocus(page.getByRole('searchbox', { name: 'Look up a unit' }));
  await page.getByRole('searchbox', { name: 'Look up a unit' }).fill('  demo-sw-001  ');
  await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
  await assertText(page.getByRole('status').filter({ hasText: 'Live reporting is off' }), 'showing the synthetic demo unit');
  assert.ok(unitSearchRequests.some(url => url.searchParams.get('q') === 'DEMO-18793'));
  check('Unit demo fallback, wavelength control, lookup empty state, and example recovery');

  await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Failures & replacements' }).click();
  const restoredLiveHistogram = failureHistogramPanel();
  await restoredLiveHistogram.getByRole('group', { name: 'Channel count' }).getByRole('button', { name: '36', exact: true }).click();
  assert.equal(await restoredLiveHistogram.getByRole('group', { name: 'Channel count' }).getByRole('button', { name: '36', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.ok((await restoredLiveHistogram.getByRole('img').getAttribute('aria-label')).includes('1 with 2'));
  check('Failures navigation and live channel-count histogram');
  await page.getByRole('button', { name: 'Refresh unit status', exact: true }).waitFor();

  const unitLink = page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('link', { name: 'Unit lookup' });
  await unitLink.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
  await assertFocus(page.locator('main'));
  await page.goBack();
  await page.getByRole('heading', { name: 'Failures & replacements', exact: true }).waitFor();
  await assertFocus(page.locator('main'));
  check('Keyboard navigation and browser-back restore focus to the page frame');

  await visit('/queries');
  assert.ok((await page.locator('body').textContent()).includes('Granted objects · dbo'));
  assert.ok((await page.locator('body').textContent()).includes('Live · test database'));
  assert.ok((await page.locator('body').textContent()).includes('Read-only · test database'));
  await page.getByRole('button', { name: /TBL IL_RUNS/ }).click();
  assert.equal(await page.getByRole('button', { name: /TBL IL_RUNS/ }).getAttribute('aria-expanded'), 'false');
  await page.getByRole('button', { name: /^Run/ }).click();
  await page.getByRole('table', { name: 'Live query results' }).waitFor();
  await assertText(page.getByRole('table', { name: 'Live query results' }), 'DEMO-MODEL-A');
  await assertText(page.getByText(/2 rows · 3 columns/), '42 ms');
  check('Connected query schema and successful live table result');

  queryResponseMode = 'truncated';
  await page.getByRole('button', { name: /^Run/ }).click();
  await page.getByText('First 2 rows; more exist.').waitFor();
  check('Query result truncation state');

  queryResponseMode = 'rejected';
  await page.getByRole('button', { name: /^Run/ }).click();
  await page.getByRole('alert').getByText('Statement rejected · forbidden_keyword:UPDATE').waitFor();
  check('Rejected query renders the fixed guard reason');

  queryResponseMode = 'sql_error';
  await page.getByRole('button', { name: /^Run/ }).click();
  await assertText(page.getByRole('alert'), 'SQL Server 208 · Invalid object name');
  await assertText(page.getByRole('alert'), '<database>.dbo.Missing');
  check('SQL error renders its number and redacted message');

  queryResponseMode = 'cancel';
  await page.getByRole('button', { name: /^Run/ }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('alert').getByText('Request cancelled in this browser. Server-side cancellation is not available.').waitFor();
  check('Query request Cancel aborts the browser fetch');

  queryResponseMode = 'success';
  await page.getByRole('button', { name: /^Run/ }).click();
  await page.getByRole('table', { name: 'Live query results' }).waitFor();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const download = await downloadEvent;
  const downloadPath = await download.path();
  assert.ok(downloadPath);
  const csv = await fs.readFile(downloadPath, 'utf8');
  assert.equal(csv, '"switch_model","runs","avg_seconds"\r\n"DEMO-MODEL-A","12","45.25"\r\n"DEMO-MODEL-B","8","51.50"');
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await page.locator('.recharts-surface').waitFor();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  check('CSV export bytes and compatible live chart');

  await page.getByRole('searchbox', { name: 'Search queries' }).fill('  lAtEsT  ');
  assert.equal(await page.locator('.q-btn').filter({ hasText: 'Latest analyses' }).count(), 1);
  await page.getByRole('searchbox', { name: 'Search queries' }).fill('NO-QUERY-FIXTURE');
  await assertText(page.getByRole('status'), 'No query titles match');
  await page.getByRole('searchbox', { name: 'Search queries' }).fill('');
  assert.ok((await page.locator('body').innerText()).includes('queries run read-only against the authorized test database through the local backend, and are not logged'.replace('queries', 'Queries')));
  check('Live query library search, labels, and no-logging footer');

  await page.getByRole('button', { name: 'Dark mode', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Light mode', exact: true }).waitFor();
  check('Theme persists on reload');

  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Light mode', exact: true }).click();
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const route of ['/', '/failures', '/unit', '/queries']) {
        await page.goto('about:blank');
        await visit(route);
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('h1').count(), 1);
        const active = page.getByRole('navigation', { name: 'Main', exact: true }).locator('[aria-current="page"]');
        assert.equal(await active.count(), 1);
        assert.equal(await active.getAttribute('href'), `#${route}`);
        assert.ok((await page.title()).includes('Light Workbench Analytics'));
        assert.equal(await page.locator('main').count(), 1);
        assert.equal(await page.locator('#preview-help').count(), 1);
        assert.ok((await page.locator('#preview-help').innerText()).includes('previews'));
        assert.ok(await page.locator('.preview-control').evaluateAll(elements => elements.every(element => element.disabled && element.getAttribute('aria-describedby') === 'preview-help')));
        const colorPairs = await page.evaluate(() => {
          const nav = document.querySelector('.main-navigation [aria-current="page"]');
          const frame = document.querySelector('.page-frame');
          const probe = document.createElement('span');
          probe.style.color = 'var(--muted)'; frame.append(probe);
          const muted = getComputedStyle(probe).color; probe.remove();
          return { navText: getComputedStyle(nav).color, navBackground: getComputedStyle(nav).backgroundColor, muted, background: getComputedStyle(document.querySelector('.app-shell')).getPropertyValue('--panel').trim() };
        });
        assert.ok(contrast(colorPairs.navText, colorPairs.navBackground) >= 4.5, `Navigation contrast ${theme}`);
        // Resolve the palette hex value to rgb for the text contrast calculation.
        const panelRgb = await page.evaluate(color => { const el = document.createElement('span'); el.style.color = color; document.body.append(el); const rgb = getComputedStyle(el).color; el.remove(); return rgb; }, colorPairs.background);
        assert.ok(contrast(colorPairs.muted, panelRgb) >= 4.5, `Muted text contrast ${theme}`);
        const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
        assert.ok(dimensions.content <= dimensions.width + 1, `Page overflow ${route} at ${width}: ${dimensions.content}`);
        await page.screenshot({ path: `${output}/${theme}-${width}-${route.slice(1) || 'overview'}.png`, fullPage: true });
        const control = route === '/' ? page.getByRole('button', { name: 'This week', exact: true })
          : route === '/failures' ? page.getByRole('group', { name: 'Channel count' }).getByRole('button', { name: 'All', exact: true })
          : route === '/unit' ? page.getByRole('searchbox', { name: 'Look up a unit' })
          : page.getByRole('searchbox', { name: 'Search queries' });
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter'); // Skip link focuses the common page frame.
        await assertFocus(page.locator('main'));
        await control.focus();
        await assertFocusRing(control);
        if (route === '/' || route === '/failures') {
          await page.keyboard.press('Space');
          assert.equal(await control.getAttribute('aria-pressed'), 'true');
        } else if (route === '/unit') {
          await page.keyboard.press('ControlOrMeta+A');
          await page.keyboard.type('demo-sw-001');
          await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
        } else {
          await page.keyboard.type('does-not-exist');
          await assertText(page.getByRole('status'), 'No query titles match');
        }
      }
    }
  }
  check('All four screens: direct routes, active navigation, keyboard focus, preview states, contrast, and responsive layout in both themes (24 screenshots)');

  await visit('/queries');
  await page.getByRole('button', { name: /^Run/ }).click();
  await page.getByRole('table', { name: 'Live query results' }).waitFor();
  await page.getByRole('button', { name: 'Chart', exact: true }).click();
  await page.locator('.recharts-surface').waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `${output}/light-390-query-chart.png`, fullPage: true });
  await visit('/unit?serial=DEMO-18804');
  await page.getByRole('heading', { name: 'No unit fixture found' }).waitFor();
  await visit('/unknown');
  await page.getByRole('heading', { name: 'Page not found' }).waitFor();
  check('Narrow query chart, unsupported unit deep link, and unknown route');

  // Isolate deliberate failed/delayed imports from the normal no-error diagnostics.
  const recoveryPage = await browser.newPage();
  let releaseImport;
  const importGate = new Promise(resolve => { releaseImport = resolve; });
  let simulateFailure = false;
  let intercepted = false;
  await recoveryPage.route('**/*', async request => {
    const pathname = new URL(request.request().url()).pathname;
    if (pathname === '/src/screens/Unit.tsx' || /\/assets\/Unit-[^/]+\.js$/.test(pathname)) {
      intercepted = true;
      await importGate;
      if (simulateFailure) { await request.fulfill({ status: 503, contentType: 'text/javascript', body: '// Deliberate browser-test failure' }); return; }
    }
    await request.continue();
  });
  try {
    await recoveryPage.goto(`${base}/#/unit`, { waitUntil: 'domcontentloaded' });
    await recoveryPage.getByRole('status').filter({ hasText: 'Loading demo screen' }).waitFor();
    assert.ok(await recoveryPage.getByRole('navigation', { name: 'Main', exact: true }).isVisible());
    assert.ok(intercepted);
    simulateFailure = true;
    releaseImport();
    await recoveryPage.getByRole('heading', { name: 'Unable to load this screen' }).waitFor();
    await recoveryPage.unrouteAll({ behavior: 'wait' });
    await recoveryPage.route('**/api/v1/units/search?*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data_source: 'not_connected' }) }));
    await recoveryPage.getByRole('button', { name: 'Reload screen' }).click();
    await recoveryPage.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
    check('Delayed route shows loading state; simulated import failure shows recovery UI and reload succeeds');
  } finally { releaseImport(); await recoveryPage.close(); }

  assert.deepEqual(errors, [], `Browser errors: ${errors.join('\n')}`);
  check('No console errors, page errors, missing assets, or failed requests in normal flows');
  await fs.writeFile(`${output}/results.json`, JSON.stringify({ base, checks, errors }, null, 2));
} finally {
  await browser.close();
}
