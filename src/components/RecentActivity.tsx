import { useMemo, useRef, useState } from 'react';
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import type { ActivityFilters, Model, RecentRun, Station } from '../types';
import { css } from '../lib/css';
import { Button } from './ui/button';
import { unitLink } from '../lib/routes';
import { liveUnitLink } from '../lib/routes';
import { formatDuration } from '../mock/presentation';
import type { RecentFinishedUnit, RecentFinishedUnitsConnectedResponse } from '../lib/api/recentFinishedUnits';

const MODELS: readonly Model[] = ['OSX-150', 'OSX-100'];
const STATIONS: readonly Station[] = ['St 1', 'St 2', 'St 3', 'St 4'];
const EMPTY_FILTERS: ActivityFilters = { search: '', model: 'all', station: 'all' };

const columns: ColumnDef<RecentRun>[] = [
  {
    accessorKey: 'unit', header: 'Unit', cell: ({ row: { original: r } }) => <>
      <a className="lnk font-mono font-semibold" href={unitLink(r.unit)}>{r.unit}</a>
      {r.tagOn && <span className="purpose-tag" title={r.tagTitle}>{r.tag}</span>}
    </>,
  },
  { accessorKey: 'cfg', header: 'Configuration' },
  { accessorKey: 'st', header: 'Station' },
  { accessorKey: 'when', header: 'Finished', enableSorting: false },
  { id: 'duration', accessorFn: r => r.durationSeconds, header: 'Duration', cell: ({ row }) => row.original.dur },
  { accessorKey: 'failed', header: 'Failed', sortingFn: (a, b) => Number(a.original.failed) - Number(b.original.failed) },
  { accessorKey: 'repl', header: 'Replaced', sortingFn: (a, b) => Number(a.original.repl) - Number(b.original.repl) },
  { id: 'il', accessorFn: r => r.ilDb, header: 'Worst IL', cell: ({ row }) => <span className="font-mono" style={{ color: row.original.ilColor }}>{row.original.il}</span> },
  { accessorKey: 'result', header: 'Result', cell: ({ row: { original: r } }) => <span className="result-chip" style={{ background: r.bg, color: r.fg }}><span aria-hidden="true">●</span>{r.result}</span> },
];

