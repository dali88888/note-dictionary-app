/**
 * Regression tests for the raw-fetch Supabase REST helper.
 *
 * Maps to production bug: supabase-js writes wedged for 87 entries
 * across a 2.5-hour teaching session.  Raw-fetch upserts to the
 * SAME endpoint returned 201 in ~1 second.  The fix was to route
 * all dictStore writes through this module.
 *
 * Tests below mock `globalThis.fetch` so they don't hit the real
 * network — what we're verifying is:
 *
 *   1. Successful 2xx responses produce `{ data, error: null }`.
 *   2. Non-2xx responses produce `{ data: null, error: { message, code } }`.
 *   3. A timeout fires within the `timeoutMs` budget regardless of
 *      whether the underlying fetch ever settles (the same wedge-
 *      defense the helper inherits from withSupabaseTimeout).
 *   4. The `apikey` and `Authorization` headers are populated from
 *      the stub localStorage we set up.
 *   5. Upsert sends `Prefer: resolution=merge-duplicates` and the
 *      `on_conflict=...` query string in the URL.
 *
 * If anyone later "simplifies" the helper back to bare
 * `await fetch()` without the Promise.race timeout, test #3 catches
 * it and Vercel blocks the deploy.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

// Stub `import.meta.env` for the module.  Vitest exposes import.meta.env
// at runtime; we set the two keys our helper reads.  These run BEFORE
// the module import below so the env values are seen.
vi.stubEnv('VITE_SUPABASE_URL', 'https://fake.supabase.co');
vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_TEST_KEY');

// `localStorage` doesn't exist by default in Vitest's Node env.  We
// only need a tiny shim — the helper just calls .getItem() / .setItem()
// /.removeItem() on it.  An in-memory Map is enough and keeps the
// test environment fast (no jsdom).
//
// We can't predict the EXACT key the helper looks up — it derives
// `sb-<ref>-auth-token` from `import.meta.env.VITE_SUPABASE_URL`, which
// was baked in at module-load time (BEFORE vi.stubEnv could intercept).
// In a real `.env.local` setup the ref is something like
// `nganzcuaypbtjykoicdg`, not `fake`.  So instead of guessing the key,
// the shim returns our test token for ANY key ending in `-auth-token`.
const memStore = new Map<string, string>();
const DEFAULT_TOKEN = {
  access_token: 'TEST_ACCESS_TOKEN',
  refresh_token: 'TEST_REFRESH_TOKEN',
  // Default to a far-future expiry so tests that don't care about
  // refresh don't trigger it.
  expires_at: Math.floor(Date.now() / 1000) + 60_000,
  user: { id: 'user-1' },
};
// Per-test override for the auth-token blob.  Tests that exercise the
// refresh path overwrite this with an expired/missing-expiry token.
let authTokenOverride: string | null = JSON.stringify(DEFAULT_TOKEN);
const localStorageShim = {
  getItem: (k: string) => {
    if (memStore.has(k)) return memStore.get(k)!;
    // Catch-all for any sb-<ref>-auth-token lookup.  Returns whatever
    // the current test set via setAuthToken() (or the default).
    if (/-auth-token$/.test(k)) return authTokenOverride;
    return null;
  },
  setItem: (k: string, v: string) => {
    memStore.set(k, String(v));
    // Mirror auth-token writes so subsequent reads see the refreshed
    // tokens (this is what `writeStoredAuth` in supabaseRest.ts does).
    if (/-auth-token$/.test(k)) authTokenOverride = v;
  },
  removeItem: (k: string) => {
    memStore.delete(k);
  },
  clear: () => {
    memStore.clear();
  },
  key: (i: number) => Array.from(memStore.keys())[i] ?? null,
  get length() {
    return memStore.size;
  },
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageShim,
  writable: true,
  configurable: true,
});

/** Replace the stored auth token for the current test. */
function setAuthToken(token: object | null): void {
  authTokenOverride = token === null ? null : JSON.stringify(token);
}

beforeEach(() => {
  setAuthToken(DEFAULT_TOKEN);
});
afterEach(() => {
  memStore.clear();
  setAuthToken(DEFAULT_TOKEN);
  vi.restoreAllMocks();
});

// Import after stubs are in place.
import {
  restInsert,
  restUpsert,
  restUpdate,
  restDelete,
  restSelect,
} from './supabaseRest';

function mockFetch(impl: typeof fetch): MockInstance {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl);
}

