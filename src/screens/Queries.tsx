import { RESULT_VIEWS } from '../mock/presentation';
import { PreviewButton, PreviewInput, PreviewSelect } from '../components/PreviewControl';
import { SegmentedControl } from '../components/SegmentedControl';
import { Fragment, useState } from 'react';
import { QueryChart } from '../components/QueryChart';
import { css } from '../lib/css';
import { getQueriesValues } from '../mock/queries';
import type { QueriesState } from '../types';

export default function Queries() {
 const [search, setSearch] = useState('');
 const [state, setState] = useState<QueriesState>({ view: 'table', open: 'IL_RUNS' });
 const values = getQueriesValues(state);
 const { accent, builtin, team, tables, isTable, isChart, rows, stats, history } = values;
 return (<>

    <header style={css("display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px")}>
      <div style={css("display:flex;flex-direction:column;gap:4px")}>
        <h1 style={css("margin:0;font-size:28px;line-height:1.15;font-weight:650;letter-spacing:-0.02em")}>Query console</h1>
        <p style={css("margin:0;font-size:13.5px;color:var(--muted);max-width:680px")}>Explore the original query console design with synthetic results. SQL and schema are illustrative; execution and saved reports are future milestones.</p>
      </div>
    </header>

    <div style={css("display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start")}>

      <aside aria-label="Query library" style={css("flex:1 1 270px;max-width:100%;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 10px;display:flex;flex-direction:column;gap:16px")}>
        <div style={css("display:flex;gap:8px;padding:0 4px")}>
          <label style={css("flex:1;display:flex;align-items:center;gap:8px;min-height:40px;padding:0 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel2);color:var(--muted);font-size:13px")}>
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round")}><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M15.5 15.5L21 21"></path></svg>
            <span style={css("position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)")}>Search queries</span>
            <input type="search" aria-describedby="query-library-help" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search queries" style={css("border:none;background:transparent;outline:none;width:100%;font-size:13px;color:var(--ink)")} />
          </label>
          <PreviewButton type="button" aria-label="New query" style={css("width:40px;min-height:40px;border-radius:9px;border:1px solid " + String(accent) + ";background:" + String(accent) + ";color:#fff;cursor:pointer;display:inline-flex;align-items:center;justify-content:center")}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round")}><path d="M8 3v10M3 8h10"></path></svg>
          </PreviewButton>
        </div>

        <p id="query-library-help" className="preview-note">Search filters query titles only. Query selection and editing are disabled previews; results stay fixed.</p>
        {![...builtin, ...team].some(q => q.title.toLowerCase().includes(search.trim().toLowerCase())) && <p role="status" className="empty-state">No query titles match your search.</p>}
        <div style={css("display:flex;flex-direction:column;gap:1px")}>
          <span style={css("padding:0 8px 5px;font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase")}>Built-in metrics</span>
          {builtin.filter(q => String(q.title).toLowerCase().includes(search.trim().toLowerCase())).map((q, index0) => <Fragment key={index0}>
            <PreviewButton type="button" className="q-btn" aria-pressed={q.pressed} style={css(q.style)}><span >{q.title}</span></PreviewButton>
          </Fragment>)}
        </div>
        <div style={css("display:flex;flex-direction:column;gap:1px")}>
          <span style={css("padding:0 8px 5px;font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase")}>Team queries</span>
          {team.filter(q => q.title.toLowerCase().includes(search.trim().toLowerCase())).map((q, index1) => <Fragment key={index1}>
            <PreviewButton type="button" className="q-btn" style={css("display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;text-align:left;min-height:40px;padding:0 8px;border-radius:8px;border:none;background:transparent;cursor:pointer;font-size:13.5px;color:var(--ink2)")}><span >{q.title}</span><span style={css("font-size:11.5px;color:var(--muted)")}>{q.by}</span></PreviewButton>
          </Fragment>)}
        </div>

        <div style={css("display:flex;flex-direction:column;gap:1px;padding-top:12px;border-top:1px solid var(--line2)")}>
          <span style={css("padding:0 8px 5px;font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase")}>Illustrative schema · dbo</span>
          {tables.map((t, index2) => <Fragment key={index2}>
            <div style={css("display:flex;flex-direction:column")}>
              <button type="button" className="q-btn" aria-controls={`schema-${t.name}`} aria-expanded={t.open} onClick={() => setState(current => ({ ...current, open: current.open === t.name ? '' : t.name }))} style={css("display:flex;align-items:center;gap:7px;width:100%;text-align:left;min-height:34px;padding:0 8px;border-radius:7px;border:none;background:transparent;cursor:pointer;font-family:'Geist Mono',monospace;font-size:12.5px;color:var(--ink2)")}>
                <span aria-hidden="true" style={css("display:inline-block;width:10px;color:var(--muted);transform:" + String(t.rot))}>›</span>
                <span style={css("font-size:10px;font-weight:600;padding:0 4px;border-radius:3px;background:" + String(t.kindBg) + ";color:" + String(t.kindFg) + ";font-family:'Geist',sans-serif")}>{t.kind}</span>
                {t.name}
              </button>
                <div id={`schema-${t.name}`} hidden={!t.open} style={css("display:flex;flex-direction:column;padding:2px 0 6px 34px")}>
                  {t.cols.map((c, index3) => <Fragment key={index3}>
                    <span style={css("display:flex;justify-content:space-between;gap:8px;padding:3px 8px 3px 0;font-family:'Geist Mono',monospace;font-size:12px")}><span style={css("color:var(--ink)")}>{c.n}</span><span style={css("color:var(--muted)")}>{c.t}</span></span>
                  </Fragment>)}
                </div>
            </div>
          </Fragment>)}
        </div>
      </aside>

      <div style={css("flex:999 1 600px;min-width:0;display:flex;flex-direction:column;gap:12px")}>
        <section style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow:hidden;display:flex;flex-direction:column")}>
          <div style={css("display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line2)")}>
            <div style={css("display:flex;flex-direction:column;gap:2px")}>
              <div style={css("display:flex;align-items:center;gap:8px;flex-wrap:wrap")}>
                <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Average test time by configuration</h2>
                <span style={css("font-size:11.5px;font-weight:600;padding:2px 7px;border-radius:5px;background:var(--panel2);border:1px solid var(--line2);color:var(--muted)")}>Built-in</span>
              </div>
              <span style={css("font-size:12.5px;color:var(--muted)")}>Design preview · fixed synthetic result set. Editing and saved queries are not enabled.</span>
            </div>
            <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
              <PreviewButton type="button" style={css("min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;font-size:13.5px;cursor:pointer")}>Format</PreviewButton>
              <PreviewButton type="button" style={css("min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;font-size:13.5px;cursor:pointer")}>Save as…</PreviewButton>
              <PreviewButton type="button" style={css("min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;font-size:13.5px;cursor:pointer;display:inline-flex;align-items:center;gap:7px")}>
                <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M12 17v5M8 3h8l-1 6 3 3v2H6v-2l3-3z"></path></svg>
                Pin to Overview
              </PreviewButton>
              <PreviewButton type="button" style={css("min-height:40px;padding:0 16px;border-radius:9px;border:1px solid " + String(accent) + ";background:" + String(accent) + ";color:#fff;font-weight:600;font-size:13.5px;cursor:pointer;display:inline-flex;align-items:center;gap:8px")}>
                <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" style={css("fill:currentColor")}><path d="M3 1.5v11l9-5.5z"></path></svg>
                Run
                <span style={css("font-size:11px;font-weight:500;opacity:0.85;font-family:'Geist Mono',monospace")}>Ctrl ↵</span>
              </PreviewButton>
            </div>
          </div>

          <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:10px 16px;background:var(--panel2);border-bottom:1px solid var(--line2)")}>
            <span style={css("font-size:12.5px;font-weight:600;color:var(--ink2)")}>Parameters</span>
            <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--prm);font-family:'Geist Mono',monospace;font-weight:600")}>@days
              <PreviewInput type="number" defaultValue="30" style={css("width:72px;min-height:36px;padding:0 8px;border-radius:7px;border:1px solid var(--line);background:var(--panel);font-family:'Geist Mono',monospace;font-size:13px;color:var(--ink)")} />
            </label>
            <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--prm);font-family:'Geist Mono',monospace;font-weight:600")}>@purpose
              <PreviewSelect style={css("min-height:36px;padding:0 8px;border-radius:7px;border:1px solid var(--line);background:var(--panel);font-family:'Geist Mono',monospace;font-size:13px;color:var(--ink)")}><option >production</option><option >engineering</option><option >training</option><option >calibration</option></PreviewSelect>
            </label>
            <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--prm);font-family:'Geist Mono',monospace;font-weight:600")}>@status
              <PreviewSelect style={css("min-height:36px;padding:0 8px;border-radius:7px;border:1px solid var(--line);background:var(--panel);font-family:'Geist Mono',monospace;font-size:13px;color:var(--ink)")}><option >included</option><option >pending</option><option >excluded</option><option >superseded</option></PreviewSelect>
            </label>
          </div>

          <div style={css("display:flex;overflow-x:auto;background:var(--code);font-family:'Geist Mono',monospace;font-size:13px;line-height:1.75")}>
            <pre aria-hidden="true" style={css("margin:0;padding:14px 10px 14px 16px;color:var(--muted);text-align:right;user-select:none;border-right:1px solid var(--line2);font:inherit;opacity:0.7")}>{"1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17"}</pre>
            <pre style={css("margin:0;padding:14px 20px;color:var(--ink);font:inherit;flex:1 0 auto")}>{""}<span className="cm">{"-- Average insertion-loss test time per unit, by switch configuration"}</span>{"\n"}<span className="kw">{"SELECT"}</span>{"\n    s.switch_model,\n    r.wavelength_mode,\n    r.front_panel_channel_count                                       "}<span className="kw">{"AS"}</span>{" channels,\n    "}<span className="fn">{"COUNT"}</span>{"("}<span className="kw">{"DISTINCT"}</span>{" a.unit_id)                                         "}<span className="kw">{"AS"}</span>{" units,\n    "}<span className="fn">{"AVG"}</span>{"("}<span className="fn">{"DATEDIFF"}</span>{"(SECOND, r.run_started_at_utc, r.run_ended_at_utc)) "}<span className="kw">{"AS"}</span>{" avg_seconds\n"}<span className="kw">{"FROM"}</span>{"   dbo.IL_RUNS                 "}<span className="kw">{"AS"}</span>{" r\n"}<span className="kw">{"JOIN"}</span>{"   dbo.UNIT_SWITCH_ASSIGNMENTS "}<span className="kw">{"AS"}</span>{" a "}<span className="kw">{"ON"}</span>{" a.assignment_id = r.assignment_id\n"}<span className="kw">{"JOIN"}</span>{"   dbo.SWITCHES                "}<span className="kw">{"AS"}</span>{" s "}<span className="kw">{"ON"}</span>{" s.switch_id     = a.switch_id\n"}<span className="kw">{"WHERE"}</span>{"  r.run_purpose       = "}<span className="pm">{"@purpose"}</span>{"\n  "}<span className="kw">{"AND"}</span>{"  r.analysis_status   = "}<span className="pm">{"@status"}</span>{"\n  "}<span className="kw">{"AND"}</span>{"  r.completion_status = "}<span className="st">{"'complete'"}</span>{"\n  "}<span className="kw">{"AND"}</span>{"  r.run_started_at_utc >= "}<span className="fn">{"DATEADD"}</span>{"(DAY, -"}<span className="pm">{"@days"}</span>{", "}<span className="fn">{"SYSUTCDATETIME"}</span>{"())\n"}<span className="kw">{"GROUP BY"}</span>{" s.switch_model, r.wavelength_mode, r.front_panel_channel_count\n"}<span className="kw">{"ORDER BY"}</span>{" s.switch_model "}<span className="kw">{"DESC"}</span>{", r.wavelength_mode, channels "}<span className="kw">{"DESC"}</span>{";\n"}</pre>
          </div>

          <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;padding:9px 16px;background:var(--panel2);border-top:1px solid var(--line2);font-size:12px;color:var(--muted)")}>
            <span style={css("display:inline-flex;align-items:center;gap:6px;color:var(--ok-fg);font-weight:600")}>
              <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round")}><path d="M3 8.5l3.2 3L13 4.5"></path></svg>
              Illustrative SELECT
            </span>
            <span >Offline demonstration</span>
            <span >No execution</span>
            <span >7 synthetic rows</span>
            <span style={css("margin-left:auto")}>Ln 17, Col 1</span>
          </div>
        </section>

        <section style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 18px;display:flex;flex-direction:column;gap:14px")}>
          <div style={css("display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px")}>
            <div style={css("display:flex;align-items:baseline;gap:10px;flex-wrap:wrap")}>
              <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Results</h2>
              <span style={css("font-size:12.5px;color:var(--muted)")}>7 synthetic rows · fixed snapshot</span>
            </div>
            <div style={css("display:flex;flex-wrap:wrap;gap:8px;align-items:center")}>
              <SegmentedControl label="Result view" options={RESULT_VIEWS} value={state.view} onChange={view => setState(current => ({ ...current, view }))} size="results" describedBy="query-result-scope" />
              <PreviewButton type="button" style={css("min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;font-size:13.5px;cursor:pointer")}>Copy</PreviewButton>
              <PreviewButton type="button" style={css("min-height:40px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;font-size:13.5px;cursor:pointer")}>Export CSV</PreviewButton>
            </div>
          </div>

          <p id="query-result-scope" className="preview-note">Table and Chart show the same fixed synthetic data; SQL is never executed.</p>
          <div style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px")}>
            {stats.map((s, index5) => <Fragment key={index5}>
              <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}>
                <div style={css("font-size:12px;color:var(--muted)")}>{s.label}</div>
                <div style={css("font-size:19px;font-weight:650;font-variant-numeric:tabular-nums")}>{s.value}</div>
                <div style={css("font-size:11.5px;color:var(--muted)")}>{s.sub}</div>
              </div>
            </Fragment>)}
          </div>

          {isTable && <>
            <div className="table-scroll" role="region" tabIndex={0} aria-label="Query results table, scroll horizontally on narrow screens">
              <div role="table" aria-label="Query results" style={css("min-width:640px")}>
                <div role="row" style={css("display:grid;grid-template-columns:1fr 1fr 0.8fr 0.7fr 0.9fr 0.9fr 1.6fr;gap:10px;padding:0 6px 9px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);font-weight:500;font-family:'Geist Mono',monospace")}>
                  <span role="columnheader">switch_model</span>
                  <span role="columnheader">wavelength_mode</span>
                  <span role="columnheader" style={css("text-align:right")}>channels</span>
                  <span role="columnheader" style={css("text-align:right")}>units</span>
                  <span role="columnheader" style={css("text-align:right")}>avg_seconds</span>
                  <span role="columnheader" style={css("text-align:right")}>as time</span>
                  <span role="columnheader">seconds per channel</span>
                </div>
                {rows.map((r, index6) => <Fragment key={index6}>
                  <div role="row" style={css("display:grid;grid-template-columns:1fr 1fr 0.8fr 0.7fr 0.9fr 0.9fr 1.6fr;gap:10px;align-items:center;padding:9px 6px;border-bottom:1px solid var(--line2);font-family:'Geist Mono',monospace;font-size:13px;font-variant-numeric:tabular-nums")}>
                    <span role="cell">{r.model}</span>
                    <span role="cell">{r.mode}</span>
                    <span role="cell" style={css("text-align:right")}>{r.ch}</span>
                    <span role="cell" style={css("text-align:right")}>{r.units}</span>
                    <span role="cell" style={css("text-align:right")}>{r.sec}</span>
                    <span role="cell" style={css("text-align:right;font-weight:600")}>{r.time}</span>
                    <span role="cell" style={css("display:flex;align-items:center;gap:8px")}><span style={css("flex:1;height:6px;border-radius:3px;background:var(--line2)")}><span style={css("display:block;height:6px;border-radius:3px;width:" + String(r.w) + "%;background:" + String(accent))}></span></span><span style={css("min-width:44px;text-align:right")}>{r.spc}</span></span>
                  </div>
                </Fragment>)}
              </div>
            </div>
          </>}
          {isChart && <>
            <div style={css("display:flex;flex-direction:column;gap:8px")}>
              <div style={css("display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--ink2)")}>
                <span >Chart: <b style={css("font-weight:600")}>avg_seconds</b> as minutes, by configuration</span>
                <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--o1)")}></span>OSX-150</span>
                <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--o2)")}></span>OSX-100</span>
              </div>
              <QueryChart rows={rows} />
            </div>
          </>}
        </section>

        <section style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 18px;display:flex;flex-direction:column;gap:6px")}>
          <h2 style={css("margin:0 0 4px;font-size:14px;font-weight:600")}>Recent runs · illustrative</h2>
          {history.map((h, index9) => <Fragment key={index9}>
            <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:8px 0;border-top:1px solid var(--line2);font-size:13px")}>
              <span style={css("font-family:'Geist Mono',monospace;color:var(--muted);min-width:44px")}>{h.t}</span>
              <span style={css("flex:1 1 240px;font-weight:500")}>{h.title}</span>
              <span style={css("color:var(--muted)")}>{h.meta}</span>
              <span style={css("font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:" + String(h.bg) + ";color:" + String(h.fg))}>{h.state}</span>
            </div>
          </Fragment>)}
        </section>
      </div>
    </div>

    <footer style={css("font-size:12px;color:var(--muted);line-height:1.55;max-width:900px")}>Synthetic query design preview. Schema and SQL are illustrative. No SQL is executed or sent to a server.</footer>

</>);
}
