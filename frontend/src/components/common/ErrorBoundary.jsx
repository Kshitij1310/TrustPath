import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Catches render-time crashes so one broken panel does not blank the whole
 * app — which, in a safety product, would take the SOS button down with it.
 *
 * Still a class component: React has no hook equivalent for componentDidCatch.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback({ error, reset: this.reset });

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="rounded-full bg-destructive/10 p-3">
          <AlertTriangle className="size-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">This section failed to load</h2>
          <p className="max-w-md text-sm text-muted-foreground">{error.message}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={this.reset}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Reload app
          </Button>
        </div>
      </div>
    );
  }
}
