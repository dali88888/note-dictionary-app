/**
 * Regression tests for withSupabaseTimeout.
 *
 * Each test maps to a real bug we've actually hit in production:
 *
 *   1. "wedged SDK / silent data loss" — supabase-js fetch socket
 *      stuck after long idle.  Old implementation only called
 *      controller.abort() and trusted the SDK to bubble that up as
 *      a rejection; SDK ignored the abort entirely; the await hung
 *      forever; the .catch() in dictStore.query never fired; the
 *      pending-persist queue stayed empty; an entire teaching
 *      session evaporated when the tab closed.  The first test
 *      below FAILS on any implementation that doesn't race the
 *      inner Promise against an independent rejection timer.
 *
 *   2. Healthy path must remain healthy — fast inner calls must
 *      resolve normally (no spurious aborts).
 *
 *   3. Abort signal must still fire — well-behaved SDK code can
 *      use it to cancel a fetch early on its own terms.
 *
 *   4. Timer cleanup on success — no leaked setTimeout handles
 *      keeping the event loop alive longer than necessary.
 *
 * If any future commit "simplifies" withSupabaseTimeout back to a
 * bare abort-only version, `vitest run` will fail on test #1 and
 * the Vercel build (which now runs `vitest run` first — see
 * package.json) will block the deploy.
 */
import { describe, expect, it, vi } from 'vitest';
import { withSupabaseTimeout } from './withSupabaseTimeout';

describe('withSupabaseTimeout — regression tests for silent-data-loss bug', () => {
  it('rejects within `ms` when inner Promise NEVER resolves nor rejects (wedge case)', async () => {
    // The wedge: a Promise that does absolutely nothing — never
    // resolves, never rejects, ignores its abort signal.  This is
    // exactly what supabase-js does when its fetch socket is
    // wedged after long idle.  Pre-Promise.race code would hang
    // here forever.
    const start = Date.now();
    const promise = withSupabaseTimeout(
      () => new Promise<unknown>(() => {}), // never settles
      100, // very short timeout for fast test
      'regression-test/wedge',
    );

    await expect(promise).rejects.toThrow(/timed out/);

    const elapsed = Date.now() - start;
    // Should reject within a small multiple of `ms`.  Generous
    // upper bound so CI machines with noisy timers don't flake.
    expect(elapsed).toBeLessThan(500);
    expect(elapsed).toBeGreaterThanOrEqual(100);
  });

  it('resolves normally when inner Promise settles quickly (healthy path)', async () => {
    const result = await withSupabaseTimeout(
      () => Promise.resolve({ data: 'ok', error: null }),
      1000,
      'regression-test/healthy',
    );
    expect(result).toEqual({ data: 'ok', error: null });
  });

  it('still fires controller.abort() at timeout so a well-behaved SDK can cancel early', async () => {
    // Inner promise sets up an abort listener but otherwise never
    // settles.  Verifies the abort path is wired even though the
    // outer Promise.race is what guarantees rejection.
    let abortFired = false;
    const promise = withSupabaseTimeout(
      (signal) => {
        signal.addEventListener('abort', () => {
          abortFired = true;
        });
        return new Promise<unknown>(() => {});
      },
      50,
      'regression-test/abort-still-fires',
    );

    await expect(promise).rejects.toThrow();
    expect(abortFired).toBe(true);
  });

  it('clears the timer when inner Promise resolves first (no leaked handles)', async () => {
    // If the timer kept running after resolution, a long-running
    // test process would accumulate handles and Vitest would warn
    // about open handles at the end of the run.  We sanity-check
    // by spying on clearTimeout.
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      const result = await withSupabaseTimeout(
        () => Promise.resolve(42),
        10_000,
        'regression-test/timer-cleanup',
      );
      expect(result).toBe(42);
      // clearTimeout should have been called at least once with the
      // timer id our wrapper created.  We can't easily inspect
      // exactly which id, but the call count gives a reasonable
      // signal that the finally block ran.
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
    }
  });

  it('rejects within `ms` when inner Promise resolves AFTER the timeout (late response)', async () => {
    // The SDK eventually does respond but only after we've already
    // given up.  Our wrapper should reject at `ms`, not wait for
    // the late response.  The late response is then discarded
    // harmlessly.
    const start = Date.now();
    const promise = withSupabaseTimeout(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: 'late' }), 500),
        ),
      100, // give up at 100ms
      'regression-test/late-response',
    );
    await expect(promise).rejects.toThrow(/timed out/);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(300); // didn't wait for the late resolve
  });
});
