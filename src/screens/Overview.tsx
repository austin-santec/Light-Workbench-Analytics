import { Fragment, useState } from 'react';
import { RecentActivity } from '../components/RecentActivity';
import { css } from '../lib/css';
import { getOverviewValues } from '../mock/overview';
import type { OverviewState } from '../types';

export default function Overview({ dark }: { dark: boolean }) {
 const [state, setState] = useState<OverviewState>({ range: 'today', cfg: 0, purp: { production: true, engineering: false, training: false, calibration: false } });
 const values = getOverviewValues(state, patch => setState(current => ({ ...current, ...patch })), dark);
 const { accent, themeClass, d, ranges, kpis, purposes, scope, resetPurpose, cfgRows, sel, hist, meanX, meanLX, outSegs, outLegend, linePath, areaPath, lineGrid, dots, avgY, lastX, lastY, bars, barGrid, stations, cells, legendCells, runs } = values;
 return (<>


<div className={"lw " + String(themeClass)} style={css("display:flex;flex-wrap:wrap;min-height:100vh;background:var(--bg);color:var(--ink);font-family:'Geist',system-ui,sans-serif;font-size:14px;line-height:1.45")}>


  <aside style={css("flex:1 1 236px;max-width:100%;background:var(--panel);border-right:1px solid var(--line);padding:22px 14px;display:flex;flex-direction:column;gap:24px")}>
    <div style={css("display:flex;align-items:center;gap:11px;padding:0 8px")}>
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" style={css("fill:" + String(accent))}></rect><path d="M6 20.5h6.5L16 10l3.5 10.5H26" style={css("fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round")}></path></svg>
      <div style={css("display:flex;flex-direction:column;line-height:1.15")}>
        <span style={css("font-weight:600;font-size:15px")}>Light Workbench</span>
        <span style={css("font-size:12.5px;color:var(--muted)")}>Analytics</span>
      </div>
    </div>

    <nav aria-label="Main" style={css("display:flex;flex-direction:column;gap:2px")}>
      <span style={css("padding:0 10px 6px;font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase")}>Analyze</span>
      <a href="#/" aria-current="page" style={css("display:flex;align-items:center;gap:11px;min-height:44px;padding:0 10px;border-radius:9px;text-decoration:none;font-weight:600;background:color-mix(in srgb," + String(accent) + " 11%,var(--panel));color:" + String(accent))}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:1.9;stroke-linejoin:round")}><rect x="3" y="3" width="7.5" height="9" rx="1.6"></rect><rect x="13.5" y="3" width="7.5" height="5" rx="1.6"></rect><rect x="3" y="15" width="7.5" height="6" rx="1.6"></rect><rect x="13.5" y="11" width="7.5" height="10" rx="1.6"></rect></svg>
        Overview
      </a>
      <a href="#/failures" className="nav-a" style={css("display:flex;align-items:center;gap:11px;min-height:44px;padding:0 10px;border-radius:9px;text-decoration:none;font-weight:500;color:var(--ink2)")}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round")}><path d="M4 8h13l-3-3.2M20 16H7l3 3.2"></path></svg>
        Failures & replacements
      </a>
      <a href="#/unit" className="nav-a" style={css("display:flex;align-items:center;gap:11px;min-height:44px;padding:0 10px;border-radius:9px;text-decoration:none;font-weight:500;color:var(--ink2)")}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round")}><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M15.5 15.5L21 21"></path></svg>
        Unit lookup
      </a>
      <a href="#/queries" className="nav-a" style={css("display:flex;align-items:center;gap:11px;min-height:44px;padding:0 10px;border-radius:9px;text-decoration:none;font-weight:500;color:var(--ink2)")}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round")}><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"></path></svg>
        Query console
      </a>
    </nav>

    <nav aria-label="Saved views" style={css("display:flex;flex-direction:column;gap:2px")}>
      <span style={css("padding:0 10px 6px;font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase")}>Saved views</span>
      <a aria-disabled="true" title="Saved views are a design preview" className="nav-a" style={css("display:flex;align-items:center;gap:10px;min-height:40px;padding:0 10px;border-radius:9px;text-decoration:none;color:var(--ink2);font-size:13.5px")}><span style={css("width:8px;height:8px;border-radius:2px;background:var(--o1)")}></span>OSX-150 · SM · 48ch daily</a>
      <a aria-disabled="true" title="Saved views are a design preview" className="nav-a" style={css("display:flex;align-items:center;gap:10px;min-height:40px;padding:0 10px;border-radius:9px;text-decoration:none;color:var(--ink2);font-size:13.5px")}><span style={css("width:8px;height:8px;border-radius:2px;background:var(--o3)")}></span>Station 2 · this week</a>
      <a aria-disabled="true" title="Saved views are a design preview" className="nav-a" style={css("display:flex;align-items:center;gap:10px;min-height:40px;padding:0 10px;border-radius:9px;text-decoration:none;color:var(--ink2);font-size:13.5px")}><span style={css("width:8px;height:8px;border-radius:2px;background:var(--o2)")}></span>Multimode · last 30 days</a>
    </nav>

    <div style={css("margin-top:auto;display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:12px;background:var(--panel2);border:1px solid var(--line2)")}>
      <div style={css("display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600")}>
        <span style={css("width:8px;height:8px;border-radius:50%;background:#2FB36B;box-shadow:0 0 0 3px color-mix(in srgb,#2FB36B 25%,transparent)")}></span>
        Synthetic data · offline
      </div>
      <div style={css("font-family:'Geist Mono',monospace;font-size:12px;color:var(--muted);line-height:1.6")}>Milestone 0 · browser only<br  />Deterministic demo fixtures<br  />No database connection</div>
      <span style={css("align-self:flex-start;font-size:11.5px;font-weight:600;color:var(--warn-fg);background:var(--warn-bg);padding:3px 9px;border-radius:999px")}>Sample data</span>
    </div>
  </aside>


  <main tabIndex={-1} id="content" style={css("flex:999 1 560px;min-width:0;padding:26px 34px 44px;display:flex;flex-direction:column;gap:18px")}>

    <header style={css("display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px")}>
      <div style={css("display:flex;flex-direction:column;gap:4px")}>
        <span style={css("font-size:12.5px;color:var(--muted);font-weight:500")}>Thursday, November 5, 2026</span>
        <h1 style={css("margin:0;font-size:28px;line-height:1.15;font-weight:650;letter-spacing:-0.02em")}>{scope.heading}</h1>
      </div>
      <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:8px")}>
        <span style={css("display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);padding-right:6px")}><span style={css("width:7px;height:7px;border-radius:50%;background:#2FB36B")}></span>Demo snapshot · Nov 5, 2026</span>
        <button type="button" style={css("min-height:44px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:8px")} disabled title="Design preview — available in a future milestone">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"></path></svg>
          Refresh
        </button>
        <button type="button" style={css("min-height:44px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:8px")} disabled title="Design preview — available in a future milestone">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>
          Export
        </button>
        <button type="button" style={css("min-height:44px;padding:0 16px;border-radius:9px;border:1px solid " + String(accent) + ";background:" + String(accent) + ";color:#fff;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px")} disabled title="Design preview — available in a future milestone">
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M10 14l4-4M8.5 11.5l-2 2a3.5 3.5 0 0 0 5 5l2-2M15.5 12.5l2-2a3.5 3.5 0 0 0-5-5l-2 2"></path></svg>
          Share view
        </button>
      </div>
    </header>


    <p className="preview-note">Range and run purpose affect summary cards and recent activity. Charts retain their labeled demo periods. Other global controls are design previews.</p>
    <section aria-label="Filters" style={css("display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;padding:10px;background:var(--panel);border:1px solid var(--line);border-radius:14px")}>
      <div role="group" aria-label="Time range" style={css("display:flex;flex-wrap:wrap;background:var(--panel2);border:1px solid var(--line2);border-radius:10px;padding:3px;gap:2px")}>
        {ranges.map((r, index0) => <Fragment key={index0}>
          <button type="button" aria-pressed={r.pressed === 'true'} onClick={r.pick} style={css(r.style)}>{r.label}</button>
        </Fragment>)}
      </div>
      <span aria-hidden="true" style={css("width:1px;height:28px;background:var(--line)")}></span>
      <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Model
        <select style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")} disabled title="Design preview — available in a future milestone"><option >All models</option><option >OSX-150</option><option >OSX-100</option></select>
      </label>
      <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Mode
        <select style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")} disabled title="Design preview — available in a future milestone"><option >SM + MM</option><option >SM</option><option >MM</option></select>
      </label>
      <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Channels
        <select style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")} disabled title="Design preview — available in a future milestone"><option >All</option><option >48</option><option >36</option><option >24</option></select>
      </label>
      <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Station
        <select style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")} disabled title="Design preview — available in a future milestone"><option >All stations</option><option >Station 1</option><option >Station 2</option><option >Station 3</option><option >Station 4</option></select>
      </label>
      <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Operator
        <select style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")} disabled title="Design preview — available in a future milestone"><option >Anyone</option><option >Demo operator A</option><option >Demo operator B</option><option >Demo operator C</option></select>
      </label>
      <div style={css("flex-basis:100%;height:0")} aria-hidden="true"></div>
      <div role="group" aria-label="Run purpose" style={css("display:flex;flex-wrap:wrap;align-items:center;gap:6px")}>
        <span style={css("font-size:12.5px;color:var(--muted);font-weight:500;padding:0 4px 0 2px")}>Run purpose</span>
        {purposes.map((p, index1) => <Fragment key={index1}>
          <button type="button" aria-pressed={p.pressed === 'true'} onClick={p.toggle} style={css(p.style)}>
            <span style={css("width:14px;height:14px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;border:1.5px solid " + String(p.boxBorder) + ";background:" + String(p.boxBg))}><svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true" style={css("fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round;opacity:" + String(p.checkOp))}><path d="M3 8.5l3.2 3L13 4.5"></path></svg></span>
            {p.label}
            <span style={css("font-size:11.5px;font-weight:500;color:var(--muted);font-variant-numeric:tabular-nums")}>{p.count}</span>
          </button>
        </Fragment>)}
      </div>
      <label style={css("margin-left:auto;display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Analysis status
        <select style={css("min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")} disabled title="Design preview — available in a future milestone"><option >Included only</option><option >Included + pending</option><option >Everything, incl. voided and superseded</option></select>
      </label>
    </section>

    {scope.show && <>
      <div role="status" style={css("display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:10px 14px;border-radius:12px;background:" + String(scope.bg) + ";color:" + String(scope.fg) + ";border:1px solid color-mix(in srgb,currentColor 25%,transparent);font-size:13px")}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={css("flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3"></path><path d="M7 15h10"></path></svg>
        <span style={css("font-weight:600")}>{scope.title}</span>
        <span >{scope.text}</span>
        <button type="button" onClick={resetPurpose} style={css("margin-left:auto;min-height:34px;padding:0 12px;border-radius:8px;border:1px solid currentColor;background:transparent;color:inherit;font-weight:600;font-size:12.5px;cursor:pointer")}>Back to production only</button>
      </div>
    </>}


    <section aria-label="Key metrics" style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px")}>
      {kpis.map((k, index2) => <Fragment key={index2}>
        <div style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 16px 12px;display:flex;flex-direction:column;gap:6px;min-width:0")}>
          <span style={css("font-size:12.5px;color:var(--muted);font-weight:500")}>{k.label}</span>
          <div style={css("display:flex;align-items:baseline;gap:8px;flex-wrap:wrap")}>
            <span style={css("font-size:30px;line-height:1.05;font-weight:650;letter-spacing:-0.025em;font-variant-numeric:tabular-nums;color:" + String(k.valueColor))}>{k.value}</span>
            <span style={css("font-size:12px;font-weight:600;padding:2px 7px;border-radius:6px;background:" + String(k.dBg) + ";color:" + String(k.dFg) + ";white-space:nowrap")}>{k.delta}</span>
          </div>
          <span style={css("font-size:12px;color:var(--muted);min-height:17px")}>{k.sub}</span>
          <svg viewBox="0 0 160 34" preserveAspectRatio="none" aria-hidden="true" style={css("width:100%;height:30px;display:block;margin-top:2px")}>
            <path d={k.area} style={css("fill:" + String(accent) + ";fill-opacity:0.08;stroke:none")}></path>
            <polyline points={k.line} vectorEffect="non-scaling-stroke" style={css("fill:none;stroke:" + String(accent) + ";stroke-width:1.6;stroke-linejoin:round;stroke-linecap:round")}></polyline>
          </svg>
        </div>
      </Fragment>)}
    </section>


    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:3 1 640px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 18px 10px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Insertion-loss test time by configuration</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>Run start to run end, complete production runs, last 30 days. Select a row to inspect its distribution.</span>
          </div>
          <a href="#/queries" className="lnk" style={css("font-size:13px;display:inline-flex;align-items:center;min-height:32px;white-space:nowrap")}>Open in console</a>
        </div>
        <div style={css("overflow-x:auto")}>
          <div role="table" aria-label="Test time by configuration" style={css("min-width:720px")}>
            <div role="row" style={css("display:grid;grid-template-columns:1.9fr 0.7fr 0.85fr 0.85fr 0.85fr 0.9fr 1.3fr 0.8fr;gap:10px;padding:0 10px 9px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);font-weight:500")}>
              <span role="columnheader">Configuration</span>
              <span role="columnheader" style={css("text-align:right")}>Units</span>
              <span role="columnheader" style={css("text-align:right")}>Average</span>
              <span role="columnheader" style={css("text-align:right")}>Median</span>
              <span role="columnheader" style={css("text-align:right")}>P90</span>
              <span role="columnheader" style={css("text-align:right")}>Per channel</span>
              <span role="columnheader">Avg, last 14 days</span>
              <span role="columnheader" style={css("text-align:right")}>vs prior</span>
            </div>
            {cfgRows.map((c, index3) => <Fragment key={index3}>
              <button type="button" className="row-btn" aria-pressed={c.pressed === 'true'} onClick={c.pick} style={css(c.style)}>
                <span style={css("display:flex;align-items:center;gap:9px;min-width:0")}>
                  <span style={css("width:3px;height:22px;border-radius:2px;background:" + String(c.mark))}></span>
                  <span style={css("font-weight:600")}>{c.model}</span>
                  <span style={css("font-size:12px;font-weight:600;padding:1px 6px;border-radius:5px;background:var(--panel2);border:1px solid var(--line2);color:var(--ink2)")}>{c.mode}</span>
                  <span style={css("color:var(--ink2)")}>{c.ch} ch</span>
                </span>
                <span style={css("text-align:right;color:var(--ink2)")}>{c.units}</span>
                <span style={css("text-align:right;font-weight:600")}>{c.avg}</span>
                <span style={css("text-align:right;color:var(--ink2)")}>{c.med}</span>
                <span style={css("text-align:right;color:var(--ink2)")}>{c.p90}</span>
                <span style={css("text-align:right;color:var(--ink2)")}>{c.perCh}</span>
                <svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true" style={css("width:100%;height:22px;display:block")}>
                  <polyline points={c.spark} vectorEffect="non-scaling-stroke" style={css("fill:none;stroke:" + String(c.sparkColor) + ";stroke-width:1.5;stroke-linejoin:round")}></polyline>
                </svg>
                <span style={css("text-align:right;font-weight:600;color:" + String(c.dColor))}>{c.delta}</span>
              </button>
            </Fragment>)}
          </div>
        </div>
      </div>

      <div style={css("flex:2 1 380px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Time to test one unit</h2>
          <span style={css("font-size:12.5px;color:var(--muted)")}>{sel.title} · {sel.units} units, last 30 days</span>
        </div>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
          <div style={css("flex:1 1 80px;padding:8px 10px;border-radius:9px;background:var(--panel2)")}><div style={css("font-size:11.5px;color:var(--muted)")}>Average</div><div style={css("font-size:17px;font-weight:650;font-variant-numeric:tabular-nums")}>{sel.avg}</div></div>
          <div style={css("flex:1 1 80px;padding:8px 10px;border-radius:9px;background:var(--panel2)")}><div style={css("font-size:11.5px;color:var(--muted)")}>Median</div><div style={css("font-size:17px;font-weight:650;font-variant-numeric:tabular-nums")}>{sel.med}</div></div>
          <div style={css("flex:1 1 80px;padding:8px 10px;border-radius:9px;background:var(--panel2)")}><div style={css("font-size:11.5px;color:var(--muted)")}>Slowest 10%</div><div style={css("font-size:17px;font-weight:650;font-variant-numeric:tabular-nums")}>{sel.p90}+</div></div>
        </div>
        <svg viewBox="0 0 400 200" role="img" aria-label={sel.aria} style={css("width:100%;height:auto;display:block")}>
          <line x1="12" x2="388" y1="160" y2="160" style={css("stroke:var(--line);stroke-width:1")}></line>
          {hist.map((h, index4) => <Fragment key={index4}>
            <g >
              <rect x={h.x} y={h.y} width={h.w} height={h.h} rx="3" style={css("fill:" + String(h.fill))}></rect>
              <text x={h.cx} y={h.vy} style={css("font-size:11px;font-weight:600;fill:var(--ink2);text-anchor:middle;font-family:'Geist Mono',monospace")}>{h.count}</text>
              <text x={h.lx} y="176" style={css("font-size:11px;fill:var(--muted);text-anchor:middle;font-family:'Geist Mono',monospace")}>{h.label}</text>
            </g>
          </Fragment>)}
          <line x1={meanX} x2={meanX} y1="26" y2="160" style={css("stroke:var(--ink);stroke-width:1.4;stroke-dasharray:4 3")}></line>
          <text x={meanLX} y="20" style={css("font-size:11.5px;font-weight:600;fill:var(--ink);text-anchor:middle")}>avg {sel.avg}</text>
          <text x="200" y="196" style={css("font-size:11px;fill:var(--muted);text-anchor:middle")}>minutes per unit</text>
        </svg>
      </div>
    </section>


    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:1 1 480px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Daily channel failure rate</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>First-pass channels over the fail limit at either wavelength, last 20 workdays.</span>
          </div>
          <div style={css("display:flex;gap:14px;font-size:12px;color:var(--muted);align-items:center")}>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:14px;height:2.5px;background:" + String(accent) + ";border-radius:2px")}></span>Daily</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:14px;border-top:1.5px dashed var(--muted)")}></span>30-day avg 3.9%</span>
          </div>
        </div>
        <svg viewBox="0 0 640 220" role="img" aria-label="Line chart of daily channel failure rate over 20 workdays, ranging 3.3 to 4.5 percent, 4.1 percent today" style={css("width:100%;height:auto;display:block")}>
          {lineGrid.map((g, index5) => <Fragment key={index5}>
            <g >
              <line x1="44" x2="624" y1={g.y} y2={g.y} style={css("stroke:var(--grid);stroke-width:1")}></line>
              <text x="36" y={g.ty} style={css("font-size:11px;fill:var(--muted);text-anchor:end;font-family:'Geist Mono',monospace")}>{g.label}</text>
            </g>
          </Fragment>)}
          <line x1="44" x2="624" y1={avgY} y2={avgY} style={css("stroke:var(--muted);stroke-width:1;stroke-dasharray:4 4")}></line>
          <path d={areaPath} style={css("fill:" + String(accent) + ";fill-opacity:0.10;stroke:none")}></path>
          <path d={linePath} style={css("fill:none;stroke:" + String(accent) + ";stroke-width:2.2;stroke-linejoin:round;stroke-linecap:round")}></path>
          {dots.map((p, index6) => <Fragment key={index6}>
            <g >
              <circle cx={p.x} cy={p.y} r={p.r} style={css("fill:var(--panel);stroke:" + String(accent) + ";stroke-width:1.8")}></circle>
              <text x={p.x} y="208" style={css("font-size:11px;fill:var(--muted);text-anchor:middle")}>{p.label}</text>
            </g>
          </Fragment>)}
          <text x={lastX} y={lastY} style={css("font-size:12px;font-weight:650;fill:var(--ink);text-anchor:end")}>4.1% today</text>
        </svg>
      </div>

      <div style={css("flex:1 1 480px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Channels tested per day</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>Last 14 days. Today is partial, as of 08:27.</span>
          </div>
          <div style={css("display:flex;gap:14px;font-size:12px;color:var(--muted);align-items:center")}>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:" + String(accent))}></span>Workday</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:color-mix(in srgb," + String(accent) + " 35%,var(--panel))")}></span>Today, partial</span>
          </div>
        </div>
        <svg viewBox="0 0 640 220" role="img" aria-label="Bar chart of channels tested per day, about 2,300 to 2,600 per workday, 1,008 so far today" style={css("width:100%;height:auto;display:block")}>
          {barGrid.map((g, index7) => <Fragment key={index7}>
            <g >
              <line x1="48" x2="624" y1={g.y} y2={g.y} style={css("stroke:var(--grid);stroke-width:1")}></line>
              <text x="40" y={g.ty} style={css("font-size:11px;fill:var(--muted);text-anchor:end;font-family:'Geist Mono',monospace")}>{g.label}</text>
            </g>
          </Fragment>)}
          {bars.map((b, index8) => <Fragment key={index8}>
            <g >
              <rect x={b.x} y={b.y} width="28" height={b.h} rx="4" style={css("fill:" + String(b.fill))}></rect>
              <text x={b.cx} y={b.vy} style={css("font-size:10px;fill:var(--ink2);text-anchor:middle;font-family:'Geist Mono',monospace")}>{b.value}</text>
              <text x={b.cx} y="190" style={css("font-size:10.5px;fill:var(--muted);text-anchor:middle")}>{b.wd}</text>
              <text x={b.cx} y="206" style={css("font-size:11px;fill:var(--ink2);text-anchor:middle;font-weight:500")}>{b.day}</text>
            </g>
          </Fragment>)}
        </svg>
      </div>
    </section>


    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:1 1 320px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:14px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Unit outcomes</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>{d.outCaption}</span>
          </div>
          <a href="#/failures" className="lnk" style={css("font-size:13px;display:inline-flex;align-items:center;min-height:32px")}>Details</a>
        </div>
        <div role="img" aria-label={d.outAria} style={css("display:flex;height:16px;border-radius:5px;overflow:hidden;gap:2px")}>
          {outSegs.map((s, index9) => <Fragment key={index9}>
            <div style={css("width:" + String(s.pct) + "%;background:" + String(s.color))}></div>
          </Fragment>)}
        </div>
        <div style={css("display:flex;flex-direction:column")}>
          {outLegend.map((o, index10) => <Fragment key={index10}>
            <div style={css("display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--line2)")}>
              <span style={css("display:flex;align-items:center;gap:9px")}><span style={css("width:10px;height:10px;border-radius:3px;background:" + String(o.color))}></span>{o.label}</span>
              <span style={css("display:flex;align-items:baseline;gap:10px;font-variant-numeric:tabular-nums")}><span style={css("font-size:15px;font-weight:650")}>{o.count}</span><span style={css("font-size:12px;color:var(--muted);min-width:44px;text-align:right")}>{o.share}</span></span>
            </div>
          </Fragment>)}
        </div>
        <div style={css("display:flex;flex-direction:column;gap:8px;padding-top:12px;border-top:1px solid var(--line)")}>
          <span style={css("font-size:13px;font-weight:600")}>Which wavelength fails</span>
          <div role="img" aria-label="Failed channels by wavelength: 1550 nm only 58 percent, 1310 nm only 27 percent, both 15 percent" style={css("display:flex;height:10px;border-radius:4px;overflow:hidden;gap:2px")}>
            <div style={css("width:58%;background:var(--o1)")}></div><div style={css("width:27%;background:var(--o2)")}></div><div style={css("width:15%;background:var(--o3)")}></div>
          </div>
          <div style={css("display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12px;color:var(--ink2)")}>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:9px;height:9px;border-radius:2px;background:var(--o1)")}></span>1550 nm only <b style={css("font-weight:650")}>58%</b></span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:9px;height:9px;border-radius:2px;background:var(--o2)")}></span>1310 nm only <b style={css("font-weight:650")}>27%</b></span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:9px;height:9px;border-radius:2px;background:var(--o3)")}></span>Both <b style={css("font-weight:650")}>15%</b></span>
          </div>
        </div>
      </div>

      <div style={css("flex:1.4 1 440px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Stations, last 30 days</h2>
          <span style={css("font-size:12.5px;color:var(--muted)")}>Time is per channel so 24, 36 and 48-channel units compare fairly.</span>
        </div>
        <div style={css("overflow-x:auto")}>
          <div role="table" aria-label="Station comparison" style={css("min-width:420px")}>
            <div role="row" style={css("display:grid;grid-template-columns:1fr 0.7fr 0.9fr 1.5fr 0.8fr;gap:10px;padding:0 4px 9px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);font-weight:500")}>
              <span role="columnheader">Station</span>
              <span role="columnheader" style={css("text-align:right")}>Units</span>
              <span role="columnheader" style={css("text-align:right")}>s / channel</span>
              <span role="columnheader">Channel failure rate</span>
              <span role="columnheader" style={css("text-align:right")}>Retests</span>
            </div>
            {stations.map((s, index11) => <Fragment key={index11}>
              <div role="row" style={css("display:grid;grid-template-columns:1fr 0.7fr 0.9fr 1.5fr 0.8fr;gap:10px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--line2);font-variant-numeric:tabular-nums")}>
                <span role="cell" style={css("font-weight:600")}>{s.name}</span>
                <span role="cell" style={css("text-align:right;color:var(--ink2)")}>{s.units}</span>
                <span role="cell" style={css("text-align:right;color:var(--ink2)")}>{s.spc}</span>
                <span role="cell" style={css("display:flex;align-items:center;gap:8px")}><span style={css("flex:1;height:7px;border-radius:4px;background:var(--line2);overflow:hidden")}><span style={css("display:block;height:7px;border-radius:4px;width:" + String(s.w) + "%;background:" + String(s.barColor))}></span></span><span style={css("min-width:40px;text-align:right;font-weight:600;color:" + String(s.fColor))}>{s.fail}</span></span>
                <span role="cell" style={css("text-align:right;color:var(--ink2)")}>{s.retest}</span>
              </div>
            </Fragment>)}
          </div>
        </div>
        <div style={css("display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:var(--warn-bg);color:var(--warn-fg);font-size:12.5px")}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={css("flex:0 0 auto;margin-top:1px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M12 3l9.5 17h-19z"></path><path d="M12 10v4M12 17.5v.01"></path></svg>
          <span >Station 2 fails 0.5 pts above the line average and retests the most. Worth checking its reference and patch cords.</span>
        </div>
      </div>

      <div style={css("flex:1.2 1 380px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Failures by logical channel</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>48-channel units, first pass, last 30 days.</span>
          </div>
        </div>
        <div style={css("display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px")}>
          {cells.map((c, index12) => <Fragment key={index12}>
            <div title={c.title} style={css("aspect-ratio:1/0.82;border-radius:6px;padding:4px 5px;display:flex;flex-direction:column;justify-content:space-between;background:" + String(c.bg) + ";color:" + String(c.fg) + ";outline:" + String(c.ring))}>
              <span style={css("font-size:10px;opacity:0.8;line-height:1")}>{c.n}</span>
              <span style={css("font-size:12.5px;font-weight:650;font-family:'Geist Mono',monospace;text-align:right;line-height:1")}>{c.count}</span>
            </div>
          </Fragment>)}
        </div>
        <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:11.5px;color:var(--muted)")}>
          <span >Fewer</span>
          <span style={css("display:flex;gap:2px")}>{legendCells.map((l, index13) => <Fragment key={index13}><span style={css("width:18px;height:10px;border-radius:2px;background:" + String(l.bg))}></span></Fragment>)}</span>
          <span >More</span>
          <span style={css("margin-left:auto;color:var(--ink2)")}>Ch 19, 33, 41 stand out</span>
        </div>
      </div>
    </section>


    <RecentActivity data={runs} />

    <footer style={css("font-size:12px;color:var(--muted);line-height:1.55;max-width:900px")}>Entirely synthetic demonstration. Metric definitions and manufacturing disposition require review before production use.</footer>
  </main>
</div>
</>);
}
