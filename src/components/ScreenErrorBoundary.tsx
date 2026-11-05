import { Component, type ReactNode } from 'react';
import { Button } from './ui/button';

export class ScreenErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <section role="alert" className="empty-state">
      <h1>Unable to load this screen</h1>
      <p>Reload to try again. The demonstration does not require a database connection.</p>
      <Button onClick={() => location.reload()}>Reload screen</Button>
    </section>;
    return this.props.children;
  }
}
