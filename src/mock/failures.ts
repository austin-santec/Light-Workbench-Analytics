import type { FailuresState, ChannelCount, RecoveryReason } from '../types';
import type { FailuresValues, FailureDistribution, FailureUnitFixture } from './contracts';
import { ACCENT } from './presentation';

// Adapted Claude sample logic. All fixtures are synthetic, never production metrics.
export function getFailuresValues(state: FailuresState): FailuresValues {
    const accent = ACCENT;

    const kpis = [
      { label: 'Units needing replacement', value: '838', sub: '65.3% of 1,284 units', pct: 65.3, bar: 'var(--o2)', color: 'var(--ink)' },
      { label: 'Channels swapped per failing unit', value: '2.4', sub: '1,991 failed channels across 838 units', pct: 48, bar: accent, color: 'var(--ink)' },
      { label: 'Recovered after replacement', value: '96.8%', sub: '811 of 838 failing units now pass', pct: 96.8, bar: 'var(--o1)', color: 'var(--ink)' },
      { label: 'Unrecoverable units', value: '27', sub: '2.1% of all units · ▼ 5 vs prior 30 days', pct: 2.1, bar: 'var(--o3)', color: 'var(--bad-fg)' },
      { label: 'Retested channels', value: '5.8%', sub: 'channels with more than one attempt', pct: 5.8, bar: accent, color: 'var(--ink)' }
    ];

    // weekly stacked bars
    const wk: [week: string, firstPass: number, recovered: number, noRecovery: number][] = [['Sep 14', 96, 170, 6], ['Sep 21', 92, 178, 7], ['Sep 28', 101, 169, 5], ['Oct 5', 99, 181, 6], ['Oct 12', 104, 187, 7], ['Oct 19', 98, 190, 6], ['Oct 26', 107, 192, 6], ['Nov 2', 70, 124, 4]];
    const X0 = 44, X1 = 664, Y1 = 200, H = 170, MAX = 320;
    const step = (X1 - X0) / wk.length;
    const weeks = wk.map((w, i) => {
      const x = X0 + i * step + (step - 44) / 2;
      const h1 = H * w[1] / MAX, h2 = H * w[2] / MAX, h3 = Math.max(H * w[3] / MAX, 2);
      return { x: x.toFixed(1), cx: (x + 22).toFixed(1), y1: (Y1 - h1).toFixed(1), h1: h1.toFixed(1), y2: (Y1 - h1 - h2 - 1).toFixed(1), h2: h2.toFixed(1), y3: (Y1 - h1 - h2 - h3 - 2).toFixed(1), h3: h3.toFixed(1), ty: (Y1 - h1 - h2 - h3 - 8).toFixed(1), total: String(w[1] + w[2] + w[3]), label: i === wk.length - 1 ? 'Nov 2 *' : w[0], unrec: w[3] + ' unrec.' };
    });
    const wGrid = [0, 80, 160, 240, 320].map(v => ({ y: (Y1 - H * v / MAX).toFixed(1), ty: (Y1 - H * v / MAX + 4).toFixed(1), label: String(v) }));

    // reasons
    const R: [title: string, count: number, description: string, code: string, color: string][] = [
      ['No viable recovery', 16, 'Extra ports exist, but none bring the channel under 2.5 dB at both wavelengths.', 'fail_no_viable_recovery', 'var(--o3)'],
      ['Ran out of extra ports', 8, 'More failing channels than usable extra ports on the switch.', 'not_applicable_no_extra_ports', 'var(--o1)'],
      ['Needs engineering review', 3, 'The analysis could not decide on its own and flagged the run for a person.', 'review_required', 'var(--muted)']
    ];
    const reasons = R.map(r => ({ title: r[0], count: String(r[1]), share: Math.round(r[1] / 27 * 100) + '%', w: (r[1] / 16 * 100).toFixed(0), text: r[2], code: r[3], color: r[4] }));

    // failures-per-unit, by channel count
    const FP: Record<ChannelCount, FailureDistribution> = {
      48: { units: 412, extras: 4, c: [142, 96, 71, 46, 27, 14, 9, 7] },
      36: { units: 236, extras: 3, c: [88, 62, 41, 22, 12, 6, 3, 2] },
      24: { units: 188, extras: 2, c: [81, 51, 30, 15, 7, 3, 1, 0] }
    };
    const cur = state.ch;
    const f = FP[cur];
    const over = f.c.slice(f.extras + 1).reduce((a, b) => a + b, 0);
    const FX0 = 40, FX1 = 664, FY1 = 180, FH = 130;
    const fmax = Math.max.apply(null, f.c);
    const fstep = (FX1 - FX0) / f.c.length;
    const fbars = f.c.map((c, i) => {
      const h = Math.max(FH * c / fmax, 1.5);
      const x = FX0 + i * fstep + (fstep - 52) / 2;
      return { x: x.toFixed(1), cx: (x + 26).toFixed(1), y: (FY1 - h).toFixed(1), h: h.toFixed(1), vy: (FY1 - h - 6).toFixed(1), count: String(c), label: i === f.c.length - 1 ? '7+' : String(i), fill: i > f.extras ? 'var(--o3)' : accent };
    });
    const zoneX = FX0 + (f.extras + 1) * fstep;
    const fp = {
      extras: f.extras,
      zoneX: zoneX.toFixed(1), zoneW: (FX1 - zoneX).toFixed(1), zoneLX: (zoneX + 8).toFixed(1),
      caption: 'OSX-150 · SM · ' + cur + ' channels, ' + f.units + ' units. ' + over + ' had more failures than the ' + f.extras + ' usable extras.',
      aria: 'Histogram of failed channels per unit for ' + cur + '-channel units. ' + f.c[0] + ' units had none; ' + over + ' units had more than ' + f.extras + ' failures.'
    };

    const tc = [[19, 96], [33, 81], [41, 70], [8, 52], [27, 47]];
    const topCh = tc.map(([n, c]) => ({ n: String(n), count: String(c), w: (c / 96 * 100).toFixed(0) }));
    const tp: [port: number, count: number, tag: string][] = [[19, 88, ''], [33, 74, ''], [41, 63, ''], [50, 41, 'EXTRA'], [12, 39, '']];
    const topPort = tp.map(([n, c, t]) => ({ n: String(n), count: String(c), w: (c / 88 * 100).toFixed(0), tag: t, tagFg: 'var(--warn-fg)', bar: t ? 'var(--o3)' : accent }));

    const why: Record<RecoveryReason, { reason: string; bg: string; fg: string }> = {
      viable: { reason: 'No viable recovery', bg: 'var(--bad-bg)', fg: 'var(--bad-fg)' },
      extras: { reason: 'Ran out of extras', bg: 'var(--warn-bg)', fg: 'var(--warn-fg)' },
      review: { reason: 'Needs review', bg: 'var(--panel2)', fg: 'var(--ink2)' }
    };
    const rows: FailureUnitFixture[] = [
      ['DEMO-18793', 'OSX-150 · SM · 48', 'St 2', 'Nov 4', ['7', '12', '19', '30', '41', '45'], 2, '2.91 dB', 'extras'],
      ['DEMO-18761', 'OSX-150 · SM · 48', 'St 1', 'Nov 2', ['19', '33'], 3, '2.63 dB', 'viable'],
      ['DEMO-18741', 'OSX-100 · SM · 48', 'St 3', 'Oct 30', ['8', '19', '22', '40'], 1, '2.77 dB', 'extras'],
      ['DEMO-18733', 'OSX-150 · SM · 36', 'St 2', 'Oct 28', ['5', '19', '33'], 3, '2.58 dB', 'viable'],
      ['DEMO-18722', 'OSX-150 · SM · 48', 'St 4', 'Oct 27', ['19'], 4, '2.61 dB', 'viable'],
      ['DEMO-18690', 'OSX-100 · MM · 48', 'St 2', 'Oct 22', ['11', '28'], 2, 'not run', 'review'],
      ['DEMO-18668', 'OSX-150 · SM · 24', 'St 1', 'Oct 20', ['3', '9', '17'], 2, '2.84 dB', 'extras']
    ];
    const units = rows.map(r => ({ unit: r[0], cfg: r[1], st: r[2], when: r[3], chs: r[4], extras: String(r[5]), after: r[6], afterColor: r[6] === 'not run' ? 'var(--muted)' : 'var(--bad-fg)', reason: why[r[7]].reason, bg: why[r[7]].bg, fg: why[r[7]].fg }));

    return { accent, kpis, weeks, wGrid, reasons, fbars, fp, topCh, topPort, units };
}
