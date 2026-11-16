import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';

import { LiveQueryChart } from '../components/QueryChart';
import { PreviewButton } from '../components/PreviewControl';
import { SegmentedControl } from '../components/SegmentedControl';
import { css } from '../lib/css';
import { executeQuery, QueryConsoleError } from '../lib/api/queryConsole';
import type { QueryCell, QueryExecuteConnected, QuerySchemaConnected } from '../lib/api/queryConsole';
import { RESULT_VIEWS } from '../mock/presentation';

const DRAFT_KEY = 'lwa-query-console-draft';
const HISTORY_KEY = 'lwa-query-console-history';

const EXAMPLES = [
  {
    title: 'Average test time by configuration',
    sql: `SELECT
    s.switch_model,
    r.wavelength_mode,
    r.front_panel_channel_count AS channels,
    COUNT_BIG(*) AS runs,
    AVG(CAST(t.elapsed_ms AS decimal(18,2))) / 1000.0 AS avg_seconds
FROM dbo.IL_RUNS AS r
JOIN dbo.UNIT_SWITCH_ASSIGNMENTS AS a ON a.assignment_id = r.assignment_id
JOIN dbo.SWITCHES AS s ON s.switch_id = a.switch_id
JOIN dbo.vw_RunTimingSummary AS t ON t.run_id = r.run_id
WHERE r.run_ended_at_utc IS NOT NULL
  AND r.run_started_at_utc >= DATEADD(DAY, -30, SYSUTCDATETIME())
GROUP BY s.switch_model, r.wavelength_mode, r.front_panel_channel_count
ORDER BY s.switch_model, r.wavelength_mode, channels;`,
  },
  {
    title: 'Channels tested per day · last 30 days',
    sql: `SELECT
    CONVERT(date, m.written_at_utc) AS test_date,
    COUNT_BIG(DISTINCT m.measurement_id) AS accepted_attempts
FROM dbo.IL_MEASUREMENTS AS m
WHERE m.measurement_role = 'logical_channel'
  AND m.written_at_utc >= DATEADD(DAY, -30, SYSUTCDATETIME())
GROUP BY CONVERT(date, m.written_at_utc)
ORDER BY test_date;`,
  },
  {
    title: 'Recent runs',
    sql: `SELECT TOP (100)
    run_id,
    run_number,
    run_started_at_utc,
    run_ended_at_utc,
    wavelength_mode,
    completion_status,
    run_purpose,
    analysis_status
FROM dbo.IL_RUNS
ORDER BY run_started_at_utc DESC, run_id DESC;`,
  },
  {
    title: 'Replacements per day',
    sql: `SELECT
    CONVERT(date, replaced_at_utc) AS replacement_date,
    COUNT_BIG(*) AS replacement_events
FROM dbo.CHANNEL_REPLACEMENTS
WHERE replaced_at_utc >= DATEADD(DAY, -30, SYSUTCDATETIME())
GROUP BY CONVERT(date, replaced_at_utc)
ORDER BY replacement_date;`,
  },
  {
    title: 'Latest analyses',
    sql: `SELECT TOP (100)
    analysis_id,
    run_id,
    analyzed_at_utc,
    result_status
FROM dbo.REPLACEMENT_ANALYSES
ORDER BY analyzed_at_utc DESC, analysis_id DESC;`,
  },
] as const;

type HistoryStatus = 'success' | 'rejected' | 'error' | 'cancelled';
interface HistoryItem {
  time: string;
  firstLine: string;
  sql: string;
  rowCount: number | null;
  status: HistoryStatus;
}

function readDraft(): string {
  try {
    return localStorage.getItem(DRAFT_KEY) || EXAMPLES[0].sql;
  } catch {
    return EXAMPLES[0].sql;
  }
}

function readHistory(): HistoryItem[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is HistoryItem => typeof item === 'object' && item !== null
      && typeof (item as HistoryItem).time === 'string'
      && typeof (item as HistoryItem).firstLine === 'string'
      && typeof (item as HistoryItem).sql === 'string'
      && ((item as HistoryItem).rowCount === null || Number.isInteger((item as HistoryItem).rowCount))
      && ['success', 'rejected', 'error', 'cancelled'].includes((item as HistoryItem).status)).slice(0, 20);
  } catch {
    return [];
  }
}

function firstLine(sql: string): string {
  return sql.split(/\r?\n/, 1)[0]?.trim().slice(0, 120) || 'Untitled query';
}

