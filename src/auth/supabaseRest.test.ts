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
const TEST_TOKEN = JSON.stringify({
  access_token: 'TEST_ACCESS_TOKEN',
  refresh_token: 'TEST_REFRESH_TOKEN',
  user: { id: 'user-1' },
});
const localStorageShim = {
  getItem: (k: string) => {
    if (memStore.has(k)) return memStore.get(k)!;
    // Catch-all for any sb-<ref>-auth-token lookup — see comment above.
    if (/-auth-token$/.test(k)) return TEST_TOKEN;
    return null;
  },
  setItem: (k: string, v: string) => {
    memStore.set(k, String(v));
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

beforeEach(() => {
  // No-op — the shim handles auth-token lookup automatically.
});
afterEach(() => {
  memStore.clear();
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
