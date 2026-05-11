# Project-level rules for Claude

## Regression-test policy (REQUIRED)

**Every bug fix MUST be accompanied by an automated test that fails on
the old (buggy) code and passes on the new (fixed) code.**

This rule exists because we've repeatedly shipped fixes that broke
previously-working features. Each silent failure cost a teaching
session's worth of data. The mechanism is:

1. Before changing code to fix a bug, write a failing test that
   reproduces the bug.
2. Run `npm test` and confirm it fails.
3. Apply the fix.
4. Run `npm test` and confirm it passes.
5. Commit the test alongside the fix in the same commit.

`npm run build` runs `vitest run` first — so a failing test blocks
the Vercel deploy, not just local builds. There is no "I'll add the
test later" path; tests ship with the fix or the fix doesn't ship.

### Where tests live

- Colocated next to the code they test: `src/foo/bar.ts` →
  `src/foo/bar.test.ts`.
- Pure logic (timing, math, layout) belongs in tiny, fast unit tests
  with no DOM / no Supabase / no React.
- If a function is buried inside a larger module, extract it to a
  small file just for testability (e.g. `withSupabaseTimeout.ts`).

### Worked example — the wedge-and-data-loss saga

This whole file exists because of this sequence:

| commit | claimed to fix | actually introduced |
|---|---|---|
| `255ffd9` | "查询中…" infinite spinner | optimistic UI .catch never fires on wedged SDK → silent data loss |
| `8c3c39f` | optimistic-UI catch builds a pendingPersists queue | queue stayed empty because .catch still didn't fire |
| `4da1272` | `Promise.race` in `withSupabaseTimeout` so reject fires regardless of SDK | (this commit; verified by `withSupabaseTimeout.test.ts`) |

The regression test for `4da1272` is the kind we should have had at
commit `255ffd9`. If it had existed then, the silent-loss bug would
have been impossible to ship — `Promise.race` would have been forced
into the original fix.

## Other invariants

- `withSupabaseTimeout` MUST always reject within its `ms` argument,
  regardless of whether the inner promise resolves or rejects. The
  test `src/store/withSupabaseTimeout.test.ts` enforces this.
- The PPT ruby layout MUST size each cell to fit its own pinyin
  (`max(hanziCellW, pinyinTextW + pad)`). The test
  `src/export/syllableCellW.test.ts` enforces this.
- Any feature that touches Supabase writes (entry insert, session
  link, etc.) MUST surface failures into the `pendingPersists` queue
  via the catch block in `dictStore.query`, so the
  `PendingPersistsBanner` can render and `flushPendingPersists` can
  retry. Silently dropping a write is never acceptable.
