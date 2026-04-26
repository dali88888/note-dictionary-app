/**
 * ErrorBoundary — last line of defense against a blank white screen.
 *
 * Without this, a render-time throw anywhere in the tree unmounts the
 * entire React app and leaves an empty <div id="root"> — the user sees
 * a totally white page with no clue what went wrong.  With it, we
 * render a clear error card showing the message + stack so the user
 * (or developer) can see what blew up and act on it.
 *
 * Intentionally a class component because that's the only API that
 * supports `componentDidCatch` / `getDerivedStateFromError`.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Mirror to the console so it's also visible in DevTools and any
    // crash-reporting integrations.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] React render crash:', error, info);
    this.setState({ info });
  }

  private reset = () => {
    this.setState({ error: null, info: null });
  };

  private hardReload = () => {
    // Clear app-owned localStorage in case bad persisted state caused
    // the crash (e.g. a stale schema after an upgrade).  We deliberately
    // don't clear Supabase's own auth.* keys — wiping those would log
    // the user out, which the boundary alone shouldn't decide.
    try {
      const toDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('note-dict-') || k.startsWith('zustand'))) {
          toDelete.push(k);
        }
      }
      toDelete.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-start justify-center bg-stone-50 p-6">
        <div className="max-w-2xl w-full bg-white border border-red-200 rounded-xl p-6 mt-12 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-red-700">
              应用崩溃 / Application crashed
            </h1>
            <p className="text-sm text-stone-600 mt-1">
              页面渲染时抛出了异常。下方是错误信息，请截图反馈或在
              DevTools Console 查看完整堆栈。
            </p>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-stone-500 mb-1">
              错误 / Error
            </div>
            <pre className="text-xs bg-red-50 text-red-900 border border-red-200 rounded p-3 overflow-x-auto whitespace-pre-wrap">
              {error.name}: {error.message}
            </pre>
          </div>

          {error.stack && (
            <details className="text-xs">
              <summary className="cursor-pointer text-stone-600 hover:text-stone-900">
                堆栈 / Stack trace
              </summary>
              <pre className="text-[11px] bg-stone-50 text-stone-700 border border-stone-200 rounded p-3 mt-2 overflow-x-auto whitespace-pre-wrap">
                {error.stack}
              </pre>
            </details>
          )}

          {info?.componentStack && (
            <details className="text-xs">
              <summary className="cursor-pointer text-stone-600 hover:text-stone-900">
                组件树 / Component stack
              </summary>
              <pre className="text-[11px] bg-stone-50 text-stone-700 border border-stone-200 rounded p-3 mt-2 overflow-x-auto whitespace-pre-wrap">
                {info.componentStack}
              </pre>
            </details>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={this.reset}
              className="text-sm px-3 py-1.5 rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
            >
              再试一次 / Retry
            </button>
            <button
              type="button"
              onClick={this.hardReload}
              className="text-sm px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white"
            >
              清除本地缓存并重载 / Clear cache &amp; reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
