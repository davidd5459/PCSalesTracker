import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

/** Shows a recoverable message instead of a blank page if rendering crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Something went wrong.</h1>
        <p className="mt-2 text-muted">An unexpected error occurred while showing this page.</p>
        <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface p-3 text-left text-xs text-red-400">
          {this.state.error.message}
        </pre>
        <button
          type="button"
          onClick={() => window.location.assign("/")}
          className="mt-6 rounded-lg bg-accent px-4 py-2 font-semibold text-black hover:brightness-110"
        >
          Back to home
        </button>
      </div>
    );
  }
}
