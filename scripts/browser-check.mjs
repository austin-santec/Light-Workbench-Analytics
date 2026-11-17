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
let queryResponseMode = 'success';
let recommendationUsageMode = 'values';
let channelFailuresMode = 'values';
let stationMode = 'values';
const runActivityRequests = [];
const configurationTimingRequests = [];
const channelActivityRequests = [];
const failureRateRequests = [];
const replacementActivityRequests = [];
const unitStatusRequests = [];
const recommendationUsageRequests = [];
const channelFailuresRequests = [];
const stationSummaryRequests = [];
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
    filters: { purpose: selected, wavelength_mode: null, switch_model: null },
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
    filters: { purpose: selected, wavelength_mode: null, switch_model: null },
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
  const base = (id, status) => ({
    unit_id: id, main_board_serial: `DEMO-STATUS-${id}`, assignment_id: id + 100,
    switch_serial: `DEMO-SW-${id}`, switch_model: 'OSX-150', context_run_id: id + 200,
    status, failing_channels: [], latest_analysis: null, review_reasons: [],
  });
  const failing = (id, status, latest) => ({
    ...base(id, status), latest_analysis: latest,
    failing_channels: [{ logical_channel: id, effective_port: id + 48, wavelength_1_il_db: 2.6001, wavelength_2_il_db: 1.1 }],
  });
  const units = unitStatusMode === 'zero' ? [] : [
    failing(1, 'failing_no_measured_recovery', analysis(301, true, 0)),
    failing(2, 'failing_needs_analysis', analysis(302, false, 0)),
    failing(3, 'failing_recovery_available', analysis(303, true, 2, 'recommendations_available')),
    { ...base(4, 'review_required'), review_reasons: ['DEMO incompatible wavelength evidence.'] },
    base(5, 'not_evaluated'),
    base(6, 'passing'),
    ...(period === 'this_week' ? [base(7, 'passing'), base(8, 'passing'), base(9, 'passing')] : []),
  ];
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
    period: { key: period, start_utc, end_utc, partial }, filters: { purpose: purposes },
    classification_rule: 'strict >, run limit snapshot',
    counts,
    units,
    incomplete: unitStatusMode === 'incomplete',
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
    filters: { purpose: purposes, wavelength_mode: null, switch_model: null },
    classification_rule: 'strict >, run limit snapshot',
    totals: { failed, observed, rate: observed ? failed / observed : null, unknown_criteria: sum('unknown_criteria') },
    runs: channelFailuresMode === 'zero' ? 1 : 4,
    max_channel: maxChannel,
    channels,
    incomplete: channelFailuresMode === 'incomplete',
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
    period: { key: 'last_30_days', start_utc: '2026-10-14T07:00:00Z', end_utc: '2026-11-13T08:00:00Z', partial: false },
    filters: { purpose: purposes },
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
    period: { key: period, start_utc, end_utc, partial }, filters: { purpose: purposes },
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
await page.route('**/api/v1/reporting/channel-failures?*', async route => {
  const url = new URL(route.request().url());
  channelFailuresRequests.push(url);
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(runActivityMode === 'not_connected' ? { data_source: 'not_connected' } : channelFailuresFixture(url)),
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
  const expectedUnmountCancellation = ['/api/v1/reporting/run-activity', '/api/v1/reporting/test-time-by-configuration', '/api/v1/reporting/channel-activity', '/api/v1/reporting/failure-rate', '/api/v1/reporting/replacement-activity', '/api/v1/reporting/unit-status', '/api/v1/reporting/recommendation-usage', '/api/v1/reporting/channel-failures', '/api/v1/reporting/station-summary', '/api/v1/units/search', '/api/v1/query/schema', '/api/v1/query/execute'].includes(pathname) && request.failure()?.errorText === 'net::ERR_ABORTED';
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
const stationPanel = () => page.getByRole('heading', { name: 'Stations, last 30 days', exact: true }).locator('..').locator('..').locator('..').locator('..');
const unitOutcomesPanel = () => page.getByRole('heading', { name: 'Unit outcomes', exact: true }).locator('..').locator('..').locator('..').locator('..');
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
  assert.equal(await page.getByRole('region', { name: 'Key metrics' }).getByText('Demo', { exact: true }).count(), 3);
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
  assert.equal(stationSummaryRequests.at(-1).searchParams.has('period'), false);
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
  check('Replacement activity is honestly off and recommendation usage keeps the unchanged demo path');
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
  await downPage.route('**/api/v1/reporting/recommendation-usage?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/channel-failures?*', route => route.abort('connectionrefused'));
  await downPage.route('**/api/v1/reporting/station-summary*', route => route.abort('connectionrefused'));
  try {
    await downPage.goto(`${base}/#/`, { waitUntil: 'domcontentloaded' });
    await downPage.getByRole('region', { name: 'Run activity' }).getByText('Backend not reachable on 127.0.0.1:8000').first().waitFor();
    check('Live card backend-down state');
    await downPage.goto(`${base}/#/failures`, { waitUntil: 'domcontentloaded' });
    await downPage.getByRole('region', { name: 'Replacement activity' }).getByText('Backend not reachable on 127.0.0.1:8000').waitFor();
    check('Replacement activity backend-down state');
  } finally { await downPage.close(); }

  const databaseFailurePage = await browser.newPage({ viewport: { width: 900, height: 800 } });
  await databaseFailurePage.route('**/api/v1/reporting/replacement-activity*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'query_timeout' }),
  }));
  try {
    await databaseFailurePage.goto(`${base}/#/failures`, { waitUntil: 'domcontentloaded' });
    await databaseFailurePage.getByRole('region', { name: 'Replacement activity' }).getByText('Database check failed').waitFor();
    await databaseFailurePage.getByText('query_timeout', { exact: true }).waitFor();
    check('Replacement activity sanitized database-failure state');
  } finally { await databaseFailurePage.close(); }

  runActivityMode = 'connected';
  await page.reload();
  await page.locator('h1').waitFor();
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
  await assertText(page.getByRole('button', { name: /^Engineering / }), '3');
  assert.ok((await page.getByRole('button', { name: /^Engineering / }).innerText()).includes('3'));
  await page.getByRole('region', { name: 'Key metrics' }).getByText('Live · test database', { exact: true }).first().waitFor();
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '1,018 attempts · 21 units');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '5 of 100 first channel observations · strict > run limits');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '2 first observations excluded: unknown criteria');
  assert.equal(await page.getByRole('region', { name: 'Key metrics' }).getByText('Live · test database', { exact: true }).count(), 3);
  await assertText(page.getByRole('region', { name: 'Key metrics' }), 'currently failing, no measured recovery');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '+ 1 need analysis · 1 recovery available');
  const liveUnitOutcomes = unitOutcomesPanel();
  await assertText(liveUnitOutcomes, 'Current status of 6 units tested today.');
  await liveUnitOutcomes.getByText('Live · test database', { exact: true }).waitFor();
  for (const label of ['Passing', 'Recovery available', 'Needs analysis', 'No measured recovery', 'Review required', 'Not evaluated']) {
    const row = liveUnitOutcomes.getByText(label, { exact: true }).locator('..').locator('..');
    await assertText(row, '1');
    await assertText(row, '16.7%');
  }
  assert.equal(await liveUnitOutcomes.getByRole('img', { name: 'Current unit status: 1 passing, 1 recovery available, 1 needs analysis, 1 no measured recovery, 1 review required, 1 not evaluated' }).count(), 1);
  await liveUnitOutcomes.getByText('Current measured status at extraction time. Not a first-pass yield or a final scrap decision.', { exact: true }).waitFor();
  const wavelengthDemo = liveUnitOutcomes.getByText('Demo', { exact: true });
  await wavelengthDemo.waitFor();
  assert.equal(await wavelengthDemo.getAttribute('title'), 'Example only; not from the test database.');
  assert.ok((await liveUnitOutcomes.textContent()).includes('Live · test database'));

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
  await liveStations.getByText('No station activity in the last 30 days.', { exact: true }).waitFor();
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
  assert.equal(await page.getByRole('img', { name: /^Live bar chart of channels/ }).locator('rect').count(), 31);
  const liveFailureChart = page.getByRole('img', { name: /^Live daily first-observation run-channel failure rate/ });
  await liveFailureChart.waitFor();
  assert.equal(await liveFailureChart.locator('path').count(), 3);
  await assertText(page.getByText('First observation per run-channel; retest runs have their own first observations.'), 'Pacific dates');
  assert.equal(failureRateRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
  await assertText(page.getByText('Thirty complete local dates plus today in Pacific time; today is partial.'), 'Pacific time');
  check('Synthetic connected channel activity and Q02 tile/chart, null gaps, criteria note, labels, and refresh');

  await visit('/failures');
  await replacementPanel.getByText('Channels replaced').waitFor();
  await assertText(replacementPanel, 'of which production: 24');
  await assertText(replacementPanel, '48 events / 24 units');
  await assertText(replacementPanel, 'no related run recorded');
  await assertText(replacementPanel, 'Related run since voided/superseded: 4');
  await assertText(replacementPanel, 'Administrative-error exclusions: 0');
  assert.equal(await replacementPanel.getByRole('img', { name: /Daily replacement events/ }).locator('span').count(), 31);
  await replacementPanel.getByRole('button', { name: 'Today', exact: true }).click();
  await assertText(replacementPanel, '12 events / 6 units');
  const liveUnitTable = page.getByRole('table', { name: 'Unrecoverable units' });
  await liveUnitTable.getByText('DEMO-STATUS-1').waitFor();
  await assertText(liveUnitTable, 'No measured recovery');
  await assertText(liveUnitTable, 'Needs analysis');
  await assertText(liveUnitTable, 'Recovery available');
  assert.equal(unitStatusRequests.at(-1).searchParams.get('period'), 'today');
  assert.equal(unitStatusRequests.at(-1).searchParams.getAll('purpose').join(','), 'production');
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
  await page.getByRole('button', { name: 'Refresh unit status' }).click();
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
  check('Live counts combine across selected purposes; timing is refused for partial combinations and restored for all-purpose request');
  await page.getByRole('button', { name: 'Back to production only' }).click();
  await liveCard.getByText('Runs started').locator('..').getByText('2', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Production / }).click();
  assert.equal(await page.getByRole('button', { name: /^Production / }).getAttribute('aria-pressed'), 'true');
  check('Range and purpose filters update summary; final purpose cannot be deselected');

  await page.getByRole('button', { name: /OSX-150 SM 36 ch/ }).click();
  assert.ok((await page.getByRole('img', { name: /^Histogram of/ }).getAttribute('aria-label')).includes('36 channels'));
  check('Configuration selection updates histogram');
  assert.equal(await page.getByRole('img', { name: /^Live daily first-observation/ }).locator('path').last().getAttribute('d'), productionFailureTrend);
  await page.getByRole('button', { name: 'Yesterday', exact: true }).focus();
  await page.keyboard.press('Space');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '2,520');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await assertText(page.getByRole('region', { name: 'Key metrics' }), '8,184');
  check('Skip link, keyboard range selection, visible focus, and restored production Q02 trend');

  const table = page.getByRole('table', { name: 'Recently finished units' });
  await page.getByLabel('Activity model').selectOption('OSX-100');
  assert.ok((await table.locator('tbody').innerText()).includes('OSX-100'));
  assert.ok(!(await table.locator('tbody').innerText()).includes('OSX-150'));
  await page.getByLabel('Activity model').selectOption({ label: 'All models' });
  await page.getByLabel('Activity station').selectOption('St 2');
  assert.ok(!(await table.locator('tbody').innerText()).includes('St 1'));
  await page.getByLabel('Activity station').selectOption({ label: 'All stations' });
  await page.getByRole('button', { name: 'Unit', exact: true }).click();
  assert.equal(await table.locator('th').first().getAttribute('aria-sort'), 'ascending');
  await page.getByRole('searchbox', { name: 'Find a unit' }).fill('missing');
  await assertText(page.getByRole('status').filter({ hasText: 'No synthetic' }), 'No synthetic units');
  await page.getByRole('button', { name: 'Reset activity filters' }).focus();
  await page.keyboard.press('Enter');
  await assertFocus(page.getByRole('searchbox', { name: 'Find a unit' }));
  assert.equal(await table.locator('tbody tr').count(), 8);
  await page.getByRole('searchbox', { name: 'Find a unit' }).fill('  demo-18793  ');
  assert.equal(await table.locator('tbody tr').count(), 1);
  await table.getByRole('link', { name: 'DEMO-18793' }).click();
  await page.getByRole('heading', { name: 'DEMO-18793', exact: true }).waitFor();
  check('Activity search, model/station filters, sort, empty state, and matching detail link');

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
  await page.getByRole('button', { name: '24 ch', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '24 ch', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.ok((await page.getByRole('img', { name: /^Histogram of failed/ }).getAttribute('aria-label')).includes('24-channel'));
  check('Failures navigation and channel-count histogram');
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
          : route === '/failures' ? page.getByRole('button', { name: '24 ch', exact: true })
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
