import { CONFIGURATIONS } from './fixtures';
import type { OverviewState, Purpose, TimeRange, RecentRun } from '../types';
import type { OverviewValues, SummaryFixture, RecentFixture, SummaryView } from './contracts';
import { ACCENT, PURPOSES, formatDuration, durationSeconds, sparkline } from './presentation';

// Adapted Claude sample logic. All fixtures are synthetic, never production metrics.
export function getOverviewValues(state: OverviewState): OverviewValues {
    const accent = ACCENT;
    const cur = state.range;
    const good = { bg: 'var(--ok-bg)', fg: 'var(--ok-fg)' };
    const bad = { bg: 'var(--bad-bg)', fg: 'var(--bad-fg)' };
    const flat = { bg: 'var(--panel2)', fg: 'var(--muted)' };


    // Per run purpose and range: [channels tested, failed channels, passed first time, passed after replacement, unrecoverable]
    const RAW: Record<Purpose, Record<TimeRange, SummaryFixture>> = {
      production: { today: [1008, 41, 9, 15, 0], yesterday: [2520, 96, 21, 38, 2], week: [8184, 319, 70, 124, 4], month: [51048, 1991, 446, 811, 27] },
      engineering: { today: [120, 9, 1, 2, 0], yesterday: [216, 15, 1, 3, 1], week: [552, 38, 3, 9, 2], month: [3552, 242, 22, 65, 9] },
      training: { today: [0, 0, 0, 0, 0], yesterday: [48, 4, 0, 1, 0], week: [144, 13, 1, 3, 0], month: [648, 58, 3, 13, 2] },
      calibration: { today: [0, 0, 0, 0, 0], yesterday: [0, 0, 0, 0, 0], week: [48, 0, 1, 0, 0], month: [288, 4, 5, 1, 0] }
    };
    // Same figures for the comparison period
    const PREV: Record<Purpose, Record<TimeRange, SummaryFixture>> = {
      production: { today: [969, 37, 8, 14, 1], yesterday: [2571, 103, 22, 38, 1], week: [7946, 310, 66, 120, 6], month: [48617, 1945, 407, 784, 32] },
      engineering: { today: [96, 8, 1, 1, 0], yesterday: [264, 21, 1, 4, 1], week: [504, 37, 3, 8, 1], month: [3120, 225, 18, 58, 8] },
      training: { today: [0, 0, 0, 0, 0], yesterday: [0, 0, 0, 0, 0], week: [96, 10, 0, 2, 0], month: [720, 66, 3, 14, 3] },
      calibration: { today: [0, 0, 0, 0, 0], yesterday: [48, 1, 1, 0, 0], week: [48, 0, 1, 0, 0], month: [240, 3, 4, 1, 0] }
    };
    const PNAMES: Record<Purpose, string> = { production: 'Production', engineering: 'Engineering', training: 'Training', calibration: 'Calibration' };
    const pick = state.purp;
    const on = PURPOSES.filter(k => pick[k]);
    const rk = cur;
    const sum = (src: Record<Purpose, Record<TimeRange, SummaryFixture>>): SummaryFixture => on.reduce<SummaryFixture>((acc, key) => { const row = src[key][rk]; return [acc[0] + row[0], acc[1] + row[1], acc[2] + row[2], acc[3] + row[3], acc[4] + row[4]]; }, [0, 0, 0, 0, 0]);
    const curT = sum(RAW), prvT = sum(PREV);
    const unitsOf = (t: SummaryFixture) => t[2] + t[3] + t[4];
    const pct = (a: number, b: number) => b ? a / b * 100 : 0;
    const signed = (v: number, dp: number, unit: string) => (Math.abs(v) < Math.pow(10, -dp) / 2 ? '' : (v > 0 ? '▲ ' : '▼ ')) + Math.abs(v).toFixed(dp) + unit;
    const periods: Record<TimeRange, [label: string, comparison: string, timeOffsetSeconds: number]> = {
      today: ['today', 'vs this time yesterday', -6], yesterday: ['yesterday', 'vs Tuesday', 9],
      week: ['this week', 'vs same days last week', 2], month: ['in the last 30 days', 'vs prior 30 days', 0]
    };
    const RL = periods[rk];
    const u = unitsOf(curT), pu = unitsOf(prvT);
    const fpyV = pct(curT[2], u), fpyP = pct(prvT[2], pu), failV = pct(curT[1], curT[0]), failP = pct(prvT[1], prvT[0]);
    const failingUnits = curT[3] + curT[4];
    const d: SummaryView = {
      label: RL[0], prev: RL[1], timeOff: RL[2], outCaption: '', outAria: '',
      channels: curT[0].toLocaleString('en-US'), chD: prvT[0] ? signed(pct(curT[0] - prvT[0], prvT[0]), 0, '%') : 'new',
      units: u.toLocaleString('en-US'), unitsD: signed(u - pu, 0, ''),
      fpy: u ? fpyV.toFixed(1) + '%' : '—', fpyD: u ? signed(fpyV - fpyP, 1, ' pts') : '—',
      fail: curT[0] ? failV.toFixed(1) + '%' : '—', failD: curT[0] ? signed(failV - failP, 1, ' pts') : '—',
      unrec: String(curT[4]), unrecD: signed(curT[4] - prvT[4], 0, ''),
      out: [curT[2], curT[3], curT[4]],
      perUnit: failingUnits ? (curT[1] / failingUnits).toFixed(1) : '0'
    };
    const totalUnits = Math.max(u, 1);
    const unitScale = 1;

    const onlyProd = on.length === 1 && on[0] === 'production';
    const nonProd = on.filter(k => k !== 'production').map(k => PNAMES[k].toLowerCase());
    const scope = {
      show: !onlyProd,
      heading: onlyProd ? 'Production overview' : (pick.production ? 'Production + ' + nonProd.join(' + ') : on.map(k => PNAMES[k]).join(' + ') + ' runs'),
      title: pick.production ? 'Mixed run purposes.' : 'Non-production runs only.',
      text: pick.production ? 'Numbers include ' + nonProd.join(' and ') + ' runs, so they are not production yield. Good for checking that queries and charts behave.' : 'Use this to try things out on ' + nonProd.join(' and ') + ' data. Nothing here is a production metric.',
      bg: pick.production ? 'var(--info-bg)' : 'var(--warn-bg)', fg: pick.production ? 'var(--info-fg)' : 'var(--warn-fg)'
    };
    const purposes = PURPOSES.map(k => {
      const sel = !!pick[k];
      return {
        value: k, label: PNAMES[k], count: unitsOf(RAW[k][rk]).toLocaleString('en-US'), pressed: sel,
        boxBorder: sel ? accent : 'var(--line)', boxBg: sel ? accent : 'transparent', checkOp: sel ? 1 : 0,
        style: 'display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 11px;border-radius:8px;cursor:pointer;font-size:13.5px;font-weight:' + (sel ? '600;border:1px solid color-mix(in srgb,' + accent + ' 45%,var(--line));background:color-mix(in srgb,' + accent + ' 8%,var(--panel));color:var(--ink)' : '500;border:1px solid var(--line);background:var(--panel);color:var(--ink2)')
      };
    });
    d.outCaption = u.toLocaleString('en-US') + ' units finished ' + d.label;
    d.outAria = 'Unit outcomes: ' + d.out[0] + ' passed first time, ' + d.out[1] + ' passed after replacement, ' + d.out[2] + ' unrecoverable';


    // configurations, last 30 days
    const CFG = CONFIGURATIONS;
    const ci = state.cfg >= 0 && state.cfg < CFG.length ? state.cfg : 0;
    const cfgRows = CFG.map((c, i) => {
      const on = i === ci;
      const dl = c[7];
      return {
        model: c[0], mode: c[1], ch: c[2], units: String(Math.round(c[3] * unitScale)), avg: formatDuration(c[4]), med: formatDuration(c[5]), p90: formatDuration(c[6]),
        perCh: (c[4] / c[2]).toFixed(1) + ' s',
        spark: sparkline(c[8], 120, 24).line,
        sparkColor: on ? accent : 'var(--muted)',
        delta: (dl < 0 ? '−' : '+') + Math.abs(dl) + ' s',
        dColor: dl < 0 ? 'var(--ok-fg)' : 'var(--warn-fg)',
        mark: on ? accent : 'transparent',
        pressed: on,
      };
    });
    const C = CFG[ci];
    const sel = { title: C[0] + ' · ' + C[1] + ' · ' + C[2] + ' channels', units: Math.round(C[3] * unitScale), avg: formatDuration(C[4]), med: formatDuration(C[5]), p90: formatDuration(C[6]), aria: '' };

    // histogram of selected config (1-minute bins)
    const m = C[4] / 60, sd = (C[6] - C[4]) / 1.2816 / 60;
    const b0 = Math.floor(m - 3);
    const NB = 8, HX0 = 12, HX1 = 388, HY1 = 160, HH = 120;
    const pdf = (x: number) => Math.exp(-0.5 * Math.pow((x - m) / sd, 2)) * (x > m ? 0.82 + 0.18 * Math.exp(-(x - m)) : 1);
    const raw = []; for (let i = 0; i < NB; i++) raw.push(pdf(b0 + i + 0.5));
    const rs = raw.reduce((a, b) => a + b, 0);
    const counts = raw.map(v => Math.round(sel.units * v / rs));
    const cmax = Math.max(1, Math.max.apply(null, counts));
    const bw = (HX1 - HX0) / NB;
    const hist = counts.map((c, i) => {
      const h = HH * c / cmax;
      const x = HX0 + i * bw + 3;
      const inMean = m >= b0 + i && m < b0 + i + 1;
      return { x: x.toFixed(1), w: (bw - 6).toFixed(1), cx: (x + (bw - 6) / 2).toFixed(1), lx: (HX0 + i * bw).toFixed(1), y: (HY1 - h).toFixed(1), h: Math.max(h, 1).toFixed(1), vy: (HY1 - h - 5).toFixed(1), count: String(c), label: String(b0 + i), fill: inMean ? accent : 'color-mix(in srgb,' + accent + ' 38%,var(--panel))' };
    });
    const meanX = HX0 + (m - b0) / NB * (HX1 - HX0);
    sel.aria = 'Histogram of ' + sel.title + ' test time. Most units take ' + Math.floor(m - 1) + ' to ' + Math.ceil(m + 1) + ' minutes, average ' + sel.avg;

    // KPIs
    const fpyBad = d.fpyD.indexOf('▼') === 0;
    const failBad = d.failD.indexOf('▲') === 0;
    const unrecBad = d.unrecD.indexOf('▲') === 0;
    const chUp = d.chD.indexOf('▲') === 0;
    const tdl = C[7] + d.timeOff;
    const kk: { label: string; value: string; delta: string; tone: { bg: string; fg: string }; sub: string; s: number[]; vc?: string }[] = [
      { label: 'Channels tested', value: d.channels, delta: d.chD, tone: chUp ? good : flat, sub: d.prev, s: [2310, 2420, 2380, 2500, 2460, 2390, 2560, 2470, 2530, 2600, 2440, 2380, 2280, 2520] },
      { label: 'Units completed', value: d.units, delta: d.unitsD, tone: chUp ? good : flat, sub: d.perUnit + ' channels swapped per failing unit', s: [56, 58, 57, 60, 59, 57, 62, 60, 61, 63, 59, 57, 55, 61] },
      { label: 'First-pass yield', value: d.fpy, delta: d.fpyD, tone: fpyBad ? bad : good, sub: 'units with no failing channel', s: [33.1, 34.0, 33.6, 34.8, 33.9, 35.2, 34.1, 34.6, 35.5, 34.9, 35.8, 34.2, 34.4, 37.5] },
      { label: 'Channel failure rate', value: d.fail, delta: d.failD, tone: failBad ? bad : (d.failD.indexOf('0.0') === 0 ? flat : good), sub: 'over 2.5 dB at 1310 or 1550 nm', s: [3.7, 4.0, 3.5, 3.9, 4.4, 3.6, 3.8, 4.1, 3.3, 3.9, 3.6, 4.1, 3.4, 4.5, 3.8, 3.3, 4.3, 4.0, 3.8, 4.1] },
      { label: 'Avg test time · ' + C[0] + ' ' + C[1] + ' ' + C[2] + 'ch', value: formatDuration(C[4] + d.timeOff), delta: (tdl < 0 ? '▼ ' : '▲ ') + Math.abs(tdl) + ' s', tone: tdl < 0 ? good : bad, sub: 'demo average ' + d.label, s: C[8] },
      { label: 'Unrecoverable units', value: d.unrec, delta: d.unrecD, tone: unrecBad ? bad : good, sub: 'failed even after replacements', s: [2, 1, 1, 0, 2, 1, 0, 1, 2, 1, 0, 1, 2, 0], vc: d.unrec === '0' ? 'var(--ink)' : 'var(--bad-fg)' }
    ];
    const kpis = kk.map(k => { const sp = sparkline(k.s, 160, 34); return { label: k.label, value: k.value, delta: k.delta, dBg: k.tone.bg, dFg: k.tone.fg, sub: k.sub, line: sp.line, area: sp.area, valueColor: k.vc || 'var(--ink)' }; });


    // outcomes
    const outColors = ['var(--o1)', 'var(--o2)', 'var(--o3)'];
    const outLabels = ['Passed first time', 'Passed after replacement', 'Unrecoverable'];
    const outSegs = d.out.map((n, i) => ({ pct: (n > 0 ? Math.max(n / totalUnits * 100, 1.5) : 0).toFixed(2), color: outColors[i] }));
    const outLegend = d.out.map((n, i) => ({ label: outLabels[i], count: n.toLocaleString('en-US'), share: (n / totalUnits * 100).toFixed(1) + '%', color: outColors[i] }));

    // failure-rate line, 20 workdays
    const fr: [label: string, rate: number][] = [['Oct 9', 3.7], ['', 4.0], ['', 3.5], ['', 3.9], ['', 4.4], ['Oct 16', 3.6], ['', 3.8], ['', 4.1], ['', 3.3], ['', 3.9], ['Oct 23', 3.6], ['', 4.1], ['', 3.4], ['', 4.5], ['', 3.8], ['Oct 30', 3.3], ['', 4.3], ['', 4.0], ['', 3.8], ['Nov 5', 4.1]];
    const LX0 = 52, LX1 = 616, LY0 = 20, LY1 = 186, LMIN = 2, LMAX = 5;
    const lx = (i: number) => LX0 + (LX1 - LX0) * i / (fr.length - 1);
    const ly = (v: number) => LY1 - (LY1 - LY0) * (v - LMIN) / (LMAX - LMIN);
    const linePath = fr.map((p, i) => (i ? 'L' : 'M') + lx(i).toFixed(1) + ' ' + ly(p[1]).toFixed(1)).join(' ');
    const areaPath = linePath + ' L' + LX1 + ' ' + LY1 + ' L' + LX0 + ' ' + LY1 + ' Z';
    const lineGrid = [2, 3, 4, 5].map(v => ({ y: ly(v).toFixed(1), ty: (ly(v) + 4).toFixed(1), label: v + '%' }));
    const dots = fr.map((p, i) => ({ x: lx(i).toFixed(1), y: ly(p[1]).toFixed(1), r: i === fr.length - 1 ? 5 : 3, label: p[0] }));

    // throughput bars
    const days: [weekday: string, date: string, channels: number][] = [['F', 'Oct 23', 2436], ['S', '24', 0], ['S', '25', 0], ['M', '26', 2568], ['T', '27', 2604], ['W', '28', 2472], ['T', '29', 2532], ['F', '30', 2316], ['S', '31', 0], ['S', 'Nov 1', 0], ['M', '2', 2376], ['T', '3', 2280], ['W', '4', 2520], ['T', '5', 1008]];
    const BX0 = 52, BX1 = 624, BY1 = 172, BH = 146, BMAX = 3000;
    const step = (BX1 - BX0) / days.length;
    const bars = days.map((b, i) => {
      const h = b[2] ? BH * b[2] / BMAX : 2;
      const x = BX0 + i * step + (step - 28) / 2;
      return { x: x.toFixed(1), cx: (x + 14).toFixed(1), y: (BY1 - h).toFixed(1), h: h.toFixed(1), vy: (BY1 - h - 5).toFixed(1), value: b[2] ? (b[2] / 1000).toFixed(1) + 'k' : '', wd: b[0], day: b[1], fill: b[2] === 0 ? 'var(--line)' : (i === days.length - 1 ? 'color-mix(in srgb,' + accent + ' 35%,var(--panel))' : accent) };
    });
    const barGrid = [0, 1000, 2000, 3000].map(v => ({ y: (BY1 - BH * v / BMAX).toFixed(1), ty: (BY1 - BH * v / BMAX + 4).toFixed(1), label: v ? (v / 1000) + 'k' : '0' }));

    // stations
    const st: [station: string, units: number, secondsPerChannel: number, failureRate: number, retestShare: string][] = [['Station 1', 352, 19.1, 3.6, '4.8%'], ['Station 2', 331, 19.8, 4.4, '7.9%'], ['Station 3', 318, 18.6, 3.7, '5.1%'], ['Station 4', 283, 19.4, 3.9, '5.6%']];
    const stations = st.map(s => ({ name: s[0], units: String(s[1]), spc: s[2].toFixed(1), fail: s[3].toFixed(1) + '%', w: (s[3] / 5 * 100).toFixed(0), barColor: s[3] > 4.2 ? 'var(--o3)' : accent, fColor: s[3] > 4.2 ? 'var(--warn-fg)' : 'var(--ink)', retest: s[4] }));

    // heatmap
    const hot: Partial<Record<number, number>> = { 19: 96, 33: 81, 41: 70, 8: 52, 27: 47 };
    const ramp: [string, string][] = [['#FDF1E7', '#5A2A0A'], ['#F9D3B4', '#5A2A0A'], ['#F2A673', '#3D1C06'], ['#D9631F', '#FFFFFF'], ['#8F3510', '#FFFFFF']];
    const lvl = (v: number) => v <= 28 ? 0 : v <= 34 ? 1 : v <= 40 ? 2 : v <= 60 ? 3 : 4;
    const cells = [];
    for (let i = 1; i <= 48; i++) {
      const v = hot[i] ?? 22 + ((i * 7 + 3) % 19);
      const p = ramp[lvl(v)];
      cells.push({ n: String(i), count: String(v), bg: p[0], fg: p[1], ring: v >= 60 ? '2px solid var(--ink)' : 'none', title: 'Logical channel ' + i + ': ' + v + ' first-pass failures' });
    }
    const legendCells = ramp.map(r => ({ bg: r[0] }));

    // recent units
    const chip = {
      pass: { bg: 'var(--ok-bg)', fg: 'var(--ok-fg)', text: 'Passed first time' },
      repl: { bg: 'var(--info-bg)', fg: 'var(--info-fg)', text: 'Passed after replacement' },
      bad: { bg: 'var(--bad-bg)', fg: 'var(--bad-fg)', text: 'Unrecoverable' }
    };
    const R: RecentFixture[] = [
      ['DEMO-18804', 'OSX-150 · SM · 48', 'St 1', 'Today 08:12', '15m 02s', 0, 0, 2.21, 'pass', 'production'],
      ['DEMO-18803', 'OSX-100 · MM · 36', 'St 3', 'Today 08:03', '11m 12s', 2, 2, 2.38, 'repl', 'production'],
      ['DEMO-18802', 'OSX-150 · SM · 24', 'St 4', 'Today 07:49', '7m 58s', 0, 0, 1.97, 'pass', 'production'],
      ['DEMO-18801', 'OSX-150 · SM · 48', 'St 2', 'Today 07:41', '15m 40s', 3, 3, 2.44, 'repl', 'production'],
      ['DEMO-18800', 'OSX-150 · SM · 48', 'St 3', 'Today 07:35', '16m 22s', 4, 3, 2.47, 'repl', 'engineering'],
      ['DEMO-18799', 'OSX-150 · SM · 36', 'St 1', 'Today 07:30', '11m 51s', 1, 1, 2.31, 'repl', 'production'],
      ['DEMO-18798', 'OSX-100 · SM · 48', 'St 3', 'Today 07:22', '13m 49s', 0, 0, 2.08, 'pass', 'production'],
      ['DEMO-18797', 'OSX-100 · SM · 24', 'St 4', 'Today 07:10', '7m 41s', 1, 1, 2.19, 'repl', 'training'],
      ['DEMO-18795', 'OSX-100 · MM · 48', 'St 4', 'Yesterday 17:02', '15m 03s', 2, 1, 2.58, 'bad', 'engineering'],
      ['DEMO-18793', 'OSX-150 · SM · 48', 'St 2', 'Yesterday 16:31', '19m 06s', 6, 2, 2.91, 'bad', 'production'],
      ['DEMO-18792', 'OSX-150 · SM · 48', 'St 4', 'Yesterday 16:20', '15m 11s', 1, 1, 2.29, 'repl', 'production'],
      ['DEMO-18790', 'OSX-150 · SM · 36', 'St 1', 'Yesterday 15:58', '12m 04s', 0, 0, 2.14, 'pass', 'production']
    ];
    const TAGS: Partial<Record<Purpose, [string, string]>> = { engineering: ['ENG', 'Engineering run'], training: ['TRN', 'Training run'], calibration: ['CAL', 'Calibration run'] };
    const runs: RecentRun[] = R.filter(r => pick[r[9]] && (cur === 'today' ? r[3].startsWith('Today') : cur === 'yesterday' ? r[3].startsWith('Yesterday') : true)).slice(0, 8).map(r => ({ tagOn: r[9] !== 'production', tag: TAGS[r[9]]?.[0] ?? '', tagTitle: TAGS[r[9]]?.[1] ?? '', durationSeconds: durationSeconds(r[4]), ilDb: r[7], model: r[1].startsWith('OSX-150') ? 'OSX-150' : 'OSX-100', station: r[2], unit: r[0], cfg: r[1], st: r[2], when: r[3], dur: r[4], failed: String(r[5]), repl: String(r[6]), il: r[7].toFixed(2) + ' dB', ilColor: r[7] > 2.5 ? 'var(--bad-fg)' : (r[7] > 2.25 ? 'var(--warn-fg)' : 'var(--ink2)'), result: chip[r[8]].text, bg: chip[r[8]].bg, fg: chip[r[8]].fg }));

    return {
      accent, d, kpis, purposes, scope, cfgRows, sel, hist,
      meanX: meanX.toFixed(1), meanLX: Math.min(Math.max(meanX, 50), 350).toFixed(1),
      outSegs, outLegend,
      linePath, areaPath, lineGrid, dots, avgY: ly(3.9).toFixed(1), lastX: (lx(fr.length - 1) - 8).toFixed(1), lastY: (ly(4.1) - 12).toFixed(1),
      bars, barGrid, stations, cells, legendCells, runs
    };
}