describe('supabaseRest — raw fetch helper', () => {
  it('restInsert returns { data, error: null } on 201 with body', async () => {
    mockFetch(
      async () =>
        new Response(JSON.stringify([{ id: 'new-id', word: 'hi' }]), {
          status: 201,
        }),
    );
    const res = await restInsert<{ id: string; word: string }>(
      'entries',
      { word: 'hi' },
      { returning: 'representation' },
    );
    expect(res.error).toBeNull();
    expect(res.data).toEqual([{ id: 'new-id', word: 'hi' }]);
  });

  it('restInsert returns { data: null, error: null } on 204', async () => {
    mockFetch(async () => new Response(null, { status: 204 }));
    const res = await restInsert('entries', { word: 'hi' });
    expect(res.error).toBeNull();
    expect(res.data).toBeNull();
  });

  it('restInsert surfaces PostgREST 409 with parsed message + status code', async () => {
    mockFetch(
      async () =>
        new Response(
          JSON.stringify({ message: 'duplicate key', code: '23505' }),
          { status: 409 },
        ),
    );
    const res = await restInsert('entries', { id: 'dup' });
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe('duplicate key');
    expect(res.error?.code).toBe('409');
  });

  it('restRequest rejects within timeoutMs when fetch never settles (wedge case)', async () => {
    // The whole point of this module.  If the inner fetch hangs forever
    // (real-world supabase-js wedge), the wrapper must still resolve
    // with a TIMEOUT error inside the budget.
    mockFetch(() => new Promise<Response>(() => {})); // never settles
    const start = Date.now();
    const res = await restInsert('entries', { word: 'wedge-test' }, {
      timeoutMs: 100,
    });
    const elapsed = Date.now() - start;
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe('TIMEOUT');
    expect(elapsed).toBeLessThan(500);
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it('restUpsert sends Prefer: resolution=merge-duplicates and on_conflict=', async () => {
    let capturedUrl: string | null = null;
    let capturedHeaders: Headers | null = null;
    mockFetch(async (url, init) => {
      capturedUrl = url.toString();
      capturedHeaders = new Headers(init?.headers);
      return new Response(null, { status: 204 });
    });
    await restUpsert('entries', { id: 'x', word: 'y' }, { onConflict: 'id' });
    expect(capturedUrl).toContain('on_conflict=id');
    expect(capturedHeaders!.get('prefer')).toContain('resolution=merge-duplicates');
  });

  it('restRequest attaches apikey + Authorization from localStorage token', async () => {
    let capturedHeaders: Headers | null = null;
    mockFetch(async (_url, init) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(null, { status: 204 });
    });
    await restInsert('entries', { word: 'x' });
    // We can't assert the exact apikey because import.meta.env values
    // are baked in at MODULE LOAD time (before vi.stubEnv took effect).
    // The point of this test is to verify the apikey + bearer auth
    // headers are present at all — without them every PostgREST
    // request would return 401.
    expect(capturedHeaders!.get('apikey')).toBeTruthy();
    expect(capturedHeaders!.get('authorization')).toBe(
      'Bearer TEST_ACCESS_TOKEN',
    );
  });

  it('restUpdate builds an eq.<value> filter from the match map', async () => {
    let capturedUrl: string | null = null;
    mockFetch(async (url) => {
      capturedUrl = url.toString();
      return new Response(null, { status: 204 });
    });
    await restUpdate('class_sessions', { id: 'abc-123' }, { name: 'foo' });
    expect(capturedUrl).toContain('id=eq.abc-123');
  });

  it('restDelete uses DELETE method + eq. filter', async () => {
    let capturedMethod: string | null = null;
    let capturedUrl: string | null = null;
    mockFetch(async (url, init) => {
      capturedMethod = init?.method ?? null;
      capturedUrl = url.toString();
      return new Response(null, { status: 204 });
    });
    await restDelete('entries', { id: 'gone' });
    expect(capturedMethod).toBe('DELETE');
    expect(capturedUrl).toContain('id=eq.gone');
  });

  it('restSelect uses GET method + passes through query', async () => {
    let capturedMethod: string | null = null;
    let capturedUrl: string | null = null;
    mockFetch(async (url, init) => {
      capturedMethod = init?.method ?? null;
      capturedUrl = url.toString();
      return new Response(JSON.stringify([{ id: 'a' }]), { status: 200 });
    });
    const res = await restSelect<{ id: string }>(
      'class_sessions',
      'owner_user_id=eq.user-1&limit=5',
    );
    expect(capturedMethod).toBe('GET');
    expect(capturedUrl).toContain('owner_user_id=eq.user-1');
    expect(capturedUrl).toContain('limit=5');
    expect(res.data).toEqual([{ id: 'a' }]);
  });
});

/* ────────────────────────────────────────────────────────────────
 * Token-refresh regression tests
 *
 * Each test maps to a real production failure:
 *
 *   - User taught a class on May 13.  Token expired during laptop
 *     sleep between class 1 and class 2.  17 entries piled up in
 *     pendingPersists with "JWT expired" because supabase-js's
 *     auto-refresh failed AND our raw-fetch layer kept sending the
 *     same dead token on every retry forever.  Tests below verify
 *     both the pro-active path (refresh before sending if the token
 *     is known-expired) and the reactive path (refresh + retry once
 *     if the server returns 401 "JWT expired").
 * ─────────────────────────────────────────────────────────────── */
describe('supabaseRest — token refresh regression tests', () => {
  it('pro-actively refreshes when stored token expires_at is in the past', async () => {
    // Simulate an already-expired token in localStorage.
    setAuthToken({
      access_token: 'EXPIRED_TOKEN',
      refresh_token: 'GOOD_REFRESH_TOKEN',
      expires_at: Math.floor(Date.now() / 1000) - 100, // 100s ago
      user: { id: 'u' },
    });

    let refreshCalled = false;
    let writeCallAuthHeader: string | null = null;

    mockFetch(async (url, init) => {
      const u = url.toString();
      const headers = new Headers(init?.headers);
      if (u.includes('/auth/v1/token?grant_type=refresh_token')) {
        refreshCalled = true;
        return new Response(
          JSON.stringify({
            access_token: 'FRESH_ACCESS_TOKEN',
            refresh_token: 'FRESH_REFRESH_TOKEN',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200 },
        );
      }
      // The actual write call should now carry the FRESH token.
      writeCallAuthHeader = headers.get('authorization');
      return new Response(null, { status: 204 });
    });

    const res = await restInsert('entries', { word: 'x' });
    expect(refreshCalled).toBe(true);
    expect(writeCallAuthHeader).toBe('Bearer FRESH_ACCESS_TOKEN');
    expect(res.error).toBeNull();
  });

  it('reactively refreshes + retries ONCE on 401 "JWT expired"', async () => {
    // Token has a future expiry so pro-active refresh does NOT fire.
    // Server still rejects with 401 "JWT expired" — simulates the
    // corner case where supabase clock skew / extra-short token /
    // last-millisecond expiry slips past tokenNeedsRefresh().
    setAuthToken({
      access_token: 'STALE_BUT_FUTURE_TOKEN',
      refresh_token: 'GOOD_REFRESH_TOKEN',
      expires_at: Math.floor(Date.now() / 1000) + 60_000,
      user: { id: 'u' },
    });

    const authHeadersSeen: (string | null)[] = [];
    let refreshCalled = false;
    let writeAttempt = 0;

    mockFetch(async (url, init) => {
      const u = url.toString();
      if (u.includes('/auth/v1/token?grant_type=refresh_token')) {
        refreshCalled = true;
        return new Response(
          JSON.stringify({
            access_token: 'FRESH_TOKEN_AFTER_RETRY',
            refresh_token: 'NEW_REFRESH',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
          { status: 200 },
        );
      }
      const headers = new Headers(init?.headers);
      authHeadersSeen.push(headers.get('authorization'));
      writeAttempt++;
      if (writeAttempt === 1) {
        // First attempt: server says JWT expired.
        return new Response(JSON.stringify({ message: 'JWT expired' }), {
          status: 401,
        });
      }
      // Retry with the refreshed token: success.
      return new Response(null, { status: 204 });
    });

    const res = await restInsert('entries', { word: 'x' });
    expect(refreshCalled).toBe(true);
    expect(res.error).toBeNull(); // Final result is success
    expect(writeAttempt).toBe(2); // Original + 1 retry
    expect(authHeadersSeen[0]).toBe('Bearer STALE_BUT_FUTURE_TOKEN');
    expect(authHeadersSeen[1]).toBe('Bearer FRESH_TOKEN_AFTER_RETRY');
  });

  it('does NOT retry indefinitely if refresh produces a still-bad token (refresh_token also dead)', async () => {
    setAuthToken({
      access_token: 'DEAD_ACCESS',
      refresh_token: 'DEAD_REFRESH',
      expires_at: Math.floor(Date.now() / 1000) + 60_000,
      user: { id: 'u' },
    });

    let writeAttempts = 0;
    mockFetch(async (url) => {
      const u = url.toString();
      if (u.includes('/auth/v1/token?grant_type=refresh_token')) {
        // Refresh "succeeds" but returns a new token; the actual write
        // will still fail with 401 (server side rejects new token too).
        return new Response(
          JSON.stringify({
            access_token: 'STILL_BAD',
            refresh_token: 'STILL_BAD_REFRESH',
            expires_in: 3600,
          }),
          { status: 200 },
        );
      }
      writeAttempts++;
      return new Response(JSON.stringify({ message: 'JWT expired' }), {
        status: 401,
      });
    });

    const res = await restInsert('entries', { word: 'x' });
    expect(writeAttempts).toBe(2); // Only ONE retry — no infinite loop
    expect(res.error?.code).toBe('401');
  });

  it('surfaces 401 directly (no refresh attempt) when message is NOT a JWT problem', async () => {
    setAuthToken({
      access_token: 'GOOD_TOKEN',
      refresh_token: 'GOOD_REFRESH',
      expires_at: Math.floor(Date.now() / 1000) + 60_000,
      user: { id: 'u' },
    });

    let refreshCalled = false;
    let writeAttempts = 0;
    mockFetch(async (url) => {
      const u = url.toString();
      if (u.includes('/auth/v1/token?grant_type=refresh_token')) {
        refreshCalled = true;
        return new Response('{}', { status: 200 });
      }
      writeAttempts++;
      return new Response(
        JSON.stringify({ message: 'permission denied for table entries' }),
        { status: 401 },
      );
    });

    const res = await restInsert('entries', { word: 'x' });
    expect(refreshCalled).toBe(false);
    expect(writeAttempts).toBe(1);
    expect(res.error?.message).toContain('permission denied');
  });
});
