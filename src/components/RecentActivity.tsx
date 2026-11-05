import { useMemo, useRef, useState } from 'react';
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import type { ActivityFilters, Model, RecentRun, Station } from '../types';
import { css } from '../lib/css';
import { Button } from './ui/button';
import { unitLink } from '../lib/routes';

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

export function RecentActivity({ data }: { data: RecentRun[] }) {
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
