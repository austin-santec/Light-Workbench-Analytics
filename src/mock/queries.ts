import { CONFIGURATIONS } from './fixtures';
import type { QueriesState } from '../types';
import type { QueriesValues, SchemaFixture } from './contracts';
import { ACCENT, formatDuration } from './presentation';

// Adapted Claude sample logic. All fixtures are synthetic, never production metrics.
export function getQueriesValues(state: QueriesState): QueriesValues {
    const accent = ACCENT;

    const qBase = 'display:block;width:100%;text-align:left;min-height:40px;padding:0 8px;border-radius:8px;border:none;cursor:pointer;font-size:13.5px;';
    const builtinFixtures: [title: string, selected: boolean][] = [
      ['Channels tested by period', false],
      ['Average test time by configuration', true],
      ['Daily channel failure rate', false],
      ['Channels replaced per failing unit', false],
      ['Unrecoverable units and reasons', false],
      ['Retest rate by station', false]
    ];
    const builtin = builtinFixtures.map(([title, on]) => ({ title, pressed: on, style: qBase + (on ? 'background:color-mix(in srgb,' + accent + ' 11%,var(--panel));color:' + accent + ';font-weight:600;' : 'background:transparent;color:var(--ink2);font-weight:500;') }));
    const team = [{ title: 'Extra port 50 failure trend', by: 'Demo operator A' }, { title: 'Retests by operator', by: 'Demo operator C' }, { title: 'MM units over 2.25 dB', by: 'Demo operator B' }];

    const SCHEMA: SchemaFixture[] = [
      ['T', 'UNITS', [['unit_id', 'bigint'], ['main_board_serial', 'nvarchar'], ['part_number', 'nvarchar'], ['front_panel_channel_count', 'int'], ['unit_model', 'nvarchar']]],
      ['T', 'SWITCHES', [['switch_id', 'bigint'], ['switch_serial', 'nvarchar'], ['switch_model', 'nvarchar'], ['physical_channel_count', 'int']]],
      ['T', 'UNIT_SWITCH_ASSIGNMENTS', [['assignment_id', 'bigint'], ['unit_id', 'bigint'], ['switch_id', 'bigint'], ['installed_at_utc', 'datetime2'], ['initial_channel_map_json', 'json']]],
      ['T', 'IL_RUNS', [['run_id', 'bigint'], ['assignment_id', 'bigint'], ['run_number', 'int'], ['run_started_at_utc', 'datetime2'], ['run_ended_at_utc', 'datetime2'], ['tested_by', 'nvarchar'], ['station_number', 'int'], ['wavelength_mode', 'SM | MM'], ['completion_status', 'varchar'], ['run_purpose', 'varchar'], ['analysis_status', 'varchar'], ['front_panel_channel_count', 'int'], ['limit_snapshot_json', 'json']]],
      ['T', 'IL_MEASUREMENTS', [['measurement_id', 'bigint'], ['run_id', 'bigint'], ['logical_channel', 'int'], ['physical_port', 'int'], ['attempt_number', 'int'], ['measurement_role', 'varchar'], ['wavelength_1_il_db', 'decimal'], ['wavelength_2_il_db', 'decimal']]],
      ['T', 'CHANNEL_REPLACEMENTS', [['replacement_id', 'bigint'], ['assignment_id', 'bigint'], ['logical_channel', 'int'], ['previous_physical_port', 'int'], ['replacement_physical_port', 'int'], ['replaced_at_utc', 'datetime2'], ['source_recommendation_id', 'bigint']]],
      ['T', 'REPLACEMENT_ANALYSES', [['analysis_id', 'bigint'], ['run_id', 'bigint'], ['analyzed_at_utc', 'datetime2'], ['result_status', 'varchar']]],
      ['T', 'REPLACEMENT_ANALYSIS_RECOMMENDATIONS', [['recommendation_id', 'bigint'], ['analysis_id', 'bigint'], ['category', 'varchar'], ['logical_channel', 'int'], ['candidate_physical_port', 'int'], ['improvement_db', 'decimal']]],
      ['V', 'vw_CurrentILMeasurements', [['run_id', 'bigint'], ['logical_channel', 'int'], ['physical_port', 'int'], ['attempt_number', 'int'], ['wavelength_1_il_db', 'decimal'], ['wavelength_2_il_db', 'decimal']]],
      ['V', 'vw_CurrentChannelMap', [['assignment_id', 'bigint'], ['logical_channel', 'int'], ['initial_physical_port', 'int'], ['effective_physical_port', 'int'], ['is_replaced', 'bit']]],
      ['V', 'vw_ConfirmedExtraPorts', [['run_id', 'bigint'], ['physical_port', 'int'], ['wavelength_1_il_db', 'decimal'], ['wavelength_2_il_db', 'decimal']]],
      ['V', 'vw_ReplacementRecommendationUsage', [['analysis_id', 'bigint'], ['run_id', 'bigint'], ['result_status', 'varchar'], ['improvement_db', 'decimal'], ['recommendation_used', 'bit']]]
    ];
    const open = state.open;
    const tables = SCHEMA.map(([k, name, cols]) => ({
      kind: k === 'T' ? 'TBL' : 'VIEW',
      kindBg: k === 'T' ? 'var(--panel2)' : 'var(--info-bg)', kindFg: k === 'T' ? 'var(--muted)' : 'var(--info-fg)',
      name, open: name === open, rot: name === open ? 'rotate(90deg)' : 'none',
      cols: cols.map(c => ({ n: c[0], t: c[1] }))
    }));

    const view = state.view;

    const D = CONFIGURATIONS;
    const maxSpc = 21;
    const rows = D.map(d => ({ model: d[0], mode: d[1], ch: String(d[2]), units: String(d[3]), sec: String(d[4]), avgSeconds: d[4], time: formatDuration(d[4]), spc: (d[4] / d[2]).toFixed(1), w: ((d[4] / d[2]) / maxSpc * 100).toFixed(0) }));

    const units = D.reduce((a, d) => a + d[3], 0);
    const stats = [
      { label: 'Units', value: units.toLocaleString('en-US'), sub: 'distinct units in range' },
      { label: 'Fastest config', value: '7m 19s', sub: 'OSX-100 · SM · 24' },
      { label: 'Slowest config', value: '15m 20s', sub: 'OSX-150 · SM · 48' },
      { label: 'Per channel, avg', value: '18.9 s', sub: 'OSX-150 runs 1.4 s slower' }
    ];

    const history = [
      { t: '08:26', title: 'Average test time by configuration', meta: '7 synthetic rows', state: 'Example', bg: 'var(--ok-bg)', fg: 'var(--ok-fg)' },
      { t: '08:19', title: 'Extra port 50 failure trend', meta: 'Illustrative history', state: 'Example', bg: 'var(--ok-bg)', fg: 'var(--ok-fg)' },
      { t: '08:11', title: 'Untitled query', meta: 'Example statement — never executed', state: 'Preview', bg: 'var(--bad-bg)', fg: 'var(--bad-fg)' }
    ];

    return { accent, builtin, team, tables, isTable: view === 'table', isChart: view === 'chart', rows, stats, history };
}
