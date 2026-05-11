/**
 * Bounded-wait wrapper for Supabase write operations.
 *
 * History — why this file exists separately from dictStore.ts:
 *
 *   The original implementation only called `controller.abort()` after
 *   the timeout and trusted supabase-js to convert that into a Promise
 *   rejection.  In the field that broke: when the SDK's fetch socket
 *   was wedged after long idle (Chrome throttling on a teaching-
 *   session tab open for hours), supabase-js IGNORED the abort signal
 *   entirely.  The await hung forever, the .catch() in dictStore.query
 *   never fired, the pending-persist queue stayed empty, no banner
 *   showed, and entire teaching sessions evaporated silently.
 *
 *   This file lives in isolation so a regression test can mount it
 *   without pulling in the full Supabase client / Zustand store /
 *   browser globals.  The test verifies the function rejects within
 *   `ms` even when the inner promise NEVER resolves or rejects —
 *   exactly the wedge scenario from production.
 *
 *   If anyone later tries to "simplify" this back to a bare
 *   controller.abort()-only version, the regression test will fail
 *   immediately and CI will block the merge / Vercel deploy.
 */

/**
 * Run a Supabase query builder call with a hard time limit.
 *
 * Always rejects within `ms` ms, even if the inner Promise never
 * resolves or rejects (the wedge case).  Implementation: race the
 * inner promise against an independent rejection timer.  We ALSO
 * fire `controller.abort()` at timeout — that's a no-op for the
 * wedge case but lets the well-behaved path cancel its fetch early.
 *
 * @param build  Receives an AbortSignal.  Should pass it via
 *               `.abortSignal(signal)` on the supabase query
 *               builder so the well-behaved path bails on time.
 * @param ms     Hard timeout in milliseconds.
 * @param label  Short identifier used in the timeout error message
 *               and console warning.  E.g. `"persist/entries.upsert"`.
 */
export async function withSupabaseTimeout<T>(
  build: (signal: AbortSignal) => PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T>([
      build(controller.signal) as Promise<T>,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          // eslint-disable-next-line no-console
          console.warn(
            `[withSupabaseTimeout] ${label} timed out after ${ms}ms — supabase-js wedged; rejecting independent of abort`,
          );
          controller.abort();
          reject(
            new Error(
              `${label} timed out after ${ms}ms (Supabase write wedged)`,
            ),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
