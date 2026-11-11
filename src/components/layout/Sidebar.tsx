import type { ScreenId } from '../../types';
import { NAV_ITEMS, unitLink } from '../../lib/routes';

function NavigationIcon({ screen }: { screen: ScreenId }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round">
    {screen === 'overview' && <><rect x="3" y="3" width="7.5" height="9" rx="1.6" /><rect x="13.5" y="3" width="7.5" height="5" rx="1.6" /><rect x="3" y="15" width="7.5" height="6" rx="1.6" /><rect x="13.5" y="11" width="7.5" height="10" rx="1.6" /></>}
    {screen === 'failures' && <path d="M4 8h13l-3-3.2M20 16H7l3 3.2" />}
    {screen === 'unit' && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21" /></>}
    {screen === 'queries' && <path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14" />}
  </svg>;
}

export function DemoStatus() {
  return <div className="demo-status">
    <div className="demo-status-title"><span className="offline-dot" aria-hidden="true" />Development data sources</div>
    <div className="demo-status-detail">Demo fixtures always available<br />Live test-database panels:<br />connected, off, or backend not reachable</div>
    <span className="sample-badge">Demo + live panels</span>
  </div>;
}

export function Sidebar({ active }: { active?: ScreenId }) {
  return <aside className="app-sidebar">
    <div className="app-brand">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#e60013" /><path d="M6 20.5h6.5L16 10l3.5 10.5H26" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div><span>Light Workbench</span><small>Analytics</small></div>
    </div>
    <nav aria-label="Main" className="main-navigation">
      <span className="navigation-heading">Analyze</span>
      {NAV_ITEMS.map(item => <a key={item.id} href={`#${item.path}`} className="nav-a" aria-current={active === item.id ? 'page' : undefined}>
        <NavigationIcon screen={item.id} />{item.label}
      </a>)}
    </nav>
    {active === 'overview' && <div aria-label="Saved views preview" className="saved-views">
      <span className="navigation-heading">Saved views · preview</span>
      {[
        ['OSX-150 · SM · 48ch daily', 'var(--o1)'],
        ['Station 2 · this week', 'var(--o3)'],
        ['Multimode · last 30 days', 'var(--o2)'],
      ].map(([label, color]) => <span key={label} className="saved-view"><span style={{ background: color }} aria-hidden="true" />{label}</span>)}
    </div>}
    {active === 'unit' && <nav aria-label="Example units" className="example-units">
      <span className="navigation-heading">Example units</span>
      {['DEMO-18793', 'DEMO-18801', 'DEMO-18761'].map((serial, i) => <a key={serial} href={unitLink(serial)} className="nav-a">{serial}<span style={{ background: i === 1 ? 'var(--o2)' : 'var(--o3)' }} aria-hidden="true" /></a>)}
    </nav>}
    <DemoStatus />
  </aside>;
}
