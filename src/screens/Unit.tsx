import { Fragment, useState } from 'react';
import { css } from '../lib/css';
import { getUnitValues } from '../mock/unit';
import type { UnitState } from '../types';

export default function Unit({ dark }: { dark: boolean }) {
 const [serial, setSerial] = useState(() => new URLSearchParams(location.hash.split('?')[1] || '').get('serial') || 'DEMO-18793');
 const found = ['DEMO-18793', 'DEMO-SW-001'].includes(serial.trim().toUpperCase());
 const [state, setState] = useState<UnitState>({ wl: 'both' });
 const values = getUnitValues(state, patch => setState(current => ({ ...current, ...patch })), dark);
 const { accent, themeClass, wlOpts, ilBars, ilGrid, warnY, failY, bandY, failH, cells, steps, extras, repl, attempts } = values;
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
      <a href="#/" className="nav-a" style={css("display:flex;align-items:center;gap:11px;min-height:44px;padding:0 10px;border-radius:9px;text-decoration:none;font-weight:500;color:var(--ink2)")}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:1.9;stroke-linejoin:round")}><rect x="3" y="3" width="7.5" height="9" rx="1.6"></rect><rect x="13.5" y="3" width="7.5" height="5" rx="1.6"></rect><rect x="3" y="15" width="7.5" height="6" rx="1.6"></rect><rect x="13.5" y="11" width="7.5" height="10" rx="1.6"></rect></svg>
        Overview
      </a>
      <a href="#/failures" className="nav-a" style={css("display:flex;align-items:center;gap:11px;min-height:44px;padding:0 10px;border-radius:9px;text-decoration:none;font-weight:500;color:var(--ink2)")}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round")}><path d="M4 8h13l-3-3.2M20 16H7l3 3.2"></path></svg>
        Failures & replacements
      </a>
      <a href="#/unit" aria-current="page" style={css("display:flex;align-items:center;gap:11px;min-height:44px;padding:0 10px;border-radius:9px;text-decoration:none;font-weight:600;background:color-mix(in srgb," + String(accent) + " 11%,var(--panel));color:" + String(accent))}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round")}><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M15.5 15.5L21 21"></path></svg>
        Unit lookup
      </a>
      <a href="#/queries" className="nav-a" style={css("display:flex;align-items:center;gap:11px;min-height:44px;padding:0 10px;border-radius:9px;text-decoration:none;font-weight:500;color:var(--ink2)")}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round")}><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"></path></svg>
        Query console
      </a>
    </nav>
    <nav aria-label="Recently viewed units" style={css("display:flex;flex-direction:column;gap:2px")}>
      <span style={css("padding:0 10px 6px;font-size:11.5px;font-weight:600;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase")}>Recently viewed</span>
      <a href="#/unit?serial=DEMO-18793" className="nav-a" style={css("display:flex;align-items:center;justify-content:space-between;min-height:40px;padding:0 10px;border-radius:9px;text-decoration:none;color:var(--ink2);font-size:13px;font-family:'Geist Mono',monospace")}>DEMO-18793<span style={css("width:7px;height:7px;border-radius:50%;background:var(--o3)")}></span></a>
      <a href="#/unit?serial=DEMO-18801" className="nav-a" style={css("display:flex;align-items:center;justify-content:space-between;min-height:40px;padding:0 10px;border-radius:9px;text-decoration:none;color:var(--ink2);font-size:13px;font-family:'Geist Mono',monospace")}>DEMO-18801<span style={css("width:7px;height:7px;border-radius:50%;background:var(--o2)")}></span></a>
      <a href="#/unit?serial=DEMO-18761" className="nav-a" style={css("display:flex;align-items:center;justify-content:space-between;min-height:40px;padding:0 10px;border-radius:9px;text-decoration:none;color:var(--ink2);font-size:13px;font-family:'Geist Mono',monospace")}>DEMO-18761<span style={css("width:7px;height:7px;border-radius:50%;background:var(--o3)")}></span></a>
    </nav>
    <div style={css("margin-top:auto;display:flex;flex-direction:column;gap:8px;padding:14px;border-radius:12px;background:var(--panel2);border:1px solid var(--line2)")}>
      <div style={css("display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600")}><span style={css("width:8px;height:8px;border-radius:50%;background:#2FB36B;box-shadow:0 0 0 3px color-mix(in srgb,#2FB36B 25%,transparent)")}></span>Synthetic data · offline</div>
      <div style={css("font-family:'Geist Mono',monospace;font-size:12px;color:var(--muted);line-height:1.6")}>Milestone 0 · browser only<br  />Deterministic demo fixtures<br  />No database connection</div>
      <span style={css("align-self:flex-start;font-size:11.5px;font-weight:600;color:var(--warn-fg);background:var(--warn-bg);padding:3px 9px;border-radius:999px")}>Sample data</span>
    </div>
  </aside>

  <main tabIndex={-1} id="content" style={css("flex:999 1 560px;min-width:0;padding:26px 34px 44px;display:flex;flex-direction:column;gap:18px")}>

    <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px")}>
      <nav aria-label="Breadcrumb" style={css("display:flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)")}>
        <a href="#/" className="lnk">Overview</a><span aria-hidden="true">/</span><span >Units</span><span aria-hidden="true">/</span><span style={css("color:var(--ink);font-weight:500")}>DEMO-18793</span>
      </nav>
      <label style={css("display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);color:var(--muted);font-size:13px")}>
        <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={css("fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round")}><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="M15.5 15.5L21 21"></path></svg>
        <span style={css("position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)")}>Look up a unit</span>
        <input type="search" value={serial} onChange={event => setSerial(event.target.value)} placeholder="Try DEMO-18793 or DEMO-SW-001" style={css("border:none;background:transparent;outline:none;width:240px;font-size:13px;color:var(--ink)")} />
      </label>
    </div>


    {found ? <>
    <section style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:16px")}>
      <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:14px")}>
        <div style={css("display:flex;flex-direction:column;gap:8px")}>
          <div style={css("display:flex;flex-wrap:wrap;align-items:center;gap:10px")}>
            <h1 style={css("margin:0;font-size:28px;line-height:1.1;font-weight:650;letter-spacing:-0.01em;font-family:'Geist Mono',monospace")}>DEMO-18793</h1>
            <span style={css("display:inline-flex;align-items:center;gap:7px;padding:4px 11px;border-radius:999px;font-size:13px;font-weight:600;background:var(--bad-bg);color:var(--bad-fg)")}><span style={css("width:7px;height:7px;border-radius:50%;background:currentColor")}></span>Unrecoverable · ran out of extras</span>
          </div>
          <span style={css("font-size:13.5px;color:var(--ink2)")}>OSX-150 · single mode (1310 / 1550 nm) · 48 front-panel channels · 52 physical ports</span>
        </div>
        <div style={css("display:flex;flex-wrap:wrap;gap:8px")}>
          <button type="button" style={css("min-height:44px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;cursor:pointer")} disabled title="Design preview — available in a future milestone">Export raw CSV</button>
          <button type="button" style={css("min-height:44px;padding:0 14px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-weight:500;cursor:pointer")} disabled title="Design preview — available in a future milestone">Copy link</button>
        </div>
      </div>
      <dl style={css("margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px 18px;padding-top:14px;border-top:1px solid var(--line2)")}>
        <div ><dt style={css("font-size:12px;color:var(--muted)")}>Switch serial</dt><dd style={css("margin:2px 0 0;font-family:'Geist Mono',monospace;font-weight:500")}>DEMO-SW-001</dd></div>
        <div ><dt style={css("font-size:12px;color:var(--muted)")}>Station</dt><dd style={css("margin:2px 0 0;font-weight:500")}>Station 2</dd></div>
        <div ><dt style={css("font-size:12px;color:var(--muted)")}>Tested by</dt><dd style={css("margin:2px 0 0;font-weight:500")}>Demo operator B</dd></div>
        <div ><dt style={css("font-size:12px;color:var(--muted)")}>Runs</dt><dd style={css("margin:2px 0 0;font-weight:500")}>1 production · 2 retest attempts</dd></div>
        <div ><dt style={css("font-size:12px;color:var(--muted)")}>Total time</dt><dd style={css("margin:2px 0 0;font-weight:500")}>19m 06s <span style={css("color:var(--bad-fg);font-size:12.5px")}>+3m 46s vs avg</span></dd></div>
        <div ><dt style={css("font-size:12px;color:var(--muted)")}>Limits used</dt><dd style={css("margin:2px 0 0;font-weight:500")}>warn 2.25 · fail 2.5 dB</dd></div>
      </dl>
    </section>


    <section aria-label="What happened" style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:14px")}>
      <h2 style={css("margin:0;font-size:16px;font-weight:600")}>What happened</h2>
      <ol style={css("list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px")}>
        {steps.map((s, index0) => <Fragment key={index0}>
          <li style={css("display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:10px;background:var(--panel2);border-top:3px solid " + String(s.color))}>
            <span style={css("font-size:12px;color:var(--muted);font-family:'Geist Mono',monospace")}>{s.time}</span>
            <span style={css("font-weight:600")}>{s.title}</span>
            <span style={css("font-size:12.5px;color:var(--ink2);line-height:1.45")}>{s.text}</span>
          </li>
        </Fragment>)}
      </ol>
    </section>


    <section style={css("background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:10px")}>
      <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Insertion loss by logical channel</h2>
          <span style={css("font-size:12.5px;color:var(--muted)")}>Current attempt per channel, through the effective port map. Channels 19 and 41 show their post-replacement reading.</span>
        </div>
        <div role="group" aria-label="Wavelength" style={css("display:flex;background:var(--panel2);border:1px solid var(--line2);border-radius:10px;padding:3px;gap:2px")}>
          {wlOpts.map((o, index1) => <Fragment key={index1}>
            <button type="button" aria-pressed={o.pressed === 'true'} onClick={o.pick} style={css(o.style)}>{o.label}</button>
          </Fragment>)}
        </div>
      </div>
      <div style={css("display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12px;color:var(--ink2)")}>
        <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:2px;background:var(--o2)")}></span>1310 nm</span>
        <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:2px;background:var(--o1)")}></span>1550 nm</span>
        <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:14px;border-top:1.5px dashed var(--warn-fg)")}></span>Warning 2.25 dB</span>
        <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:14px;border-top:2px solid var(--bad-fg)")}></span>Fail 2.5 dB</span>
      </div>
      <svg viewBox="0 0 1000 250" role="img" aria-label="Insertion loss for 48 channels at 1310 and 1550 nm. Most channels read 1.6 to 2.2 dB. Channels 7, 12, 30 and 45 exceed the 2.5 dB fail limit; channel 30 is worst at 2.91 dB." style={css("width:100%;height:auto;display:block")}>
        {ilGrid.map((g, index2) => <Fragment key={index2}>
          <g >
            <line x1="44" x2="988" y1={g.y} y2={g.y} style={css("stroke:var(--grid);stroke-width:1")}></line>
            <text x="36" y={g.ty} style={css("font-size:11px;fill:var(--muted);text-anchor:end;font-family:'Geist Mono',monospace")}>{g.label}</text>
          </g>
        </Fragment>)}
        <rect x="44" y={bandY} width="944" height={failH} style={css("fill:var(--bad-bg);fill-opacity:0.7")}></rect>
        <line x1="44" x2="988" y1={warnY} y2={warnY} style={css("stroke:var(--warn-fg);stroke-width:1.2;stroke-dasharray:5 4")}></line>
        <line x1="44" x2="988" y1={failY} y2={failY} style={css("stroke:var(--bad-fg);stroke-width:1.6")}></line>
        {ilBars.map((b, index3) => <Fragment key={index3}>
          <g >
            <rect x={b.x1} y={b.y1} width="6" height={b.h1} rx="1.5" style={css("fill:var(--o2);opacity:" + String(b.op1))}></rect>
            <rect x={b.x2} y={b.y2} width="6" height={b.h2} rx="1.5" style={css("fill:var(--o1);opacity:" + String(b.op2))}></rect>
            <text x={b.cx} y={b.ly} style={css("font-size:10.5px;fill:" + String(b.lc) + ";text-anchor:middle;font-family:'Geist Mono',monospace;font-weight:" + String(b.lw))}>{b.label}</text>
          </g>
        </Fragment>)}
        <text x="516" y="246" style={css("font-size:11px;fill:var(--muted);text-anchor:middle")}>logical channel</text>
      </svg>
    </section>


    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:2 1 560px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:10px")}>
          <div style={css("display:flex;flex-direction:column;gap:3px")}>
            <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Channel map</h2>
            <span style={css("font-size:12.5px;color:var(--muted)")}>Worst of the two wavelengths. A port note means the channel was moved to an extra port.</span>
          </div>
          <div style={css("display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px;color:var(--ink2)")}>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--panel2);border:1px solid var(--line)")}></span>Pass</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--warn-bg);border:1px solid var(--warn-fg)")}></span>Warning</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;background:var(--bad-fg)")}></span>Fail</span>
            <span style={css("display:inline-flex;align-items:center;gap:6px")}><span style={css("width:10px;height:10px;border-radius:3px;border:2px solid " + String(accent))}></span>Replaced</span>
          </div>
        </div>
        <div className="unit-channel-map" style={css("display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:5px")}>
          {cells.map((c, index4) => <Fragment key={index4}>
            <div title={c.title} style={css("min-height:54px;border-radius:7px;padding:5px 6px;display:flex;flex-direction:column;justify-content:space-between;background:" + String(c.bg) + ";color:" + String(c.fg) + ";border:" + String(c.border))}>
              <span style={css("display:flex;justify-content:space-between;font-size:10.5px;line-height:1")}><span style={css("opacity:0.8")}>{c.n}</span><span style={css("font-weight:600")}>{c.port}</span></span>
              <span style={css("font-size:12.5px;font-weight:650;font-family:'Geist Mono',monospace;text-align:right;line-height:1")}>{c.v}</span>
            </div>
          </Fragment>)}
        </div>
      </div>

      <div style={css("flex:1 1 320px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:12px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Extra ports</h2>
          <span style={css("font-size:12.5px;color:var(--muted)")}>4 extras behind the 48 front-panel channels. 2 were usable; both are now in use.</span>
        </div>
        <div role="table" aria-label="Extra ports">
          <div role="row" style={css("display:grid;grid-template-columns:0.7fr 0.8fr 0.8fr 1.4fr;gap:8px;padding:0 2px 8px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);font-weight:500")}>
            <span role="columnheader">Port</span><span role="columnheader" style={css("text-align:right")}>1310</span><span role="columnheader" style={css("text-align:right")}>1550</span><span role="columnheader">Status</span>
          </div>
          {extras.map((e, index5) => <Fragment key={index5}>
            <div role="row" style={css("display:grid;grid-template-columns:0.7fr 0.8fr 0.8fr 1.4fr;gap:8px;align-items:center;padding:10px 2px;border-bottom:1px solid var(--line2);font-variant-numeric:tabular-nums")}>
              <span role="cell" style={css("font-family:'Geist Mono',monospace;font-weight:600")}>{e.port}</span>
              <span role="cell" style={css("text-align:right;font-family:'Geist Mono',monospace;color:" + String(e.c1))}>{e.a}</span>
              <span role="cell" style={css("text-align:right;font-family:'Geist Mono',monospace;color:" + String(e.c2))}>{e.b}</span>
              <span role="cell"><span style={css("font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:" + String(e.bg) + ";color:" + String(e.fg))}>{e.status}</span></span>
            </div>
          </Fragment>)}
        </div>
        <div style={css("display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:10px;background:var(--bad-bg);color:var(--bad-fg);font-size:12.5px;margin-top:auto")}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" style={css("flex:0 0 auto;margin-top:1px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round")}><circle cx="12" cy="12" r="9"></circle><path d="M12 7.5v5.5M12 16.5v.01"></path></svg>
          <span >6 channels failed but only 2 extras passed. Channels 7, 12, 30 and 45 have nowhere left to go.</span>
        </div>
      </div>
    </section>


    <section style={css("display:flex;flex-wrap:wrap;gap:12px")}>
      <div style={css("flex:1 1 460px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 18px 8px;display:flex;flex-direction:column;gap:10px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Replacement history</h2>
          <span style={css("font-size:12.5px;color:var(--muted)")}>CHANNEL_REPLACEMENTS, oldest first.</span>
        </div>
        <div style={css("overflow-x:auto")}>
          <div role="table" aria-label="Replacement history" style={css("min-width:460px")}>
            <div role="row" style={css("display:grid;grid-template-columns:0.7fr 0.6fr 1.1fr 1.5fr 0.9fr;gap:10px;padding:0 4px 8px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);font-weight:500")}>
              <span role="columnheader">Time</span><span role="columnheader">Ch</span><span role="columnheader">Port move</span><span role="columnheader">Source</span><span role="columnheader" style={css("text-align:right")}>Gain</span>
            </div>
            {repl.map((r, index6) => <Fragment key={index6}>
              <div role="row" style={css("display:grid;grid-template-columns:0.7fr 0.6fr 1.1fr 1.5fr 0.9fr;gap:10px;align-items:center;padding:11px 4px;border-bottom:1px solid var(--line2);font-variant-numeric:tabular-nums")}>
                <span role="cell" style={css("font-family:'Geist Mono',monospace;color:var(--ink2)")}>{r.t}</span>
                <span role="cell" style={css("font-weight:600")}>{r.ch}</span>
                <span role="cell" style={css("font-family:'Geist Mono',monospace")}>{r.move}</span>
                <span role="cell" style={css("color:var(--ink2)")}>{r.src}</span>
                <span role="cell" style={css("text-align:right;font-weight:600;color:var(--ok-fg)")}>{r.gain}</span>
              </div>
            </Fragment>)}
          </div>
        </div>
      </div>

      <div style={css("flex:1.3 1 520px;min-width:0;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 18px 8px;display:flex;flex-direction:column;gap:10px")}>
        <div style={css("display:flex;flex-direction:column;gap:3px")}>
          <h2 style={css("margin:0;font-size:16px;font-weight:600")}>Measurement attempts on failing channels</h2>
          <span style={css("font-size:12.5px;color:var(--muted)")}>Every attempt is kept; the current one is the highest attempt number.</span>
        </div>
        <div style={css("overflow-x:auto")}>
          <div role="table" aria-label="Measurement attempts" style={css("min-width:520px")}>
            <div role="row" style={css("display:grid;grid-template-columns:0.5fr 0.7fr 0.6fr 0.8fr 0.8fr 1.1fr;gap:10px;padding:0 4px 8px;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted);font-weight:500")}>
              <span role="columnheader">Ch</span><span role="columnheader">Attempt</span><span role="columnheader">Port</span><span role="columnheader" style={css("text-align:right")}>1310 nm</span><span role="columnheader" style={css("text-align:right")}>1550 nm</span><span role="columnheader">Result</span>
            </div>
            {attempts.map((a, index7) => <Fragment key={index7}>
              <div role="row" style={css("display:grid;grid-template-columns:0.5fr 0.7fr 0.6fr 0.8fr 0.8fr 1.1fr;gap:10px;align-items:center;padding:9px 4px;border-bottom:1px solid var(--line2);font-variant-numeric:tabular-nums;opacity:" + String(a.op))}>
                <span role="cell" style={css("font-weight:600")}>{a.ch}</span>
                <span role="cell" style={css("color:var(--ink2)")}>{a.att}</span>
                <span role="cell" style={css("font-family:'Geist Mono',monospace;color:var(--ink2)")}>{a.port}</span>
                <span role="cell" style={css("text-align:right;font-family:'Geist Mono',monospace;color:" + String(a.c1))}>{a.w1}</span>
                <span role="cell" style={css("text-align:right;font-family:'Geist Mono',monospace;color:" + String(a.c2))}>{a.w2}</span>
                <span role="cell"><span style={css("font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;background:" + String(a.bg) + ";color:" + String(a.fg))}>{a.res}</span></span>
              </div>
            </Fragment>)}
          </div>
        </div>
      </div>
    </section>


</> : <section className="empty-state" role="status"><h1>No unit fixture found</h1><p>This demo contains one detailed synthetic unit: DEMO-18793 (switch DEMO-SW-001).</p><button type="button" className="lnk" onClick={() => setSerial('DEMO-18793')}>Load example unit</button></section>}

    <footer style={css("font-size:12px;color:var(--muted);line-height:1.55;max-width:900px")}>Synthetic unit example. Readings, limits, attempts and replacement events are illustrative; this is not a manufacturing disposition.</footer>
  </main>
</div>
</>);
}
