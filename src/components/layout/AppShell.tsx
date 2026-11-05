import { useEffect, useRef, type ReactNode } from 'react';
import type { ScreenId } from '../../types';
import { Sidebar } from './Sidebar';

export function AppShell({ active, route, title, dark, children }: { active?: ScreenId; route: string; title: string; dark: boolean; children: ReactNode }) {
  const main = useRef<HTMLElement>(null);
  const previousRoute = useRef(route);
  useEffect(() => {
    document.title = `${title} · Light Workbench Analytics`;
    if (previousRoute.current !== route) {
      main.current?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
    previousRoute.current = route;
  }, [route, title]);
  return <div className={`lw app-shell${dark ? ' dark' : ''}`}>
    <Sidebar active={active} />
    <main ref={main} tabIndex={-1} id="content" className="page-frame">{children}</main>
  </div>;
}
