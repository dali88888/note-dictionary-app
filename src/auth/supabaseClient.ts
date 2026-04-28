import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // We don't `throw` here — the app should still load so a missing-config
  // banner can render gracefully.  Consumers should null-check `supabase`.
  // eslint-disable-next-line no-console
  console.error(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY not set. ' +
      'Auth will not work until you configure .env.local.',
  );
}

/**
 * Pass-through "lock" for the auth client.
 *
 * By default supabase-js v2 uses `navigator.locks` to coordinate token
 * refresh across tabs.  In the field that turned out to cause the
 * dictionary's "查询中… forever" hang: every call to `getSession()` (and
 * therefore every search) acquires this lock first, and on Chrome it
 * routinely blocked for 5 seconds — sometimes indefinitely — before
 * the SDK gave up and "stole" the lock.  We saw it live:
 *
 *   @supabase/gotrue-js: Lock "lock:sb-…-auth-token" was not released
 *   within 5000ms. Forcefully acquiring the lock to recover.
 *   [auth] getSession() did not resolve within 5s — falling back to anon.
 *
 * Symptoms: search button stays on "查询中…", network tab shows no
 * `/api/translate` request was ever made (the fetch is queued behind
 * the locked getSession()).
 *
 * This app doesn't need cross-tab coordination — every getSession
 * call is just a localStorage read.  The simplest robust fix is to
 * replace the navigator-lock with a no-op, so each call runs the
 * underlying read directly with no global mutex to fight over.
 *
 * Type-cast as `unknown as never` because supabase-js's TS surface for
 * the `lock` option is intentionally narrow and doesn't expose its
 * exact signature in the public types.
 */
const noopLock = ((_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => fn());

/**
 * Singleton Supabase client.  Uses a publishable (anon) key — safe in browser
 * bundles because all data access is gated by row-level security policies.
 */
export const supabase = createClient(url ?? '', key ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // handles OAuth + email-confirm redirects
    // See `noopLock` above — disables the cross-tab navigator.locks
    // coordination that was causing search to hang on Chrome.
    lock: noopLock as unknown as never,
  },
});

export const supabaseConfigured = Boolean(url && key);

/**
 * Race a promise against a hard timeout.
 *
 * Defensive layer for any supabase.auth.* call: even after disabling
 * navigator.locks (see `noopLock` above) we've seen sporadic
 * "查询中… forever" / "登录中… forever" reports, where some internal
 * mutex or pending refresh blocks `getSession()` / `signInWithPassword()`
 * indefinitely.  Wrapping every hot-path auth call in this timeout
 * guarantees the UI always recovers within `ms` even if the SDK
 * decides to never resolve the underlying promise.
 *
 * On timeout the returned promise resolves with `fallback`.  Callers
 * choose a fallback that lets the app continue degraded but
 * functional (e.g. "treat as anon", "no Bearer token", "surface a
 * sign-in error string").
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
  label?: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timed = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      if (label) {
        // eslint-disable-next-line no-console
        console.warn(`[withTimeout] ${label} did not resolve in ${ms}ms; using fallback`);
      }
      resolve(fallback);
    }, ms);
  });
  try {
    return await Promise.race([promise, timed]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
