/**
 * Raw-fetch Supabase REST helper — used by dictStore for ALL WRITES.
 *
 * Why: in production we observed that after a tab has been open for
 * 2–3 hours, `supabase-js` v2 write calls (`supabase.from(...).insert(...)`
 * / `.upsert(...)` / `.update(...)` / `.delete(...)`) silently wedge.
 * They never resolve, never reject — they just hang.  Even with
 * `.abortSignal(signal)` the SDK ignores the abort and the await
 * never settles.  An entire teaching session's worth of data was lost
 * before we noticed.
 *
 * Reading still works (the SDK's GET path uses a different fetch
 * code path), so reads remain via supabase-js for now.  But every
 * mutation goes through raw `fetch` directly to Supabase's PostgREST
 * endpoints — same wire protocol the SDK uses internally, just
 * without the wedge-prone JS layer.
 *
 * `api/translate.ts` has been doing this since v1 for the global
 * `dictionary_cache` table; `supabaseClient.directSignInEmail` does
 * the same trick for password sign-in.  This module unifies the
 * pattern so dictStore call sites stay readable.
 *
 * Returns `{ data, error }` in supabase-js's familiar shape so
 * existing call-site code can switch over with minimal change.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
  | string
  | undefined;

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Read the user's access token straight from localStorage — same
 * storage key supabase-js uses internally.  Synchronous, can't wedge,
 * can't be blocked by the SDK's broken state.  Returns null when no
 * user is signed in (anon mode).
 */
function readAccessToken(): string | null {
  if (!SUPABASE_URL) return null;
  try {
    const ref = SUPABASE_URL.match(/https?:\/\/([^.]+)\./)?.[1];
    if (!ref) return null;
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access_token?: string } | null;
    return parsed?.access_token ?? null;
  } catch {
    return null;
  }
}

export interface RestResult<T> {
  /** Parsed JSON response body when the request succeeded. */
  data: T | null;
  /**
   * Error object when the request failed.  Shape matches what
   * supabase-js returns: `{ message, code? }`.  We populate `code`
   * with the HTTP status as a string for non-2xx responses, or with
   * a synthetic code like `'TIMEOUT'` / `'NETWORK'` for client-side
   * failures.
   */
  error: { message: string; code?: string } | null;
}

interface RestRequestInit {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** PostgREST query string fragment (e.g. `id=eq.${id}`). */
  query?: string;
  /** Request body — will be JSON.stringified. */
  body?: unknown;
  /** PostgREST `Prefer` header.  Default: none. */
  prefer?: string;
  /** Hard time limit; rejects independent of fetch state.  Default 10s. */
  timeoutMs?: number;
  /** Optional override for the `apikey` and `Authorization` headers. */
  apikey?: string;
  accessToken?: string | null;
}

/**
 * Core fetch wrapper.  Always respects `timeoutMs` (uses
 * Promise.race so a wedged fetch can't hang us forever — same
 * mechanism as `withSupabaseTimeout` but applied to a real fetch
 * call, not a supabase-js promise).
 *
 * `data` is the parsed response body; `null` for empty responses
 * (e.g. `Prefer: return=minimal` writes) or non-JSON bodies.
 */
