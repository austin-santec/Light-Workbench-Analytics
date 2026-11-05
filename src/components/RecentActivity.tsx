import { useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import type { RecentRun } from '../types';
import { css } from '../lib/css';

const columns: ColumnDef<RecentRun>[] = [
  {
    accessorKey: 'unit', header: 'Unit', cell: ({ row: { original: r } }) => <>
      <a className="lnk font-mono font-semibold" href={`#/unit?serial=${encodeURIComponent(r.unit)}`}>{r.unit}</a>
      {r.tagOn && <span className="purpose-tag" title={r.tagTitle}>{r.tag}</span>}
    </>,
  },
  { accessorKey: 'cfg', header: 'Configuration' },
  { accessorKey: 'st', header: 'Station' },
  { accessorKey: 'when', header: 'Finished', enableSorting: false },
  { id: 'duration', accessorFn: r => { const parts = r.dur.match(/\d+/g)!.map(Number); return parts[0] * 60 + parts[1]; }, header: 'Duration', cell: ({ row }) => row.original.dur },
  { accessorKey: 'failed', header: 'Failed', sortingFn: (a, b) => Number(a.original.failed) - Number(b.original.failed) },
  { accessorKey: 'repl', header: 'Replaced', sortingFn: (a, b) => Number(a.original.repl) - Number(b.original.repl) },
  { id: 'il', accessorFn: r => parseFloat(r.il), header: 'Worst IL', cell: ({ row }) => <span className="font-mono" style={{ color: row.original.ilColor }}>{row.original.il}</span> },
  { accessorKey: 'result', header: 'Result', cell: ({ row: { original: r } }) => <span className="result-chip" style={{ background: r.bg, color: r.fg }}><span aria-hidden="true">●</span>{r.result}</span> },
];

export function RecentActivity({ data }: { data: RecentRun[] }) {
  const [search, setSearch] = useState('');
  const [model, setModel] = useState('All models');
  const [station, setStation] = useState('All stations');
  const [sorting, setSorting] = useState<SortingState>([]);
  const filtered = useMemo(() => data.filter(r => (model === 'All models' || r.cfg.startsWith(model)) && (station === 'All stations' || r.st === station)), [data, model, station]);
  const table = useReactTable({
    data: filtered, columns, state: { globalFilter: search, sorting },
    onGlobalFilterChange: setSearch, onSortingChange: setSorting,
    globalFilterFn: (row, _columnId, value: string) => row.original.unit.toLowerCase().includes(value.toLowerCase()),
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(),
  });
  return <section className="recent-activity" aria-labelledby="recent-title">
    <div className="activity-heading">
      <div>
        <h2 id="recent-title">Recently finished units</h2>
        <p>Newest first. Filters below affect this table. Detailed fixture: DEMO-18793.</p>
      </div>
      <label className="activity-search">Find a unit
        <input type="search" placeholder="Find serial, e.g. DEMO-18793" value={search} onChange={e => setSearch(e.target.value)} />
      </label>
    </div>
    <div className="activity-filters">
      <label>Activity model <select value={model} onChange={e => setModel(e.target.value)}><option>All models</option><option>OSX-150</option><option>OSX-100</option></select></label>
      <label>Activity station <select value={station} onChange={e => setStation(e.target.value)}><option>All stations</option>{[1, 2, 3, 4].map(n => <option key={n}>St {n}</option>)}</select></label>
      <span role="status">{table.getRowModel().rows.length} synthetic units</span>
    </div>
    <div className="table-scroll">
      <table aria-label="Recently finished units">
        <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => <th key={header.id} aria-sort={header.column.getIsSorted() === 'asc' ? 'ascending' : header.column.getIsSorted() === 'desc' ? 'descending' : undefined}>
          {header.column.getCanSort() ? <button onClick={header.column.getToggleSortingHandler()}>{flexRender(header.column.columnDef.header, header.getContext())}{header.column.getIsSorted() === 'asc' ? ' ↑' : header.column.getIsSorted() === 'desc' ? ' ↓' : ''}</button> : flexRender(header.column.columnDef.header, header.getContext())}
        </th>)}</tr>)}</thead>
        <tbody>{table.getRowModel().rows.map(row => <tr key={row.original.unit}>{row.getVisibleCells().map(cell => <td key={cell.id} style={css('font-variant-numeric:tabular-nums')}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
      </table>
      {table.getRowModel().rows.length === 0 && <p className="empty-state" role="status">No synthetic units match these filters.</p>}
    </div>
  </section>;
}
