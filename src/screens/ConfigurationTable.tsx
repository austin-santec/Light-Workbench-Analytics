import type { ConfigurationRow } from '../mock/contracts';

export function ConfigurationTable({ rows, onSelect }: { rows: readonly ConfigurationRow[]; onSelect: (index: number) => void }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Configuration table, scroll horizontally on narrow screens">
    <table className="configuration-table" aria-label="Test time by configuration">
      <caption className="sr-only">Fixed last-30-day synthetic configuration examples. Select a configuration button to update its histogram and the average-time summary card.</caption>
      <colgroup>{[1.9, .7, .85, .85, .85, .9, 1.3, .8].map((width, i) => <col key={i} style={{ width: `${width / 8.15 * 100}%` }} />)}</colgroup>
      <thead><tr>{['Configuration', 'Units', 'Average', 'Median', 'P90', 'Per channel', 'Avg, last 14 days', 'vs prior'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={`${row.model}-${row.mode}-${row.ch}`} data-selected={row.pressed}>
        <th scope="row">
          <button type="button" aria-pressed={row.pressed} aria-controls="configuration-histogram" onClick={() => onSelect(i)}>
            <span className="configuration-marker" style={{ background: row.mark }} aria-hidden="true" />
            <span className="configuration-model">{row.model}</span><span className="configuration-mode">{row.mode}</span><span>{row.ch} ch</span>
          </button>
        </th>
        <td>{row.units}</td><td className="configuration-average">{row.avg}</td><td>{row.med}</td><td>{row.p90}</td><td>{row.perCh}</td>
        <td><svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true" style={{ width: '100%', height: 22, display: 'block' }}><polyline points={row.spark} vectorEffect="non-scaling-stroke" fill="none" stroke={row.sparkColor} strokeWidth="1.5" strokeLinejoin="round" /></svg></td>
        <td style={{ color: row.dColor, fontWeight: 600 }}>{row.delta}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}