function DemoRecentActivity({ data }: { data: RecentRun[] }) {
  const searchInput = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<ActivityFilters>(EMPTY_FILTERS);
  const [sorting, setSorting] = useState<SortingState>([]);
  const { search, model, station } = filters;
  const filtered = useMemo(() => data.filter(r => (model === 'all' || r.model === model) && (station === 'all' || r.station === station)), [data, model, station]);
  const table = useReactTable({
    data: filtered, columns, state: { globalFilter: search, sorting },
    onGlobalFilterChange: (value: string) => setFilters(current => ({ ...current, search: value })), onSortingChange: setSorting,
    globalFilterFn: (row, _columnId, value: string) => row.original.unit.toLowerCase().includes(value.trim().toLowerCase()),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  return <section className="recent-activity" aria-labelledby="recent-title">
    <div className="activity-heading">
      <div>
        <h2 id="recent-title">Recently finished units</h2>
        <p id="activity-help">{sorting.length ? 'Sorted by selected column.' : 'Newest first.'} Local filters affect this table within the summary range/purpose. Detailed fixture: DEMO-18793.</p>
      </div>
      <label className="activity-search">Find a unit
        <input ref={searchInput} type="search" aria-describedby="activity-help" placeholder="Find serial, e.g. DEMO-18793" value={search} onChange={e => setFilters(current => ({ ...current, search: e.target.value }))} />
      </label>
    </div>
    <div className="activity-filters">
      <label>Activity model <select value={model} aria-describedby="activity-help" onChange={e => { const model = MODELS.find(value => value === e.target.value) ?? 'all'; setFilters(current => ({ ...current, model })); }}><option value="all">All models</option>{MODELS.map(model => <option key={model}>{model}</option>)}</select></label>
      <label>Activity station <select value={station} aria-describedby="activity-help" onChange={e => { const station = STATIONS.find(value => value === e.target.value) ?? 'all'; setFilters(current => ({ ...current, station })); }}><option value="all">All stations</option>{STATIONS.map(station => <option key={station}>{station}</option>)}</select></label>
      {(search || model !== 'all' || station !== 'all' || sorting.length > 0) && <Button variant="outline" size="sm" onClick={() => { setFilters(EMPTY_FILTERS); setSorting([]); searchInput.current?.focus(); }}>Reset activity filters</Button>}
      <span role="status">{table.getRowModel().rows.length} synthetic units</span>
    </div>
    <div className="table-scroll" role="region" aria-label="Recent activity table, scroll horizontally on narrow screens" tabIndex={0}>
      <table aria-label="Recently finished units">
        <caption className="sr-only">Small synthetic fixture list; totals do not reconcile with aggregate summary examples. Column buttons sort the visible results.</caption>
        <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope="col" aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}>
          {header.column.getCanSort() ? <button onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}</button> : flexRender(header.column.columnDef.header, header.getContext())}
        </th>)}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map(row => <tr key={row.original.unit}>{row.getVisibleCells().map(cell => <td key={cell.id} style={css('font-variant-numeric:tabular-nums')}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table>
      {table.getRowModel().rows.length === 0 && <p className="empty-state" role="status">No synthetic units match these filters.</p>}
    </div>
  </section>;
}

type LiveRow = RecentFinishedUnit & { configuration: string; station: string };

function formatFinished(value: string, extractedAt: string) {
  const date = new Date(value);
  const extracted = new Date(extractedAt);
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(date);
  const extractedKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(extracted);
  const prior = new Date(`${extractedKey}T12:00:00Z`);
  prior.setUTCDate(prior.getUTCDate() - 1);
  const priorKey = prior.toISOString().slice(0, 10);
  const time = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' }).format(date);
  if (dateKey === extractedKey) return `Today ${time}`;
  if (dateKey === priorKey) return `Yesterday ${time}`;
  return `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }).format(date)} ${time}`;
}

const RESULT_LABEL = {
  passed_no_replacement: 'Passed, no replacement',
  passed_after_replacement: 'Passed after replacement',
  unrecoverable: 'Unrecoverable',
} as const;

// Same chip colors as the demo's Passed first time / Passed after replacement / Unrecoverable.
const RESULT_COLOR = {
  passed_no_replacement: { bg: 'var(--ok-bg)', fg: 'var(--ok-fg)' },
  passed_after_replacement: { bg: 'var(--info-bg)', fg: 'var(--info-fg)' },
  unrecoverable: { bg: 'var(--bad-bg)', fg: 'var(--bad-fg)' },
} as const;

function LiveRecentActivity({ response }: { response: RecentFinishedUnitsConnectedResponse }) {
  const searchInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [model, setModel] = useState('all');
  const [station, setStation] = useState('all');
  const [sorting, setSorting] = useState<SortingState>([]);
  const models = useMemo(() => [...new Set(response.units.map(unit => unit.switch_model))].sort(), [response.units]);
  const stations = useMemo(() => [...new Set(response.units.map(unit => unit.station_number).filter((value): value is number => value !== null))].sort((a, b) => a - b), [response.units]);
  const rows = useMemo<LiveRow[]>(() => response.units.map(unit => ({
    ...unit,
    configuration: `${unit.switch_model} · ${unit.wavelength_mode} · ${unit.channel_count ?? '—'}`,
    station: unit.station_number === null ? '—' : `St ${unit.station_number}`,
  })).filter(row => (model === 'all' || row.switch_model === model) && (station === 'all' || String(row.station_number) === station)), [model, response.units, station]);
  const liveColumns = useMemo<ColumnDef<LiveRow>[]>(() => [
    { accessorKey: 'main_board_serial', header: 'Unit', cell: ({ row }) => <a className="lnk font-mono font-semibold" href={liveUnitLink(row.original.unit_id)}>{row.original.main_board_serial}</a> },
    { accessorKey: 'configuration', header: 'Configuration' },
    { accessorKey: 'station', header: 'Station' },
    { id: 'finished', accessorFn: row => Date.parse(row.finished_at_utc), header: 'Finished', cell: ({ row }) => formatFinished(row.original.finished_at_utc, response.extracted_at_utc) },
    { id: 'duration', accessorFn: row => row.total_ms ?? -1, header: 'Duration', cell: ({ row }) => row.original.total_ms === null ? <span title="No known duration">—</span> : formatDuration(row.original.total_ms / 1000) },
    { id: 'failed', accessorFn: row => row.failed_channels ?? -1, header: 'Failed', cell: ({ row }) => row.original.failed_unknown ? <span title="Unknown criteria">—</span> : row.original.failed_channels },
    { accessorKey: 'replaced_channels', header: 'Replaced' },
    { id: 'worst', accessorFn: row => row.worst_il_db === null ? -Infinity : Number(row.worst_il_db), header: 'Worst IL', cell: ({ row }) => row.original.worst_il_db === null ? '—' : <span className="font-mono" style={{ color: row.original.worst_il_over_limit ? 'var(--bad-fg)' : undefined }} title={`${row.original.worst_il_wavelength_nm} nm${row.original.worst_il_over_limit ? ' · over saved limit' : ''}`}>{Number(row.original.worst_il_db).toFixed(2)} dB</span> },
    { accessorKey: 'outcome', header: 'Result', cell: ({ row }) => <span className="result-chip" style={{ background: RESULT_COLOR[row.original.outcome].bg, color: RESULT_COLOR[row.original.outcome].fg }}><span aria-hidden="true">●</span>{RESULT_LABEL[row.original.outcome]}</span> },
  ], [response.extracted_at_utc]);
  const table = useReactTable({
    data: rows, columns: liveColumns, state: { globalFilter: search, sorting },
    onGlobalFilterChange: setSearch, onSortingChange: setSorting,
    globalFilterFn: (row, _columnId, value: string) => row.original.main_board_serial.toLowerCase().includes(value.trim().toLowerCase()),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  const reset = () => { setSearch(''); setModel('all'); setStation('all'); setSorting([]); searchInput.current?.focus(); };
  return <section className="recent-activity" aria-labelledby="recent-title">
    <div className="activity-heading">
      <div>
        <div style={css("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}><h2 id="recent-title">Recently finished units</h2><span className="live-unit-badge">Live · test database</span></div>
        <p id="activity-help">Newest first. Finished means passing, or failing with a current analysis that found no recovery; not a final manufacturing disposition. Local filters affect this table within the summary range/purpose.</p>
      </div>
      <label className="activity-search">Find a unit<input ref={searchInput} type="search" aria-describedby="activity-help" placeholder="Find serial" value={search} onChange={event => setSearch(event.target.value)} /></label>
    </div>
    <div className="activity-filters">
      <label>Activity model <select value={model} aria-describedby="activity-help" onChange={event => setModel(event.target.value)}><option value="all">All models</option>{models.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>Activity station <select value={station} aria-describedby="activity-help" onChange={event => setStation(event.target.value)}><option value="all">All stations</option>{stations.map(value => <option key={value} value={value}>St {value}</option>)}</select></label>
      {(search || model !== 'all' || station !== 'all' || sorting.length > 0) && <Button variant="outline" size="sm" onClick={reset}>Reset activity filters</Button>}
      <span role="status">{table.getRowModel().rows.length} {table.getRowModel().rows.length === 1 ? 'unit' : 'units'}</span>
    </div>
    <div className="table-scroll" role="region" aria-label="Recent activity table, scroll horizontally on narrow screens" tabIndex={0}>
      <table aria-label="Recently finished units"><caption className="sr-only">Finished units from the connected test database. Column buttons sort the visible results.</caption>
        <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} scope="col" aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}>{header.column.getCanSort() ? <button onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}</button> : flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map(row => <tr key={row.original.unit_id}>{row.getVisibleCells().map(cell => <td key={cell.id} style={css('font-variant-numeric:tabular-nums')}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table>
      {table.getRowModel().rows.length === 0 && <p className="empty-state" role="status">{response.units.length === 0 ? 'No finished units in this range.' : 'No finished units match these filters.'}</p>}
    </div>
    {(response.truncated || response.incomplete) && <div style={css("display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;font-size:11.5px;color:var(--warn-fg)")}>{response.truncated && <span>Showing the newest 100 units.</span>}{response.incomplete && <span>Bounded cohort is incomplete.</span>}</div>}
  </section>;
}

export function RecentActivity({ data, live }: { data: RecentRun[]; live?: RecentFinishedUnitsConnectedResponse | null }) {
  return live ? <LiveRecentActivity response={live} /> : <DemoRecentActivity data={data} />;
}
