import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface Row { model: string; mode: string; ch: string; sec: string; time: string }

export function QueryChart({ rows }: { rows: Row[] }) {
  const data = rows.map(r => ({ ...r, label: `${r.model} · ${r.mode} · ${r.ch} ch`, seconds: Number(r.sec) }));
  return <div className="table-scroll"><div role="img" aria-label="Synthetic average test time by configuration, between 7 and 16 minutes" style={{ width: '100%', minWidth: 500, height: 290 }}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, bottom: 0, left: 0, right: 42 }} accessibilityLayer>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis type="number" domain={[0, 1080]} ticks={[0, 300, 600, 900, 1080]} tickFormatter={seconds => `${Number(seconds) / 60} min`} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="label" width={180} tick={{ fill: 'var(--ink2)', fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: 'var(--panel2)' }} contentStyle={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--ink)' }} formatter={seconds => [`${Math.floor(Number(seconds) / 60)}m ${String(Number(seconds) % 60).padStart(2, '0')}s`, 'Average']} />
        <Bar dataKey="seconds" barSize={23} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map(r => <Cell key={r.label} fill={r.model === 'OSX-150' ? 'var(--o1)' : 'var(--o2)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div></div>;
}