async function restRequest<T>(
  table: string,
  init: RestRequestInit,
): Promise<RestResult<T>> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return {
      data: null,
      error: { message: 'Supabase URL / publishable key not configured' },
    };
  }
  const apikey = init.apikey ?? SUPABASE_KEY;
  const accessToken = init.accessToken ?? readAccessToken();
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const url =
    `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${table}` +
    (init.query ? `?${init.query}` : '');

  const headers: Record<string, string> = {
    apikey,
    'content-type': 'application/json',
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (init.prefer) headers.prefer = init.prefer;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let res: Response;
  try {
    res = await Promise.race<Response>([
      fetch(url, {
        method: init.method,
        headers,
        body:
          init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      }),
      new Promise<Response>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(
            new Error(
              `rest/${init.method} ${table} timed out after ${timeoutMs}ms`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } catch (err) {
    if (timer !== undefined) clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort =
      err instanceof DOMException && err.name === 'AbortError';
    return {
      data: null,
      error: {
        message: msg,
        code: isAbort || /timed out/i.test(msg) ? 'TIMEOUT' : 'NETWORK',
      },
    };
  }
  if (timer !== undefined) clearTimeout(timer);

  // Successful no-content (e.g. minimal-return upserts): nothing to parse.
  if (res.status === 204) {
    return { data: null, error: null };
  }

  // Try to read the body even on error responses — PostgREST returns
  // helpful JSON like `{ message, code, details, hint }` on 4xx/5xx.
  let bodyText: string | null = null;
  try {
    bodyText = await res.text();
  } catch {
    /* ignore */
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (bodyText) {
      try {
        const parsed = JSON.parse(bodyText) as { message?: string };
        if (parsed?.message) msg = parsed.message;
        else msg = `${msg}: ${bodyText.slice(0, 200)}`;
      } catch {
        msg = `${msg}: ${bodyText.slice(0, 200)}`;
      }
    }
    return {
      data: null,
      error: { message: msg, code: String(res.status) },
    };
  }

  if (!bodyText) return { data: null, error: null };
  try {
    return { data: JSON.parse(bodyText) as T, error: null };
  } catch {
    return { data: null, error: null };
  }
}

/* ────────────────────────────────────────────────────────────────
 * Typed call-site helpers
 * ─────────────────────────────────────────────────────────────── */

/**
 * Body type for inserts/updates.  We use plain `object` rather than
 * a strict `Record<string, unknown>` because:
 *   • Server-defaulted columns (`id`, `created_at`, etc.) shouldn't
 *     be required in the request payload.
 *   • PostgREST gladly accepts any JSON-serializable shape; type-
 *     narrowing the WRITE side adds friction without catching real
 *     bugs (RLS and column constraints catch the real ones).
 *   • `Record<string, unknown>` rejects bare interface types that
 *     don't declare an index signature (e.g. `SessionEntryRow`)
 *     even though they're perfectly valid bodies.  `object` accepts
 *     them.
 * The READ-side type parameter `T` still narrows what comes back in
 * `data`, which is the part the calling code consumes.
 */
type WriteBody = object;

/**
 * Insert one row (or many).  Default `prefer=return=minimal` so the
 * response is empty 204 — saves bandwidth on the hot path where the
 * caller already knows the row contents.
 */
export async function restInsert<T>(
  table: string,
  body: WriteBody | WriteBody[],
  opts: {
    returning?: 'minimal' | 'representation';
    onConflict?: string;
    resolution?: 'merge-duplicates' | 'ignore-duplicates';
    timeoutMs?: number;
  } = {},
): Promise<RestResult<T[]>> {
  const preferParts: string[] = [];
  preferParts.push(
    opts.returning === 'representation'
      ? 'return=representation'
      : 'return=minimal',
  );
  if (opts.resolution) preferParts.push(`resolution=${opts.resolution}`);
  return restRequest<T[]>(table, {
    method: 'POST',
    query: opts.onConflict ? `on_conflict=${opts.onConflict}` : undefined,
    body,
    prefer: preferParts.join(','),
    timeoutMs: opts.timeoutMs,
  });
}

/**
 * Upsert convenience wrapper — same as insert with merge-duplicates.
 * The caller MUST pass `onConflict` (the unique-index columns).
 */
export async function restUpsert<T>(
  table: string,
  body: WriteBody | WriteBody[],
  opts: {
    onConflict: string;
    returning?: 'minimal' | 'representation';
    timeoutMs?: number;
  },
): Promise<RestResult<T[]>> {
  return restInsert<T>(table, body, {
    ...opts,
    resolution: 'merge-duplicates',
  });
}

/** UPDATE with a PostgREST `eq.` filter. */
export async function restUpdate<T>(
  table: string,
  match: Record<string, string>,
  body: WriteBody,
  opts: {
    returning?: 'minimal' | 'representation';
    timeoutMs?: number;
  } = {},
): Promise<RestResult<T[]>> {
  const query = Object.entries(match)
    .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
    .join('&');
  return restRequest<T[]>(table, {
    method: 'PATCH',
    query,
    body,
    prefer:
      opts.returning === 'representation'
        ? 'return=representation'
        : 'return=minimal',
    timeoutMs: opts.timeoutMs,
  });
}

/** DELETE with a PostgREST `eq.` filter. */
export async function restDelete(
  table: string,
  match: Record<string, string>,
  opts: { timeoutMs?: number } = {},
): Promise<RestResult<null>> {
  const query = Object.entries(match)
    .map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`)
    .join('&');
  return restRequest<null>(table, {
    method: 'DELETE',
    query,
    prefer: 'return=minimal',
    timeoutMs: opts.timeoutMs,
  });
}

/**
 * SELECT with a raw PostgREST query string.  Used for the rare
 * read-modify-write pattern where we need to confirm a row exists
 * before deciding whether to insert.  General hydrate-time reads
 * keep using supabase-js for now (reads aren't wedge-prone the way
 * writes are).
 */
export async function restSelect<T>(
  table: string,
  query: string,
  opts: { timeoutMs?: number } = {},
): Promise<RestResult<T[]>> {
  return restRequest<T[]>(table, {
    method: 'GET',
    query,
    timeoutMs: opts.timeoutMs,
  });
}
