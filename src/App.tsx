import { lazy, Suspense, useEffect, useState } from 'react';
import { Button } from './components/ui/button';
import { AppShell } from './components/layout/AppShell';
import { ScreenErrorBoundary } from './components/ScreenErrorBoundary';
import { NAV_ITEMS } from './lib/routes';

const Overview = lazy(() => import('./screens/Overview'));
const Failures = lazy(() => import('./screens/Failures'));
const Unit = lazy(() => import('./screens/Unit'));
const Queries = lazy(() => import('./screens/Queries'));
const screens = { overview: Overview, failures: Failures, unit: Unit, queries: Queries };
const getRoute = () => location.hash.slice(1) || '/';

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('lwb-analytics-theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    const change = () => setRoute(getRoute());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('lwb-analytics-theme', dark ? 'dark' : 'light'); } catch { /* Storage is optional. */ }
  }, [dark]);
  const path = route.split('?')[0];
  const item = NAV_ITEMS.find(item => item.path === path);
  const Screen = item ? screens[item.id] : undefined;
  return (
    <>
      <a href="#content" className="skip-link" onClick={event => {
        event.preventDefault(); document.querySelector('main')?.focus();
      }}>Skip to content</a>
      <div className="demo-strip">
        <span><strong>Milestone 1</strong> · Synthetic demonstration · Offline</span>
        <span id="preview-help">Disabled controls are future-feature previews.</span>
        <Button variant="outline" size="sm" onClick={() => setDark(value => !value)} aria-pressed={dark}>
          {dark ? 'Light mode' : 'Dark mode'}
        </Button>
      </div>
      <AppShell active={item?.id} route={route} title={item?.label ?? 'Page not found'} dark={dark}>
        <ScreenErrorBoundary key={route}>
          {Screen ? <Suspense fallback={<p role="status">Loading demo screen…</p>}><Screen /></Suspense> : (
            <section className="missing-screen"><h1>Page not found</h1><a href="#/">Return to overview</a></section>
          )}
        </ScreenErrorBoundary>
      </AppShell>
    </>
  );
}