function cellText(value: string | number | boolean | null): string {
  return value === null ? '' : String(value);
}

function csvCell(value: string | number | boolean | null): string {
  return `"${cellText(value).replace(/"/g, '""')}"`;
}

function errorText(error: unknown): string {
  if (!(error instanceof QueryConsoleError)) return 'The query request could not be completed.';
  if (error.kind === 'rejected') return `Statement rejected · ${error.detail?.reason || 'not_select'}`;
  if (error.kind === 'query_failed') {
    const number = error.detail?.sqlErrorNumber == null ? '' : `SQL Server ${error.detail.sqlErrorNumber} · `;
    return `${number}${error.detail?.message || 'Query failed.'}`;
  }
  if (error.kind === 'database') return `Database check failed · ${error.detail?.code || 'read_failed'}`;
  if (error.kind === 'unreachable') return 'Local backend not reachable.';
  return 'The query response was invalid.';
}

export function LiveQueries({ schema }: { schema: QuerySchemaConnected }) {
  const [search, setSearch] = useState('');
  const [sql, setSql] = useState(readDraft);
  const [selectedTitle, setSelectedTitle] = useState<string>(EXAMPLES[0].title);
  const [openObject, setOpenObject] = useState('IL_RUNS');
  const [view, setView] = useState<'table' | 'chart'>('table');
  const [result, setResult] = useState<QueryExecuteConnected | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(readHistory);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [notice, setNotice] = useState('');
  const requestRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, sql); } catch { /* Storage can be unavailable. */ }
  }, [sql]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const matchingExamples = EXAMPLES.filter(example => example.title.toLowerCase().includes(search.trim().toLowerCase()));
  const chartIndexes = useMemo(() => {
    if (!result) return null;
    const labelIndex = result.columns.findIndex(column => ['string', 'date', 'datetime'].includes(column.type));
    const numericIndex = result.columns.findIndex(column => ['integer', 'decimal', 'float'].includes(column.type));
    return labelIndex >= 0 && numericIndex >= 0 ? { labelIndex, numericIndex } : null;
  }, [result]);
  const resultColumns = useMemo<ColumnDef<QueryCell[]>[]>(() => result?.columns.map((column, index) => ({
    id: String(index),
    accessorFn: row => row[index],
    header: column.name,
  })) || [], [result]);
  const resultTable = useReactTable({
    data: result?.rows || [],
    columns: resultColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  function saveHistory(item: HistoryItem) {
    setHistory(current => {
      const next = [item, ...current].slice(0, 20);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* Storage can be unavailable. */ }
      return next;
    });
  }

  function updateCursor() {
    const element = textareaRef.current;
    if (!element) return;
    const before = element.value.slice(0, element.selectionStart);
    const lines = before.split('\n');
    setCursor({ line: lines.length, column: (lines.at(-1)?.length || 0) + 1 });
  }

  async function runQuery() {
    if (running || !sql.trim()) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setRunning(true);
    setError(null);
    setNotice('');
    try {
      const response = await executeQuery(sql, controller.signal);
      if (response.data_source === 'not_connected') {
        setError('Reporting is no longer connected. Reload to return to the demo.');
        saveHistory({ time: new Date().toISOString(), firstLine: firstLine(sql), sql, rowCount: null, status: 'error' });
      } else {
        setResult(response);
        setView('table');
        saveHistory({ time: response.executed_at_utc, firstLine: firstLine(sql), sql, rowCount: response.row_count, status: 'success' });
      }
    } catch (caught) {
      if (controller.signal.aborted) {
        setError('Request cancelled in this browser. Server-side cancellation is not available.');
        saveHistory({ time: new Date().toISOString(), firstLine: firstLine(sql), sql, rowCount: null, status: 'cancelled' });
      } else {
        setError(errorText(caught));
        saveHistory({ time: new Date().toISOString(), firstLine: firstLine(sql), sql, rowCount: null, status: caught instanceof QueryConsoleError && caught.kind === 'rejected' ? 'rejected' : 'error' });
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setRunning(false);
    }
  }

  function copyTsv() {
    if (!result) return;
    const text = [
      result.columns.map(column => column.name).join('\t'),
      ...result.rows.map(row => row.map(cellText).join('\t')),
    ].join('\n');
    void navigator.clipboard.writeText(text).then(() => setNotice('Copied TSV to clipboard.'), () => setNotice('Clipboard access was unavailable.'));
  }

  function exportCsv() {
    if (!result) return;
    const content = [
      result.columns.map(column => csvCell(column.name)).join(','),
      ...result.rows.map(row => row.map(csvCell).join(',')),
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'light-workbench-query.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <>
    <header style={css('display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px')}>
      <div style={css('display:flex;flex-direction:column;gap:4px')}>
        <div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}>
          <h1 style={css('margin:0;font-size:28px;line-height:1.15;font-weight:650;letter-spacing:-0.02em')}>Query console</h1>
          <span style={css('font-size:11.5px;font-weight:650;padding:3px 8px;border-radius:999px;background:var(--ok-bg);color:var(--ok-fg)')}>Live · test database</span>
          <span style={css('font-size:11.5px;font-weight:650;padding:3px 8px;border-radius:999px;background:var(--panel2);color:var(--ink2)')}>Read-only</span>
        </div>
        <p style={css('margin:0;font-size:13.5px;color:var(--muted);max-width:760px')}>Run one bounded SELECT or WITH statement through the local backend using the authorized read-only identity.</p>
      </div>
    </header>

    <div style={css('display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start')}>
      <aside aria-label="Query library" style={css('flex:1 1 270px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 10px;display:flex;flex-direction:column;gap:16px')}>
        <label style={css('margin:0 4px;display:flex;align-items:center;gap:8px;min-height:40px;padding:0 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--muted);font-size:13px')}>
          <span aria-hidden="true">⌕</span><span className="sr-only">Search queries</span>
          <input type="search" aria-label="Search queries" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search queries" style={css('border:none;background:transparent;outline:none;width:100%;font-size:13px;color:var(--ink)')} />
        </label>
        <p className="preview-note">Search filters the built-in examples by title.</p>
        {matchingExamples.length === 0 && <p role="status" className="empty-state">No query titles match your search.</p>}
        <div style={css('display:flex;flex-direction:column;gap:1px')}>
          <span style={css('padding:0 8px 5px;font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase')}>Built-in metrics</span>
          {matchingExamples.map(example => <button key={example.title} type="button" className="q-btn" aria-pressed={selectedTitle === example.title} onClick={() => { setSelectedTitle(example.title); setSql(example.sql); setError(null); }} style={css(`display:block;width:100%;text-align:left;min-height:40px;padding:0 8px;border-radius:8px;border:none;cursor:pointer;font-size:13.5px;${selectedTitle === example.title ? 'background:color-mix(in srgb,var(--accent) 11%,var(--panel));color:var(--accent-ink);font-weight:600' : 'background:transparent;color:var(--ink2);font-weight:500'}`)}>{example.title}</button>)}
        </div>
        <div style={css('display:flex;flex-direction:column;gap:4px')}>
          <span style={css('padding:0 8px 5px;font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase')}>Team queries</span>
          <span style={css('padding:5px 8px;font-size:12.5px;color:var(--muted)')}>Saved queries are not available yet.</span>
        </div>
        <div style={css('display:flex;flex-direction:column;gap:1px;padding-top:12px;border-top:1px solid var(--line2)')}>
          <span style={css('padding:0 8px 5px;font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase')}>Granted objects · dbo</span>
          <span style={css('padding:0 8px 5px;font-size:11.5px;color:var(--muted)')}>Reviewed grant contract; not a live catalog read.</span>
          {schema.objects.map(object => <Fragment key={object.name}>
            <button type="button" className="q-btn" aria-controls={`schema-${object.name}`} aria-expanded={openObject === object.name} onClick={() => setOpenObject(current => current === object.name ? '' : object.name)} style={css('display:flex;align-items:center;gap:7px;width:100%;text-align:left;min-height:34px;padding:0 8px;border-radius:7px;border:none;background:transparent;cursor:pointer;font-family:\'Geist Mono\',monospace;font-size:12.5px;color:var(--ink2)')}>
              <span aria-hidden="true" style={css(`display:inline-block;width:10px;color:var(--muted);transform:${openObject === object.name ? 'rotate(90deg)' : 'none'}`)}>›</span>
              <span style={css(`font-size:10px;font-weight:600;padding:0 4px;border-radius:3px;background:${object.kind === 'table' ? 'var(--panel2)' : 'var(--info-bg)'};color:${object.kind === 'table' ? 'var(--muted)' : 'var(--info-fg)'};font-family:'Geist',sans-serif`)}>{object.kind === 'table' ? 'TBL' : 'VIEW'}</span>
              {object.name}
            </button>
            <div id={`schema-${object.name}`} hidden={openObject !== object.name} style={css('display:flex;flex-direction:column;padding:2px 0 6px 34px')}>
              {object.columns.map(column => <span key={column} style={css('padding:3px 8px 3px 0;color:var(--ink);font-family:\'Geist Mono\',monospace;font-size:12px')}>{column}</span>)}
            </div>
          </Fragment>)}
        </div>
      </aside>

      <div style={css('flex:999 1 600px;min-width:0;display:flex;flex-direction:column;gap:12px')}>
        <section style={css('background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column')}>
          <div style={css('display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line2)')}>
            <div style={css('display:flex;flex-direction:column;gap:2px')}><div style={css('display:flex;align-items:center;gap:8px;flex-wrap:wrap')}><h2 style={css('margin:0;font-size:16px;font-weight:600')}>{selectedTitle}</h2><span style={css('font-size:11.5px;font-weight:600;padding:2px 7px;border-radius:5px;background:var(--panel2);border:1px solid var(--line2);color:var(--muted)')}>Built-in</span></div><span style={css('font-size:12.5px;color:var(--muted)')}>One read-only statement · no parameters · results capped by the backend.</span></div>
            <div style={css('display:flex;flex-wrap:wrap;gap:8px')}>
              <PreviewButton type="button" style={css('min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;font-size:13.5px')}>Save as…</PreviewButton>
              <PreviewButton type="button" style={css('min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;font-size:13.5px')}>Pin to Overview</PreviewButton>
              {running ? <button type="button" onClick={() => requestRef.current?.abort()} style={css('min-height:40px;padding:0 16px;border-radius:9px;border:1px solid var(--bad-fg);background:var(--bad-bg);color:var(--bad-fg);font-weight:600;font-size:13.5px;cursor:pointer')}>Cancel</button> : <button type="button" onClick={() => void runQuery()} disabled={!sql.trim()} style={css('min-height:40px;padding:0 16px;border-radius:9px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-weight:600;font-size:13.5px;cursor:pointer;display:inline-flex;align-items:center;gap:8px')}>Run <span style={css('font-size:11px;font-weight:500;opacity:0.85;font-family:\'Geist Mono\',monospace')}>Ctrl ↵</span></button>}
            </div>
          </div>
          <textarea ref={textareaRef} aria-label="SQL query" value={sql} onChange={event => { setSql(event.target.value); updateCursor(); }} onSelect={updateCursor} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void runQuery(); } }} spellCheck={false} style={css('box-sizing:border-box;width:100%;min-height:330px;resize:vertical;border:0;padding:16px 20px;background:var(--code);color:var(--ink);font-family:\'Geist Mono\',monospace;font-size:13px;line-height:1.75;outline-offset:-3px')} />
          {error && <div role="alert" style={css('padding:10px 16px;background:var(--bad-bg);border-top:1px solid color-mix(in srgb,var(--bad-fg) 35%,transparent);color:var(--bad-fg);font-size:12.5px;font-family:\'Geist Mono\',monospace;overflow-wrap:anywhere')}>{error}</div>}
          <div style={css('display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;padding:9px 16px;background:var(--panel2);border-top:1px solid var(--line2);font-size:12px;color:var(--muted)')}>
            <span style={css('color:var(--ok-fg);font-weight:600')}>Read-only · test database</span>
            {running && <span role="status">Running…</span>}
            {result && <><span>{result.elapsed_ms} ms</span><span>{result.row_count.toLocaleString()} rows</span>{result.truncated && <span>Truncated</span>}</>}
            <span style={css('margin-left:auto')}>Ln {cursor.line}, Col {cursor.column}</span>
          </div>
          <p style={css('margin:0;padding:9px 16px;background:var(--panel2);border-top:1px solid var(--line2);font-size:11.5px;color:var(--muted)')}>Cancel stops this browser request only; server-side cancellation is not available.</p>
        </section>

        <section style={css('background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:14px')}>
          <div style={css('display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px')}>
            <div><h2 style={css('margin:0;font-size:16px;font-weight:600')}>Results</h2><span style={css('font-size:12.5px;color:var(--muted)')}>{result ? `${result.row_count.toLocaleString()} rows · ${result.columns.length} columns · ${result.elapsed_ms} ms` : 'Run a query to see live results.'}</span></div>
            <div style={css('display:flex;flex-wrap:wrap;gap:8px;align-items:center')}>
              <SegmentedControl label="Result view" options={RESULT_VIEWS} value={view} onChange={next => setView(next as 'table' | 'chart')} size="results" describedBy="query-result-scope" disabledValues={result && chartIndexes ? [] : ['chart']} />
              <button type="button" disabled={!result} onClick={copyTsv} style={css('min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;font-size:13.5px')}>Copy</button>
              <button type="button" disabled={!result} onClick={exportCsv} style={css('min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;font-size:13.5px')}>Export CSV</button>
            </div>
          </div>
          <p id="query-result-scope" className="preview-note">Table shows every returned row. Chart uses the first label and numeric columns when available.</p>
          {notice && <p role="status" className="preview-note">{notice}</p>}
          {result?.truncated && <p style={css('margin:0;padding:9px 11px;border-radius:8px;background:var(--info-bg);color:var(--info-fg);font-size:12.5px')}>First {result.row_count.toLocaleString()} rows; more exist.</p>}
          {result?.multiple_result_sets && <p style={css('margin:0;color:var(--bad-fg);font-size:12.5px')}>Only the first result set is shown.</p>}
          {result && view === 'table' && <div className="table-scroll" role="region" tabIndex={0} aria-label="Live query results table, scroll horizontally on narrow screens"><table aria-label="Live query results" style={css('width:100%;min-width:max-content;border-collapse:collapse;font-family:\'Geist Mono\',monospace;font-size:12.5px;font-variant-numeric:tabular-nums')}><thead>{resultTable.getHeaderGroups().map(headerGroup => <tr key={headerGroup.id}>{headerGroup.headers.map(header => { const column = result.columns[Number(header.column.id)]; return <th key={header.id} scope="col" style={css(`padding:8px 10px;border-bottom:1px solid var(--line);color:var(--muted);font-weight:600;text-align:${['integer', 'decimal', 'float'].includes(column?.type || '') ? 'right' : 'left'};white-space:nowrap`)}>{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}</th>; })}</tr>)}</thead><tbody>{resultTable.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell => { const value = cell.getValue<QueryCell>(); const column = result.columns[Number(cell.column.id)]; return <td key={cell.id} style={css(`padding:8px 10px;border-bottom:1px solid var(--line2);text-align:${['integer', 'decimal', 'float'].includes(column?.type || '') ? 'right' : 'left'};white-space:nowrap;max-width:500px;overflow:hidden;text-overflow:ellipsis`)} title={cellText(value)}>{value === null ? 'NULL' : cellText(value)}</td>; })}</tr>)}</tbody></table></div>}
          {result && view === 'chart' && chartIndexes && <LiveQueryChart rows={result.rows} labelIndex={chartIndexes.labelIndex} numericIndex={chartIndexes.numericIndex} numericName={result.columns[chartIndexes.numericIndex]?.name || 'value'} />}
          {(!result || !chartIndexes) && <p className="empty-state">Chart needs at least one string/date column and one numeric column.</p>}
        </section>

        <section style={css('background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 18px;display:flex;flex-direction:column;gap:6px')}>
          <h2 style={css('margin:0 0 4px;font-size:14px;font-weight:600')}>History</h2>
          {history.length === 0 && <p className="empty-state">No executions in this browser yet.</p>}
          {history.map((item, index) => <button key={`${item.time}-${index}`} type="button" onClick={() => { setSql(item.sql); setSelectedTitle('History query'); }} style={css('display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;width:100%;padding:8px 0;border:0;border-top:1px solid var(--line2);background:transparent;color:var(--ink);font-size:13px;text-align:left;cursor:pointer')}><span style={css('font-family:\'Geist Mono\',monospace;color:var(--muted);min-width:68px')}>{new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span style={css('flex:1 1 240px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{item.firstLine}</span><span style={css('color:var(--muted)')}>{item.rowCount == null ? '—' : `${item.rowCount.toLocaleString()} rows`}</span><span style={css(`font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:${item.status === 'success' ? 'var(--ok-bg)' : 'var(--bad-bg)'};color:${item.status === 'success' ? 'var(--ok-fg)' : 'var(--bad-fg)'}`)}>{item.status}</span></button>)}
        </section>
      </div>
    </div>
    <footer style={css('font-size:12px;color:var(--muted);line-height:1.55;max-width:900px')}>Queries run read-only against the authorized test database through the local backend, and are not logged.</footer>
  </>;
}
