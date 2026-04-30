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

/* ────────────────────────────────────────────────────────────────
 * Direct sign-in (bypasses the wedged SDK)
 *
 * Field reports: even with `lock: noopLock` and a 15 s `withTimeout`
 * around `signInWithPassword`, sometimes the SDK's call never
 * resolves AND every subsequent click also times out — only a hard
 * page reload recovers.  That symptom matches "the SDK's internal
 * fetch is still in-flight forever, and new calls queue behind it."
 *
 * Workaround: don't trust the SDK for the actual round-trip.  Hit
 * the same `/auth/v1/token?grant_type=password` REST endpoint with
 * our own `fetch` + `AbortController`, then hand the resulting
 * session to the SDK via `setSession`.  Each click gets a brand-new
 * fetch — no queuing, no shared in-memory state to corrupt.
 * ─────────────────────────────────────────────────────────────── */

interface DirectSignInResult {
  /** Friendly error string suitable for display, or null on success. */
  error: string | null;
  /** True on actual auth failure (bad creds), so caller can avoid retrying. */
  authFailed?: boolean;
  /** True on timeout/network — caller may auto-retry. */
  transient?: boolean;
}

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
  user?: unknown;
}

const DIRECT_SIGNIN_TIMEOUT_MS = 8000;

export async function directSignInEmail(
  email: string,
  password: string,
): Promise<DirectSignInResult> {
  if (!url || !key) {
    return { error: '认证服务未配置（缺少 Supabase URL / publishable key）' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DIRECT_SIGNIN_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: key,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    if (isAbort) {
      return {
        error: `登录响应超时（${DIRECT_SIGNIN_TIMEOUT_MS / 1000}s）`,
        transient: true,
      };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `网络错误：${msg}`, transient: true };
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    let authFailed = false;
    try {
      const body = (await res.json()) as { msg?: string; error_description?: string; error?: string };
      detail = body.msg ?? body.error_description ?? body.error ?? detail;
    } catch {
      /* body wasn't JSON */
    }
    if (res.status === 400 || res.status === 401) authFailed = true;
    return { error: detail, authFailed };
  }

  const body = (await res.json()) as SupabaseTokenResponse;
  if (!body?.access_token || !body?.refresh_token) {
    return { error: '认证服务返回了不完整的会话' };
  }

  // Hand the session to the SDK so AuthContext.onAuthStateChange fires
  // and the rest of the app updates.  This call goes through the
  // SDK's normal path; if IT also wedges, fall back to a hard reload
  // — by then we have valid tokens in localStorage from the SDK's
  // own setSession or, worst case, we write them ourselves below.
  const setResult = await withTimeout(
    supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    }),
    4000,
    null,
    'directSignIn/setSession',
  );

  if (setResult === null) {
    // setSession itself wedged.  Persist the tokens directly to the
    // localStorage key the SDK uses (sb-<ref>-auth-token), then trigger
    // a reload — the SDK will pick the session up cleanly on next boot.
    try {
      const ref = url.match(/https?:\/\/([^.]+)\./)?.[1];
      if (ref) {
        const storageKey = `sb-${ref}-auth-token`;
        const expiresAt = body.expires_at ?? Math.floor(Date.now() / 1000) + body.expires_in;
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            access_token: body.access_token,
            refresh_token: body.refresh_token,
            token_type: body.token_type,
            expires_in: body.expires_in,
            expires_at: expiresAt,
            user: body.user,
          }),
        );
      }
    } catch {
      /* private-mode localStorage; ignore */
    }
    // eslint-disable-next-line no-console
    console.warn('[directSignIn] setSession wedged; reloading to apply session cleanly');
    window.location.reload();
    // The reload will tear down everything — return success-shaped to
    // keep TS happy.  This path is effectively unreachable post-reload.
    return { error: null };
  }

  return { error: null };
}
