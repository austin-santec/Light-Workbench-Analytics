// Adapted Claude sample logic. All fixtures are synthetic, never production metrics.
/**
 * @param {import('../types').UnitState} state
 * @param {(patch: Partial<import('../types').UnitState>) => void} setState
 * @param {boolean} dark
 */
export function getUnitValues(state, setState, dark) {
    const accent = '#e60013';
    const themeClass = dark ? 'dark' : '';
    const WARN = 2.25, FAIL = 2.5;

    // current readings [1310, 1550]
    const special = { 7: [2.31, 2.62], 12: [2.44, 2.58], 19: [2.02, 2.18], 30: [2.67, 2.91], 41: [1.94, 2.09], 45: [2.35, 2.66], 3: [2.12, 2.31], 22: [2.05, 2.27], 38: [2.19, 2.36] };
    const replaced = { 19: 'p49', 41: 'p51' };
    const IL = [];
    for (let i = 1; i <= 48; i++) {
      if (special[i]) { IL.push(special[i]); continue; }
      const w2 = 1.70 + ((i * 37) % 45) / 100;
      const w1 = w2 - 0.08 - ((i * 13) % 10) / 100;
      IL.push([Math.round(w1 * 100) / 100, Math.round(w2 * 100) / 100]);
    }

    const wl = state.wl;
    const wlOpts = [['both', 'Both'], ['1310', '1310 nm'], ['1550', '1550 nm']].map(([k, label]) => ({
      label, pressed: k === wl ? 'true' : 'false',
      style: 'min-height:36px;padding:0 12px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:' + (k === wl ? '600;background:var(--panel);color:var(--ink);box-shadow:0 1px 2px rgba(14,22,33,0.12),0 0 0 1px var(--line)' : '500;background:transparent;color:var(--muted)'),
      pick: () => setState({ wl: k })
    }));

    // chart geometry
    const X0 = 44, X1 = 988, Y0 = 14, Y1 = 214, VMIN = 1.4, VMAX = 3.1;
    const yv = v => Y1 - (Y1 - Y0) * (v - VMIN) / (VMAX - VMIN);
    const step = (X1 - X0) / 48;
    const ilBars = IL.map((p, i) => {
      const cx = X0 + i * step + step / 2;
      const worst = Math.max(p[0], p[1]);
      const failing = worst > FAIL;
      const labelOn = (i + 1) % 4 === 0 || i === 0 || failing || replaced[i + 1];
      return {
        x1: (cx - 6.5).toFixed(1), y1: yv(p[0]).toFixed(1), h1: (Y1 - yv(p[0])).toFixed(1), op1: wl === '1550' ? 0.12 : 1,
        x2: (cx + 0.5).toFixed(1), y2: yv(p[1]).toFixed(1), h2: (Y1 - yv(p[1])).toFixed(1), op2: wl === '1310' ? 0.12 : 1,
        cx: cx.toFixed(1), ly: 230, label: labelOn ? String(i + 1) : '',
        lc: failing ? 'var(--bad-fg)' : (replaced[i + 1] ? accent : 'var(--muted)'), lw: failing || replaced[i + 1] ? 700 : 400
      };
    });
    const ilGrid = [1.5, 2.0, 2.5, 3.0].map(v => ({ y: yv(v).toFixed(1), ty: (yv(v) + 4).toFixed(1), label: v.toFixed(1) }));

    // channel map
    const cells = IL.map((p, i) => {
      const n = i + 1;
      const worst = Math.max(p[0], p[1]);
      const fail = worst > FAIL, warn = !fail && worst > WARN;
      const rp = replaced[n];
      return {
        n: String(n), v: worst.toFixed(2), port: rp ? '→' + rp : '',
        bg: fail ? 'var(--bad-fg)' : (warn ? 'var(--warn-bg)' : 'var(--panel2)'),
        fg: fail ? 'var(--panel)' : (warn ? 'var(--warn-fg)' : 'var(--ink2)'),
        border: rp ? '2px solid ' + accent : (warn ? '1px solid color-mix(in srgb,var(--warn-fg) 45%,transparent)' : '1px solid var(--line2)'),
        title: 'Channel ' + n + ': 1310 nm ' + p[0].toFixed(2) + ' dB, 1550 nm ' + p[1].toFixed(2) + ' dB' + (rp ? ', moved to port ' + rp.slice(1) : '') + (fail ? ', FAIL' : (warn ? ', warning' : ''))
      };
    });

    const steps = [
      { time: 'Nov 4 · 16:12', title: 'Run 1 started', text: 'Production run, 48 channels at 1310 and 1550 nm, Station 2.', color: 'var(--line)' },
      { time: '16:31', title: '6 channels failed', text: 'Ch 7, 12, 19, 30, 41, 45 over 2.5 dB. Ch 19 and 30 fail at both wavelengths.', color: 'var(--bad-fg)' },
      { time: '16:32', title: 'Analysis: 2 swaps possible', text: 'Extras 49 and 51 pass; 50 and 52 fail. Recommends ch 19 → 49 and ch 41 → 51.', color: 'var(--warn-fg)' },
      { time: '16:38', title: 'Replacements recorded', text: 'Demo operator B applied both recommendations and retested those channels.', color: accent },
      { time: '16:44', title: 'Unrecoverable', text: '4 channels still fail with no usable extras left. Result: not_applicable_no_extra_ports.', color: 'var(--o3)' }
    ];

    const tone = v => v > FAIL ? 'var(--bad-fg)' : (v > WARN ? 'var(--warn-fg)' : 'var(--ink2)');
    const extras = [
      ['49', 1.98, 2.11, 'In use · ch 19', 'info'],
      ['50', 2.33, 2.71, 'Fails 1550 nm', 'bad'],
      ['51', 1.88, 2.04, 'In use · ch 41', 'info'],
      ['52', 2.58, 2.95, 'Fails both', 'bad']
    ].map(e => ({ port: e[0], a: e[1].toFixed(2), b: e[2].toFixed(2), c1: tone(e[1]), c2: tone(e[2]), status: e[3], bg: e[4] === 'bad' ? 'var(--bad-bg)' : 'var(--info-bg)', fg: e[4] === 'bad' ? 'var(--bad-fg)' : 'var(--info-fg)' }));

    const repl = [
      { t: '16:38:12', ch: '19', move: 'p19 → p49', src: 'Recommendation #1 · required', gain: '−0.51 dB' },
      { t: '16:38:40', ch: '41', move: 'p41 → p51', src: 'Recommendation #2 · required', gain: '−0.48 dB' }
    ];

    const A = [
      [7, 1, 'p7', 2.31, 2.62, 'fail', 1], [12, 1, 'p12', 2.44, 2.58, 'fail', 1],
      [19, 1, 'p19', 2.52, 2.69, 'replaced', 0.55], [19, 2, 'p49', 2.02, 2.18, 'pass', 1],
      [30, 1, 'p30', 2.67, 2.91, 'fail', 1],
      [41, 1, 'p41', 2.28, 2.57, 'replaced', 0.55], [41, 2, 'p51', 1.94, 2.09, 'pass', 1],
      [45, 1, 'p45', 2.35, 2.66, 'fail', 1]
    ];
    const resTone = { fail: ['var(--bad-bg)', 'var(--bad-fg)', 'Fail'], pass: ['var(--ok-bg)', 'var(--ok-fg)', 'Pass · current'], replaced: ['var(--panel2)', 'var(--muted)', 'Superseded'] };
    const attempts = A.map(a => ({ ch: String(a[0]), att: '#' + a[1], port: a[2], w1: a[3].toFixed(2), w2: a[4].toFixed(2), c1: tone(a[3]), c2: tone(a[4]), bg: resTone[a[5]][0], fg: resTone[a[5]][1], res: resTone[a[5]][2], op: a[6] }));

    return {
      accent, themeClass, wlOpts, ilBars, ilGrid,
      warnY: yv(WARN).toFixed(1), failY: yv(FAIL).toFixed(1), bandY: Y0, failH: (yv(FAIL) - Y0).toFixed(1),
      cells, steps, extras, repl, attempts
    };
}
