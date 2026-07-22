import { Component, type ReactNode } from 'react';
import { userManager } from '../auth/AuthProvider';

type Props = { children: ReactNode };
type State = { error: Error | null };

// A render crash used to blank the whole page (no boundary → React unmounts the
// tree). This catches it and shows a recoverable screen instead — reload, or
// re-authenticate (the common cause is a session that went bad after long idle).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('UI crashed:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md space-y-4 py-20 text-center">
        <p className="text-[11px] lowercase tracking-wide text-faint">something went wrong</p>
        <h1 className="text-xl font-semibold lowercase text-ink">the page hit an error</h1>
        <p className="break-words text-sm text-muted">{this.state.error.message || 'unexpected error'}</p>
        <div className="flex justify-center gap-2 pt-2">
          <button type="button" onClick={() => window.location.reload()} className="btn-primary px-4 py-2">
            reload
          </button>
          <button
            type="button"
            onClick={() => void userManager.signinRedirect({ prompt: 'login' })}
            className="btn-ghost px-4 py-2"
          >
            sign in again
          </button>
        </div>
      </div>
    );
  }
}
