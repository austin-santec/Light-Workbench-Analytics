import { lazy, Suspense, useEffect, useState } from 'react';
import { Button } from './components/ui/button';

const Overview = lazy(() => import('./screens/Overview'));
const Failures = lazy(() => import('./screens/Failures'));
const Unit = lazy(() => import('./screens/Unit'));
const Queries = lazy(() => import('./screens/Queries'));
const screens = { '/': Overview, '/failures': Failures, '/unit': Unit, '/queries': Queries };
const getRoute = () => location.hash.slice(1) || '/';

export default function App() {
  const [route, setRoute] = useState(getRoute);
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('lwb-analytics-theme') === 'dark'; } catch { return false; }
  });
  useEffect(() => {
    const change = () => { setRoute(getRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('lwb-analytics-theme', dark ? 'dark' : 'light'); } catch { /* Storage is optional. */ }
  }, [dark]);
  const path = route.split('?')[0];
  const Screen = screens[path as keyof typeof screens];
  return (
    <>
      <a href="#content" className="skip-link" onClick={event => {
        event.preventDefault(); document.querySelector('main')?.focus();
      }}>Skip to content</a>
      <div className="demo-strip">
        <span><strong>Milestone 0</strong> · Synthetic demonstration · Offline</span>
        <Button variant="outline" size="sm" onClick={() => setDark(value => !value)} aria-pressed={dark}>
          {dark ? 'Light mode' : 'Dark mode'}
        </Button>
      </div>
      {Screen ? <Suspense fallback={<main className="missing-screen" role="status">Loading demo screen…</main>}><Screen key={route} dark={dark} /></Suspense> : (
        <main className="missing-screen"><h1>Page not found</h1><a href="#/">Return to overview</a></main>
      )}
    </>
  );
}
