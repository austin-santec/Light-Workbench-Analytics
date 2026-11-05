import { CHANNEL_OPTIONS } from '../mock/presentation';
import { PreviewButton, PreviewSelect } from '../components/PreviewControl';
import { SegmentedControl } from '../components/SegmentedControl';
import { Fragment, useState } from 'react';
import { css } from '../lib/css';
import { getFailuresValues } from '../mock/failures';
import type { FailuresState } from '../types';

export default function Failures() {
 const [state, setState] = useState<FailuresState>({ ch: 48 });
 const values = getFailuresValues(state);
 const { accent, kpis, weeks, wGrid, reasons, fbars, fp, topCh, topPort, units } = values;
 return (<>

    <header style={css("display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px")}>
      <div style={css("display:flex;flex-direction:column;gap:4px")}>
        <span style={css("font-size:12.5px;color:var(--muted);font-weight:500")}>Last 30 days · Oct 7 to Nov 5, 2026</span>
        <h1 style={css("margin:0;font-size:28px;line-height:1.15;font-weight:650;letter-spacing:-0.02em")}>Failures & replacements</h1>
        <p style={css("margin:0;font-size:13.5px;color:var(--muted);max-width:640px")}>How often channels fail, how many get swapped to extra ports, and why some units can't be recovered.</p>
      </div>
      <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:8px")}>
        <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Period
          <PreviewSelect style={css("min-height:44px;padding:0 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >Last 30 days</option><option >This week</option><option >Yesterday</option><option >Today</option></PreviewSelect>
        </label>
        <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Run purpose
          <PreviewSelect style={css("min-height:44px;padding:0 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >Production</option><option >Engineering</option><option >Production + engineering</option><option >Training</option><option >Calibration</option><option >All purposes</option></PreviewSelect>
        </label>
        <label style={css("display:flex;align-items:center;gap:7px;font-size:12.5px;color:var(--muted);font-weight:500")}>Model
          <PreviewSelect style={css("min-height:44px;padding:0 10px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-size:13.5px;font-weight:500")}><option >All models</option><option >OSX-150</option><option >OSX-100</option></PreviewSelect>
        </label>
        <PreviewButton type="button" style={css("min-height:44px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:8px")}>
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M12 4v11M7 10l5 5 5-5M5 20h14"></path></svg>
          Export CSV
        </PreviewButton>
      </div>
    </header>

    <p className="preview-note">Fixed synthetic periods: the header filters and export are disabled previews.</p>
    <section aria-label="Key metrics" style={css("display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px")}>
      {kpis.map((k, index0) => <Fragment key={index0}>
        <div style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:6px")}>
          <span style={css("font-size:12.5px;color:var(--muted);font-weight:500")}>{k.label}</span>
          <span style={css("font-size:30px;line-height:1.05;font-weight:650;letter-spacing:-0.025em;font-variant-numeric:tabular-nums;color:" + String(k.color))}>{k.value}</span>
          <span style={css("font-size:12.5px;color:var(--ink2)")}>{k.sub}</span>
          <div style={css("height:5px;border-radius:3px;background:var(--line2);overflow:hidden;margin-top:4px")}><div style={css("height:5px;border-radius:3px;width:" + String(k.pct) + "%;background:" + String(k.bar))}></div></div>
        </div>
      </Fragment>)}
    </section>

    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:2 1 560px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Unit outcomes by week</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>Units finished each week, last 8 weeks. The current week is partial.</span>
          </div>
          <div style={css("display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--ink2)")}>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--o1)")}></span>Passed first time</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--o2)")}></span>Passed after replacement</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--o3)")}></span>Unrecoverable</span>
          </div>
        </div>
        <svg viewBox="0 0 680 250" role="img" aria-label="Stacked bars of unit outcomes per week. About 270 to 310 units per full week, roughly a third passing first time and 2 percent unrecoverable." style={css("width:100%;height:auto;display:block")}>
          {wGrid.map((g, index1) => <Fragment key={index1}>
            <g >
              <line x1="44" x2="664" y1={g.y} y2={g.y} style={css("stroke:var(--grid);stroke-width:1")}></line>
              <text x="36" y={g.ty} style={css("font-size:11px;fill:var(--muted);text-anchor:end;font-family:'Geist Mono',monospace")}>{g.label}</text>
            </g>
          </Fragment>)}
          {weeks.map((w, index2) => <Fragment key={index2}>
            <g >
              <rect x={w.x} y={w.y1} width="44" height={w.h1} style={css("fill:var(--o1)")}></rect>
              <rect x={w.x} y={w.y2} width="44" height={w.h2} style={css("fill:var(--o2)")}></rect>
              <rect x={w.x} y={w.y3} width="44" height={w.h3} style={css("fill:var(--o3)")}></rect>
              <text x={w.cx} y={w.ty} style={css("font-size:11.5px;font-weight:600;fill:var(--ink);text-anchor:middle;font-family:'Geist Mono',monospace")}>{w.total}</text>
              <text x={w.cx} y="222" style={css("font-size:11.5px;fill:var(--ink2);text-anchor:middle;font-weight:500")}>{w.label}</text>
              <text x={w.cx} y="242" style={css("font-size:11px;fill:var(--bad-fg);text-anchor:middle;font-family:'Geist Mono',monospace;font-weight:600")}>{w.unrec}</text>
            </g>
          </Fragment>)}
        </svg>
      </div>

      <div style={css("flex:1 1 340px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Why units were unrecoverable</h2>
          <span style={css("font-size:12.5px;color:var(--muted)")}>27 units, from each run's latest replacement analysis.</span>
        </div>
        {reasons.map((r, index3) => <Fragment key={index3}>
          <div style={css("display:flex;flex-direction:column;gap:7px;padding:12px 0;border-top:1px solid var(--line2)")}>
            <div style={css("display:flex;justify-content:space-between;align-items:baseline;gap:10px")}>
              <span style={css("font-weight:600")}>{r.title}</span>
              <span style={css("display:flex;align-items:baseline;gap:8px;font-variant-numeric:tabular-nums")}><span style={css("font-size:22px;font-weight:650")}>{r.count}</span><span style={css("font-size:12px;color:var(--muted)")}>{r.share}</span></span>
            </div>
            <div style={css("height:6px;border-radius:3px;background:var(--line2);overflow:hidden")}><div style={css("height:6px;border-radius:3px;width:" + String(r.w) + "%;background:" + String(r.color))}></div></div>
            <span style={css("font-size:12.5px;color:var(--ink2);line-height:1.5")}>{r.text}</span>
            <code style={css("align-self:flex-start;font-family:'Geist Mono',monospace;font-size:11.5px;color:var(--muted);background:var(--panel2);padding:2px 7px;border-radius:5px")}>result_status = '{r.code}'</code>
          </div>
        </Fragment>)}
      </div>
    </section>

    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:2 1 560px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Failed channels per unit</h2>
            <p id="failure-scope" className="preview-note">Channel count changes this histogram only.</p>
            <span style={css("font-size:12.5px;color:var(--muted)")}>{fp.caption}</span>
          </div>
          <SegmentedControl label="Channel count" options={CHANNEL_OPTIONS} value={state.ch} onChange={ch => setState({ ch })} describedBy="failure-scope" />
        </div>
        <svg viewBox="0 0 680 230" role="img" aria-label={fp.aria} style={css("width:100%;height:auto;display:block")}>
          <line x1="40" x2="664" y1="180" y2="180" style={css("stroke:var(--line);stroke-width:1")}></line>
          <rect x={fp.zoneX} y="16" width={fp.zoneW} height="164" style={css("fill:var(--o3);fill-opacity:0.07")}></rect>
          <line x1={fp.zoneX} x2={fp.zoneX} y1="16" y2="180" style={css("stroke:var(--o3);stroke-width:1.5;stroke-dasharray:4 3")}></line>
          <text x={fp.zoneLX} y="30" style={css("font-size:11.5px;font-weight:600;fill:var(--warn-fg)")}>More failures than usable extras ({fp.extras})</text>
          {fbars.map((b, index5) => <Fragment key={index5}>
            <g >
              <rect x={b.x} y={b.y} width="52" height={b.h} rx="4" style={css("fill:" + String(b.fill))}></rect>
              <text x={b.cx} y={b.vy} style={css("font-size:12px;font-weight:600;fill:var(--ink);text-anchor:middle;font-family:'Geist Mono',monospace")}>{b.count}</text>
              <text x={b.cx} y="198" style={css("font-size:12px;fill:var(--ink2);text-anchor:middle;font-weight:500")}>{b.label}</text>
            </g>
          </Fragment>)}
          <text x="352" y="222" style={css("font-size:11.5px;fill:var(--muted);text-anchor:middle")}>failed channels in one unit, first pass</text>
        </svg>
      </div>

      <div style={css("flex:1 1 340px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Where failures concentrate</h2>
          <span style={css("font-size:12.5px;color:var(--muted)")}>Logical channel is the front-panel position; physical port is the switch output behind it.</span>
        </div>
        <div style={css("display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px")}>
          <div style={css("display:flex;flex-direction:column")}>
            <span style={css("font-size:12px;font-weight:600;color:var(--muted);padding-bottom:6px")}>Logical channel</span>
            {topCh.map((c, index6) => <Fragment key={index6}>
              <div style={css("display:flex;flex-direction:column;gap:4px;padding:7px 0;border-top:1px solid var(--line2)")}>
                <div style={css("display:flex;justify-content:space-between;font-variant-numeric:tabular-nums")}><span style={css("font-weight:500")}>Ch {c.n}</span><span style={css("font-weight:650")}>{c.count}</span></div>
                <div style={css("height:5px;border-radius:3px;background:var(--line2)")}><div style={css("height:5px;border-radius:3px;width:" + String(c.w) + "%;background:" + String(accent))}></div></div>
              </div>
            </Fragment>)}
          </div>
          <div style={css("display:flex;flex-direction:column")}>
            <span style={css("font-size:12px;font-weight:600;color:var(--muted);padding-bottom:6px")}>Physical port</span>
            {topPort.map((c, index7) => <Fragment key={index7}>
              <div style={css("display:flex;flex-direction:column;gap:4px;padding:7px 0;border-top:1px solid var(--line2)")}>
                <div style={css("display:flex;justify-content:space-between;gap:6px;font-variant-numeric:tabular-nums")}><span style={css("font-weight:500")}>Port {c.n} <span style={css("font-size:11px;font-weight:600;color:" + String(c.tagFg))}>{c.tag}</span></span><span style={css("font-weight:650")}>{c.count}</span></div>
                <div style={css("height:5px;border-radius:3px;background:var(--line2)")}><div style={css("height:5px;border-radius:3px;width:" + String(c.w) + "%;background:" + String(c.bar))}></div></div>
              </div>
            </Fragment>)}
          </div>
        </div>
        <div style={css("display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:var(--warn-bg);color:var(--warn-fg);font-size:12.5px")}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={css("flex:0 0 auto;margin-top:1px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><path d="M12 3l9.5 17h-19z"></path><path d="M12 10v4M12 17.5v.01"></path></svg>
          <span >Extra port 50 fails as a replacement candidate 31% of the time, about 3× the other extras.</span>
        </div>
      </div>
    </section>

    <section style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-wrap:wrap;gap:18px 28px;align-items:center")}>
      <div style={css("flex:1 1 260px;display:flex;flex-direction:column;gap:3px")}>
        <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Are operators following the analysis?</h2>
        <span style={css("font-size:12.5px;color:var(--muted)")}>From vw_ReplacementRecommendationUsage: recommended swaps that were recorded as replacements.</span>
      </div>
      <div style={css("flex:2 1 480px;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px")}>
        <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Recommendations</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>2,036</div></div>
        <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Used as recommended</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>1,812 <span style={css("font-size:13px;color:var(--ok-fg)")}>89%</span></div></div>
        <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Manual swaps</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>145</div></div>
        <div style={css("padding:10px 12px;border-radius:10px;background:var(--panel2)")}><div style={css("font-size:12px;color:var(--muted)")}>Avg improvement</div><div style={css("font-size:20px;font-weight:650;font-variant-numeric:tabular-nums")}>0.42 dB</div></div>
      </div>
    </section>

    <section style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 18px 8px;display:flex;flex-direction:column;gap:10px")}>
      <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Unrecoverable units</h2>
          <span style={css("font-size:12.5px;color:var(--muted)")}>Showing 7 of 27, newest first. Usable extras pass at both wavelengths and are not already in use.</span>
        </div>
        <PreviewButton className="lnk" style={css("font-size:13px;display:inline-flex;align-items:center;min-height:32px;border:0;background:transparent;padding:0")}>Open all in console</PreviewButton>
      </div>
      <div className="table-scroll" role="region" tabIndex={0} aria-label="Unrecoverable units table, scroll horizontally on narrow screens">
        <div role="table" aria-label="Unrecoverable units" style={css("min-width:900px")}>
          <div role="row" style={css("display:grid;grid-template-columns:0.95fr 1.25fr 0.6fr 0.8fr 1.8fr 0.75fr 1.1fr 1.6fr;gap:10px;padding:0 6px 9px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);font-weight:500")}>
            <span role="columnheader">Unit</span>
            <span role="columnheader">Configuration</span>
            <span role="columnheader">Station</span>
            <span role="columnheader">Finished</span>
            <span role="columnheader">Failed logical channels</span>
            <span role="columnheader" style={css("text-align:right")}>Usable extras</span>
            <span role="columnheader" style={css("text-align:right")}>Worst after swap</span>
            <span role="columnheader">Reason</span>
          </div>
          {units.map((u, index8) => <Fragment key={index8}>
            <div role="row" style={css("display:grid;grid-template-columns:0.95fr 1.25fr 0.6fr 0.8fr 1.8fr 0.75fr 1.1fr 1.6fr;gap:10px;align-items:center;padding:10px 6px;border-bottom:1px solid var(--line2);font-variant-numeric:tabular-nums")}>
              <span role="cell"><a href={`#/unit?serial=${encodeURIComponent(String(u.unit))}`}  className="lnk" style={css("font-family:'Geist Mono',monospace;font-weight:600")}>{u.unit}</a></span>
              <span role="cell" style={css("color:var(--ink2)")}>{u.cfg}</span>
              <span role="cell" style={css("color:var(--ink2)")}>{u.st}</span>
              <span role="cell" style={css("color:var(--ink2)")}>{u.when}</span>
              <span role="cell" style={css("display:flex;flex-wrap:wrap;gap:4px")}>{u.chs.map((c, index9) => <Fragment key={index9}><span style={css("font-family:'Geist Mono',monospace;font-size:12px;font-weight:600;padding:1px 6px;border-radius:5px;background:var(--bad-bg);color:var(--bad-fg)")}>{c}</span></Fragment>)}</span>
              <span role="cell" style={css("text-align:right")}>{u.extras}</span>
              <span role="cell" style={css("text-align:right;font-family:'Geist Mono',monospace;color:" + String(u.afterColor))}>{u.after}</span>
              <span role="cell"><span style={css("display:inline-flex;align-items:center;gap:7px;padding:3px 10px;border-radius:999px;font-size:12.5px;font-weight:600;background:" + String(u.bg) + ";color:" + String(u.fg))}><span style={css("width:6px;height:6px;border-radius:50%;background:currentColor")}></span>{u.reason}</span></span>
            </div>
          </Fragment>)}
        </div>
      </div>
    </section>

    <footer style={css("font-size:12px;color:var(--muted);line-height:1.55;max-width:900px")}>Synthetic replacement examples. Recovery labels and calculations are illustrative and require review before production use.</footer>

</>);
}
