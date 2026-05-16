/**
 * dictStore — single store backing the entire app.
 *
 * Architecture:
 *   • UI prefs (`prefs`, `currentManagedStudentId`) live in localStorage via
 *     zustand `persist` so the user's preferred language / context survives
 *     reloads with no network roundtrip.
 *   • Real data (`entries`, `sessions`) lives in Supabase Postgres.  The
 *     in-memory copy is a cache rebuilt by `hydrate()` whenever auth state
 *     changes or the user switches managed-student context.
 *
 * Lifecycle:
 *   • App.tsx watches AuthContext.  When status flips to 'authed', it calls
 *     `hydrate()`; when it flips to 'anon', it calls `reset()`.
 *   • All mutating actions (`query`, `deleteEntry`, `startManualClass`, …)
 *     are now async — they hit Supabase first, then update local state with
 *     the server-returned row.  The latency penalty (~200–400 ms per insert)
 *     is invisible next to the AI translation call (2–5 s) for `query`, and
 *     fast enough elsewhere not to need optimistic updates in v1.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ClassSession,
  DictionaryEntry,
  ExportOptions,
  Meaning,
  SessionKind,
  Syllable,
  TranslationDirection,
} from '../types/dictionary';
import { translateWord } from '../api/translateClient';
import type { UILang } from '../i18n';
import { supabase, withTimeout } from '../auth/supabaseClient';
import type { ManagedStudent } from '../auth/types';
import {
  restInsert,
  restUpsert,
  restUpdate,
  restDelete,
  restSelect,
} from '../auth/supabaseRest';

const DEFAULT_LANGUAGE = 'English';
const DEFAULT_UI_LANG: UILang = 'en';

/**
 * localStorage key used by the pre-cloud version of this app.  Step 4's
 * importLegacy() reads from it; once the import succeeds the key is
 * renamed to `${LEGACY_KEY}-imported` so we never re-prompt.
 */
export const LEGACY_KEY = 'note-dict-v1';
export const LEGACY_SKIP_KEY = 'note-dict-import-skipped';

/**
 * Sort modes for the StudentManager folder list.  Mirrors the three
 * orderings a Windows folder view offers — by name, by date created,
 * by date last modified.  We treat "last modified" as last *activity*
 * (most recent entry queried into that folder) rather than the row's
 * own updated_at: the user's mental model is "when did I last touch
 * this folder", which for our app means "when did I last query a
 * word for this student".
 */
export type StudentSortKey = 'name' | 'created' | 'activity';
export type StudentSortDir = 'asc' | 'desc';

interface Prefs {
  language: string;
  uiLanguage: UILang;
  showPinyin: boolean;
  studentSortKey: StudentSortKey;
  studentSortDir: StudentSortDir;
}

/* ───────────────────────── Postgres row shapes ───────────────────────── */

interface EntryRow {
  id: string;
  owner_user_id: string;
  managed_student_id: string | null;
  word: string;
  direction: TranslationDirection;
  language: string;
  word_syllables: Syllable[];
  meanings: Meaning[];
  queried_at: string; // timestamptz ISO
}

interface SessionRow {
  id: string;
  owner_user_id: string;
  managed_student_id: string | null;
  name: string;
  kind: SessionKind;
  created_at: string;
  ended_at: string | null;
}

interface SessionEntryRow {
  session_id: string;
  entry_id: string;
}

interface ManagedStudentRow {
  id: string;
  teacher_id: string;
  name: string;
  created_at: string;
}

/* ───────────────────────── row → app-shape mappers ───────────────────────── */

function entryFromRow(r: EntryRow): DictionaryEntry {
  return {
    id: r.id,
    direction: r.direction,
    word: r.word,
    wordSyllables: r.word_syllables ?? [],
    language: r.language,
    meanings: r.meanings ?? [],
    queriedAt: new Date(r.queried_at).getTime(),
  };
}

function sessionFromRow(r: SessionRow, entryIds: string[]): ClassSession {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    createdAt: new Date(r.created_at).getTime(),
    endedAt: r.ended_at ? new Date(r.ended_at).getTime() : undefined,
    entryIds,
  };
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Resolve the currently signed-in user id, or null for anonymous.
 *
 * IMPORTANT: uses `getSession()` (instant localStorage read), NOT
 * `getUser()` (network request that throws AuthSessionMissingError
 * for anon users).  For an anonymous user, `getUser()`'s thrown
 * rejection used to bubble out of `query()` before the loading flag
 * was even set — the user clicked Search and saw absolutely nothing
 * happen.  `getSession()` returns `{ session: null }` cleanly for
 * anon and never throws.
 *
 * Wrapped in `withTimeout(3s)` — even with `lock: noopLock` we've had
 * sporadic reports of getSession() never resolving (suspected SDK
 * mutex with a pending auto-refresh).  On timeout we treat the user
 * as anonymous so `query()` can proceed against /api/translate
 * without a Bearer token instead of leaving the spinner stuck.
 */
/* ───────────────────── Library cache helpers ─────────────────────
 * Same word + same language + same direction → reuse the existing
 * entry instead of paying for another AI call.  Saves Gemini quota
 * and gives an instant result for repeats.
 *
 * Cache scope:
 *   • Signed-in user → search the cloud-mirrored `entries` map.
 *     A hit is just a different filter on data already in memory.
 *   • Anonymous user → search the device-local `anonCache` map
 *     (persisted via zustand-persist to localStorage).
 *
 * Match rules:
 *   • word: case-insensitive after trim (Chinese is unaffected;
 *     latin input from reverse-mode benefits).
 *   • direction: must match exactly.
 *   • language: matches exactly for forward direction (it's the
 *     user-selected target).  For reverse direction the language is
 *     auto-detected by AI, so we don't have it pre-call — match on
 *     word + direction only and let whichever language was first
 *     stored win.
 * ────────────────────────────────────────────────────────────── */

const MAX_ANON_CACHE_ENTRIES = 200;

function normalizeWord(s: string): string {
  return s.trim().toLowerCase();
}

function entryMatches(
  e: DictionaryEntry,
  word: string,
  language: string,
  direction: TranslationDirection,
): boolean {
  const eDir: TranslationDirection = e.direction ?? 'zh-to-other';
  if (eDir !== direction) return false;
  if (normalizeWord(e.word) !== normalizeWord(word)) return false;
  if (direction === 'zh-to-other') {
    if ((e.language ?? '').trim().toLowerCase() !== language.trim().toLowerCase()) {
      return false;
    }
  }
  return true;
}

function findCachedEntry(
  map: Record<string, DictionaryEntry>,
  word: string,
  language: string,
  direction: TranslationDirection,
): DictionaryEntry | null {
  for (const e of Object.values(map)) {
    if (entryMatches(e, word, language, direction)) return e;
  }
  return null;
}

/** Add to anon cache; evict the oldest by queriedAt if over limit. */
function addToAnonCache(
  cache: Record<string, DictionaryEntry>,
  entry: DictionaryEntry,
): Record<string, DictionaryEntry> {
  const updated: Record<string, DictionaryEntry> = { ...cache, [entry.id]: entry };
  const ids = Object.keys(updated);
  if (ids.length <= MAX_ANON_CACHE_ENTRIES) return updated;
  const sortedByAge = Object.values(updated).sort((a, b) => a.queriedAt - b.queriedAt);
  const toEvict = sortedByAge.slice(0, ids.length - MAX_ANON_CACHE_ENTRIES);
  for (const e of toEvict) delete updated[e.id];
  return updated;
}

/* ─────────────── Optimistic UI + background persistence ───────────────
 *
 * UX goal: the moment the AI hands us a translation, the user sees
 * the result.  Saving it to Supabase (entries row + session linking)
 * happens *after* the UI has already updated, in a background task.
 *
 * Why this matters: Supabase database writes occasionally hang
 * indefinitely after the tab has been idle for a while (Chrome
 * throttling leaves the SDK's fetch socket in a half-open state).
 * Before this refactor, that hang manifested as "查询中…" forever
 * because the spinner only cleared after the writes succeeded.  Now
 * the spinner clears as soon as the AI returns, and the worst-case
 * post-idle outcome is "this one query isn't in History; refresh
 * to retry" instead of "the app appears frozen".
 *
 * Both helpers below are fire-and-forget: the caller `.catch()`s
 * them to log a warning, but never propagates the error to the
 * spinner or to the catch block in query() that would surface it
 * to the user.
 * ──────────────────────────────────────────────────────────────── */

interface PersistContext {
  userId: string;
  managedStudentId: string | null;
  activeManualSessionId: string | null;
}

/**
 * One queued retry of a background-persist that failed.  Stored in
 * `state.pendingPersists` (keyed by entry.id) and persisted to
 * localStorage so it survives tab reloads.  Re-played on the next
 * hydrate via `flushPendingPersists`.
 *
 * `entry` carries the full payload (word, syllables, meanings,
 * queriedAt) so we can re-issue a complete UPSERT without needing
 * to re-call the AI.  `ctx` carries the user/student/session
 * context that was active when the original persist was attempted —
 * we replay against THAT context, not whichever student is current
 * at retry time, so a teacher who switched folders between sessions
 * doesn't mis-tag yesterday's queries.
 */
export interface PendingPersist {
  entry: DictionaryEntry;
  ctx: PersistContext;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
}

/**
 * Find or create today's auto session, then idempotently link
 * `entryId` to it (and to the active manual class, if any).  Used
 * by both the cache-miss persister and the cache-hit re-linker.
 *
 * Reads `sessions` from `getState()` at call time so a parallel
 * hydrate() that landed during the wait doesn't get clobbered, and
 * uses functional `setStore((state) => …)` for the same reason.
 */
async function attachEntryToTodaysSessions(
  entryId: string,
  ctx: PersistContext,
  getState: () => DictState,
  setStore: (
    s:
      | Partial<DictState>
      | ((state: DictState) => Partial<DictState>),
  ) => void,
  /**
   * Optional override for the date key.  Defaults to "now"; the
   * pending-persist retry path passes the entry's original queriedAt
   * so that retried entries land in the auto session of the day they
   * were originally queried, not the day the retry happened.
   */
  asOfTs: number = Date.now(),
): Promise<void> {
  const todayKey = dateKey(asOfTs);
  let updatedSessions = getState().sessions.slice();

  let autoSession = updatedSessions.find(
    (s) => s.kind === 'auto' && s.name === todayKey,
  );
  if (!autoSession) {
    // Lookup-or-create the auto session for (this user, this student,
    // today's date).  We don't rely on a unique index to dedupe — a
    // concurrent insert race could occasionally produce two rows with
    // the same name; rare enough not to bother yet.
    //
    // Lookup uses restSelect (raw fetch) too — see below for why
    // writes ALL bypass supabase-js, but for symmetry the lookup
    // tied to the write also goes through raw fetch.
    const studentFilter =
      ctx.managedStudentId === null
        ? 'managed_student_id=is.null'
        : `managed_student_id=eq.${ctx.managedStudentId}`;
    const lookupQ =
      `owner_user_id=eq.${ctx.userId}&${studentFilter}` +
      `&name=eq.${encodeURIComponent(todayKey)}&kind=eq.auto&limit=1`;
    const lookup = await restSelect<SessionRow>('class_sessions', lookupQ);
    if (lookup.error) throw new Error(lookup.error.message);
    const found = lookup.data && lookup.data.length > 0 ? lookup.data[0] : null;
    if (found) {
      autoSession = sessionFromRow(found, []);
      updatedSessions = [autoSession, ...updatedSessions];
    } else {
      const ins = await restInsert<SessionRow>(
        'class_sessions',
        {
          owner_user_id: ctx.userId,
          managed_student_id: ctx.managedStudentId,
          name: todayKey,
          kind: 'auto',
        },
        { returning: 'representation', timeoutMs: SUPABASE_WRITE_TIMEOUT_MS },
      );
      if (ins.error) throw new Error(ins.error.message);
      const inserted = ins.data && ins.data.length > 0 ? ins.data[0] : null;
      if (!inserted) throw new Error('class_sessions.insert returned no row');
      autoSession = sessionFromRow(inserted, []);
      updatedSessions = [autoSession, ...updatedSessions];
    }
  }

  // Pick sessions that don't already have this entry (skip duplicates —
  // session_entries has a unique PK that would reject them).
  const targetSessions: ClassSession[] = [];
  if (!autoSession.entryIds.includes(entryId)) targetSessions.push(autoSession);
  if (
    ctx.activeManualSessionId &&
    ctx.activeManualSessionId !== autoSession.id
  ) {
    const manual = updatedSessions.find((s) => s.id === ctx.activeManualSessionId);
    if (manual && !manual.entryIds.includes(entryId)) targetSessions.push(manual);
  }

  if (targetSessions.length > 0) {
    const links: SessionEntryRow[] = targetSessions.map((s) => ({
      session_id: s.id,
      entry_id: entryId,
    }));
    // Upsert with ignore-duplicates so retry-after-failed-response
    // is idempotent (the unique PK on (session_id, entry_id) would
    // otherwise 409 a perfectly-valid retry).
    const linkRes = await restInsert<SessionEntryRow>('session_entries', links, {
      onConflict: 'session_id,entry_id',
      resolution: 'ignore-duplicates',
      timeoutMs: SUPABASE_WRITE_TIMEOUT_MS,
    });
    if (linkRes.error) throw new Error(linkRes.error.message);

    const linkedIds = new Set(targetSessions.map((s) => s.id));
    updatedSessions = updatedSessions.map((s) =>
      linkedIds.has(s.id) ? { ...s, entryIds: [...s.entryIds, entryId] } : s,
    );
  }

  setStore((state) => ({
    sessions: mergeSessionsAfterQuery(state.sessions, updatedSessions),
  }));
}

/**
 * Persist a brand-new entry (cache miss) to the cloud: UPSERT into
 * `entries` (using the client-generated UUID we already showed the
 * user), then attach to today's sessions.  Background task — caller
 * doesn't await it.
 *
 * UPSERT (not bare INSERT) so that a retry from the pending-persist
 * queue is idempotent.  The original attempt may have actually
 * succeeded server-side and we just lost the response (timeout /
 * tab idle / network blip), in which case a bare INSERT would 409
 * and the entry would never get out of the queue.  Upserting on
 * `id` simply overwrites with the same payload — safe.
 */
async function persistNewEntryToCloud(
  entry: DictionaryEntry,
  ctx: PersistContext,
  getState: () => DictState,
  setStore: (
    s:
      | Partial<DictState>
      | ((state: DictState) => Partial<DictState>),
  ) => void,
): Promise<void> {
  // 1. UPSERT the entry via raw fetch — NOT supabase-js.
  //
  // Critical field finding: after a tab has been open for a few hours
  // (Chrome throttling kicking in on long-lived sessions), supabase-
  // js's `from(...).upsert(...)` silently wedges.  No resolution, no
  // rejection, no abort response — every write times out indefinitely.
  // We saw 87 entries pile up in pendingPersists with "timed out
  // after 10000ms" before finding that the same payload via raw
  // fetch returns 201 in ~1 s.  So all writes bypass the SDK now.
  //
  // We provide our own UUID — Postgres's `default gen_random_uuid()`
  // only kicks in when no value is sent.  This lets us show the entry
  // in the UI before the upsert completes and lets retries be
  // idempotent (upsert on `id` overwrites with the same payload).
  const entryRes = await restUpsert<EntryRow>(
    'entries',
    {
      id: entry.id,
      owner_user_id: ctx.userId,
      managed_student_id: ctx.managedStudentId,
      word: entry.word,
      direction: entry.direction ?? 'zh-to-other',
      language: entry.language,
      word_syllables: entry.wordSyllables,
      meanings: entry.meanings,
      // Preserve the original query timestamp on retries so the
      // entry sorts to its real position in History, not to "now".
      queried_at: new Date(entry.queriedAt).toISOString(),
    },
    { onConflict: 'id', timeoutMs: SUPABASE_WRITE_TIMEOUT_MS },
  );
  if (entryRes.error) throw new Error(entryRes.error.message);
  // eslint-disable-next-line no-console
  console.log(
    `[dictStore] persisted entry ${entry.id} word="${entry.word}" managed_student_id=${ctx.managedStudentId ?? 'null(self)'}`,
  );

  // Bump the in-memory student-activity map so the StudentSwitcher
  // dropdown + StudentManager modal sort by activity reflect this
  // brand-new query immediately, without waiting for the next
  // hydrate to re-run loadStudentLastActivity.  Skipped for
  // null-student (the teacher's own folder) since the activity map
  // only tracks managed students.
  if (ctx.managedStudentId) {
    const sid = ctx.managedStudentId;
    setStore((state) => ({
      studentLastActivity: {
        ...state.studentLastActivity,
        [sid]: Math.max(
          state.studentLastActivity[sid] ?? 0,
          entry.queriedAt,
        ),
      },
    }));
  }

  // 2. Attach to today's auto session + active manual class (if any).
  //    Use the entry's original queriedAt to figure out the date key,
  //    not Date.now() — a retry the next morning should still go into
  //    the YESTERDAY's auto session, not today's.
  await attachEntryToTodaysSessions(
    entry.id,
    ctx,
    getState,
    setStore,
    entry.queriedAt,
  );
}

/**
 * Force-refresh path: an entry already exists in the cloud, but the
 * user clicked "Refresh" because the AI's original answer looked
 * wrong (bad pinyin / example missing the queried word / etc).  We
 * re-called the AI with `force=true` so the L2 cache was overwritten;
 * now mirror that fresh payload onto the existing entries row in
 * place — same id, so any session links / history positioning are
 * preserved.
 *
 * Background task; the caller already updated the in-memory entry
 * synchronously and shouldn't wait on this round-trip.
 */
async function updateExistingEntryInCloud(
  entry: DictionaryEntry,
): Promise<void> {
  // Raw-fetch UPDATE — see persistNewEntryToCloud for the long
  // explanation of why writes bypass supabase-js.
  const res = await restUpdate<EntryRow>(
    'entries',
    { id: entry.id },
    {
      word: entry.word,
      direction: entry.direction ?? 'zh-to-other',
      language: entry.language,
      word_syllables: entry.wordSyllables,
      meanings: entry.meanings,
    },
    { timeoutMs: SUPABASE_WRITE_TIMEOUT_MS },
  );
  if (res.error) throw new Error(res.error.message);
  // eslint-disable-next-line no-console
  console.log(
    `[dictStore] refreshed entry ${entry.id} word="${entry.word}"`,
  );
}

/**
 * Cache-hit path: show the cached entry RIGHT NOW (synchronously),
 * then re-link it to today's session group in the background so a
 * re-query during a class still includes it in that class's PPT
 * export.  Any DB hang in the linker is logged but never blocks the
 * UI — the result was already shown.
 */
function applyCloudCacheHit(opts: {
  cached: DictionaryEntry;
  userId: string;
  getState: () => DictState;
  setStore: (
    s:
      | Partial<DictState>
      | ((state: DictState) => Partial<DictState>),
  ) => void;
}): void {
  const { cached, userId, getState, setStore } = opts;

  // 1. Synchronous state update — user sees the cached card the
  //    moment we know it's a hit.  No await, no DB round-trip.
  setStore({
    latestEntryId: cached.id,
    latestFromCache: true,
    loading: false,
    error: null,
  });

  // 2. Re-link in the background.  Read context at firing time so
  //    we use whichever student folder / manual class the user is
  //    currently in.
  const fresh = getState();
  const ctx: PersistContext = {
    userId,
    managedStudentId: fresh.currentManagedStudentId,
    activeManualSessionId: fresh.activeManualSessionId,
  };
  attachEntryToTodaysSessions(cached.id, ctx, getState, setStore).catch(
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(
        `[dictStore] background re-link failed for cached entry ${cached.id} (word="${cached.word}") — enqueuing for retry:`,
        err,
      );
      // ⚠️ Earlier this only logged — which silently dropped the
      // "By date" linkage for ANY cache-hit query during a wedged
      // session.  Now we enqueue so the banner surfaces it and
      // flushPendingPersists retries on the next reload.  On retry,
      // persistNewEntryToCloud's UPSERT is a no-op against the
      // already-existing row, then attachEntryToTodaysSessions
      // re-tries the session link.
      setStore((state) => ({
        pendingPersists: {
          ...state.pendingPersists,
          [cached.id]: {
            entry: cached,
            ctx,
            enqueuedAt: Date.now(),
            attempts: 1,
            lastError: msg,
          },
        },
      }));
    },
  );
}

/**
 * NOTE: withSupabaseTimeout has been extracted to its own file
 * (./withSupabaseTimeout.ts) so it can be unit-tested in isolation,
 * without dragging in the supabase client / Zustand store / browser
 * globals.  The previous inline JSDoc is preserved here as historical
 * context — see that file for the current implementation and its
 * regression test (withSupabaseTimeout.test.ts).
 *
 * Old inline comment:
 *
 * Wrap a Supabase query builder call in an AbortController so it can't
 * hang forever.  Field-reported failure mode: after the tab has been
 * idle for a while, `supabase.from(...).insert(...)` sometimes never
 * resolves — the previous fetch socket is wedged after Chrome
 * throttling, but the SDK still awaits it indefinitely.  Symptom:
 * the SearchBox stays on "查询中..." even though the AI call already
 * completed (you can confirm this by refreshing and re-querying the
 * same word — the post-refresh retry hits the global cache and
 * returns instantly with the "已缓存" badge, proving the AI ran on
 * the wedged attempt).
 *
 * supabase-js v2 query builders accept `.abortSignal(signal)` —
 * passing one through makes them respect normal AbortController
 * semantics, so a timeout fires a real abort and the await rejects.
 * That's much better than the current behavior of awaiting forever.
 *
 * Caller passes a builder fn that takes the signal.  This keeps the
 * call site readable (`.abortSignal(signal)` is just one extra link
 * in the chain) without losing the type information.
 */
// (withSupabaseTimeout is imported at the top — see ./withSupabaseTimeout.ts)

const SUPABASE_WRITE_TIMEOUT_MS = 10_000;

/**
 * Reconcile sessions after a query() insert.
 *
 * `updated` is the slice we computed from a stale snapshot at query
 * time (with our newly-inserted entry linked into the relevant
 * session.entryIds).  `current` is the latest in-memory state, which
 * might have been refreshed by a hydrate() that ran in parallel
 * (e.g. while the AI was thinking) and contains sessions / entry
 * links we didn't know about.
 *
 * We want: every session our snapshot touched (kind=auto for today,
 * possibly the active manual) carries our new entry id, even after
 * accounting for whatever hydrate loaded.
 *
 * Strategy: index `updated` by id, then walk `current` and replace any
 * session that exists in both.  Any sessions only in `updated` (the
 * just-created today's-auto case) get prepended.  This way concurrent
 * hydrate inserts of OTHER sessions are preserved.
 */
function mergeSessionsAfterQuery(
  current: ClassSession[],
  updated: ClassSession[],
): ClassSession[] {
  const updatedById = new Map(updated.map((s) => [s.id, s]));
  const currentIds = new Set(current.map((s) => s.id));
  const merged = current.map((s) => updatedById.get(s.id) ?? s);
  // Anything in `updated` that wasn't in `current` (e.g. a brand-new
  // auto session we just created during query()): prepend so it
  // surfaces at the top, matching the auto-session ordering.
  for (const s of updated) {
    if (!currentIds.has(s.id)) {
      merged.unshift(s);
    }
  }
  return merged;
}

/**
 * Read the signed-in user id directly from localStorage, the way
 * Supabase persists it.  Returns null if no token is stored.
 *
 * Why this exists:  the previous implementation called
 * `supabase.auth.getSession()` with a 3 s `withTimeout` fallback
 * to `null`.  That works in steady state, but under lock
 * contention (which we already have ample reports of with the
 * navigator-locks/auto-refresh races) `getSession()` can stall
 * past the 3 s budget — at which point the fallback fires and
 * we return null, and `query()` THINKS THE USER IS ANONYMOUS.
 * The query then takes the anon path, which:
 *   • doesn't INSERT into the cloud `entries` table
 *   • REPLACES the in-memory entries map with just the new entry
 * So a signed-in teacher who switches to a fresh student folder
 * (which triggers hydrate + token refresh in parallel, peak lock
 * pressure) and immediately queries gets exactly the symptom the
 * user reported: queries don't save, and "全部查询" only ever
 * shows the latest one.
 *
 * localStorage reads are synchronous and never hang.  Supabase
 * writes the session there atomically on signin/signout, so it's
 * an authoritative source.  The SDK might lag behind on token
 * refresh, but the *user identity* is stable across that —
 * which is all we need to decide "anon vs cloud path".
 *
 * Async signature kept for compatibility with all the existing
 * `await getCurrentUserId()` call sites.
 */
function getStoredUserIdSync(): string | null {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    if (!url) return null;
    // Supabase storage key is `sb-<project-ref>-auth-token`.
    const ref = url.match(/https?:\/\/([^.]+)\./)?.[1];
    if (!ref) return null;
    const raw = localStorage.getItem(`sb-${ref}-auth-token`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as
      | { user?: { id?: string } | null; access_token?: string; refresh_token?: string }
      | null;
    if (!parsed) return null;
    // Treat empty / signed-out shape as anonymous.
    if (!parsed.access_token || !parsed.refresh_token) return null;
    const id = parsed.user?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

async function getCurrentUserId(): Promise<string | null> {
  // Fast path: localStorage read.  Sync, can't hang, can't be
  // misclassified by a lock-contended SDK call.
  const stored = getStoredUserIdSync();
  if (stored) return stored;

  // Fallback: ask the SDK.  Covers edge cases where the user just
  // signed in and the storage write hasn't settled yet, or where
  // localStorage is unavailable (private mode etc.).  Keep the
  // 3 s timeout so we still degrade to anon if the SDK is wedged.
  const data = await withTimeout(
    supabase.auth.getSession().then((r) => r.data),
    3000,
    { session: null } as Awaited<ReturnType<typeof supabase.auth.getSession>>['data'],
    'dictStore.getCurrentUserId/getSession',
  );
  return data.session?.user.id ?? null;
}

/**
 * Inspect localStorage for legacy pre-cloud data.  Returns null when the
 * blob is missing or unparseable (i.e. nothing to import); returns
 * counts when a plausible legacy blob is found.  Used by the UI to
 * decide whether to show the import-prompt dialog.
 */
export function readLegacyStats(): { entries: number; sessions: number } | null {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
    const legacy = parsed?.state ?? (parsed as Record<string, unknown>);
    const entries = (legacy?.entries ?? {}) as Record<string, unknown>;
    const sessions = (legacy?.sessions ?? []) as unknown[];
    const eN = Object.keys(entries).length;
    const sN = Array.isArray(sessions) ? sessions.length : 0;
    if (eN === 0 && sN === 0) return null;
    return { entries: eN, sessions: sN };
  } catch {
    return null;
  }
}

export function legacyImportSkipped(): boolean {
  return localStorage.getItem(LEGACY_SKIP_KEY) === '1';
}

export function markLegacyImportSkipped(): void {
  localStorage.setItem(LEGACY_SKIP_KEY, '1');
}

/* ───────────────────────── store shape ───────────────────────── */

interface DictState {
  /** Server-mirrored cache.  Empty until hydrate(). */
  entries: Record<string, DictionaryEntry>;
  sessions: ClassSession[];
  activeManualSessionId: string | null;

  /** Persisted UI prefs (per-device). */
  prefs: Prefs;

  /**
   * Persisted teacher context: which managed-student "folder" the teacher is
   * currently in.  null = teacher's own personal context (or any student).
   * Switching this triggers a re-hydrate.
   */
  currentManagedStudentId: string | null;

  /**
   * Teacher's roster of managed-student folders (loaded on hydrate).
   * Empty for students because RLS gates managed_students by teacher_id.
   */
  managedStudents: ManagedStudent[];

  /** True once hydrate() has finished (UI shows skeleton while false). */
  hydrated: boolean;

  /**
   * Device-local cache for anonymous queries.  Keyed by entry.id.
   * Survives reloads via zustand-persist, capped at
   * MAX_ANON_CACHE_ENTRIES (oldest evicted by queriedAt).  Only
   * populated when there is no signed-in user — signed-in users
   * already have a server-mirrored library in `entries`.
   */
  anonCache: Record<string, DictionaryEntry>;

  /**
   * Last-activity timestamp per managed student.  Driven by:
   *   • A one-shot fetch on every successful `hydrate()` —
   *     `loadStudentLastActivity` aggregates `max(queried_at)` across
   *     the teacher's entries grouped by managed_student_id.
   *   • In-line bumps whenever `persistNewEntryToCloud` succeeds for
   *     a managed-student-scoped entry (so the sort updates without
   *     waiting for another hydrate).
   *
   * Used by `sortStudents` to drive the "activity" sort mode.  Lives
   * in the store rather than being re-fetched per component so the
   * StudentManager modal AND the StudentSwitcher dropdown can share
   * one source of truth (the user's chosen sort must produce the
   * same order in both places).
   *
   * Transient — NOT persisted to localStorage (would be stale across
   * reloads).  Empty until the first hydrate completes.
   */
  studentLastActivity: Record<string, number>;

  /**
   * Persistence-failure recovery queue.  When a background save (the
   * optimistic UI flow's `persistNewEntryToCloud` / `attachEntry…`)
   * fails — e.g. Supabase SDK socket wedged after long idle, network
   * drop, expired auth token — the entry's full payload + persist
   * context is enqueued here instead of being silently lost.
   *
   * Persisted to localStorage (see `partialize` below) so a tab close
   * or browser crash between the optimistic UI render and the cloud
   * write doesn't lose data.  On hydrate (and on every fresh sign-in)
   * we attempt to flush the queue via UPSERT, which is idempotent
   * even if the original attempt actually succeeded server-side and
   * we just lost the response.
   *
   * The UI surfaces a banner whenever this map is non-empty so the
   * user sees "X queries waiting to sync" instead of finding out
   * after the fact that their lesson didn't save.
   *
   * Keyed by entry.id.
   */
  pendingPersists: Record<string, PendingPersist>;

  /** Transient. */
  latestEntryId: string | null;
  /**
   * True when the most recent query() call resolved from cache (no
   * AI round-trip).  Drives a small "·已缓存" badge on the result
   * card so the user can see they saved tokens.  Reset on the next
   * query, on delete, and on `clearLatest`.
   */
  latestFromCache: boolean;
  loading: boolean;
  error: string | null;

  /** Initial / re-load from Supabase.  Idempotent. */
  hydrate: () => Promise<void>;
  /** Wipe the in-memory cache (e.g. on signout). */
  reset: () => void;
  /**
   * Switch the teacher's "current student" context — triggers a re-hydrate
   * so entries/sessions reflect the new scope.
   */
  setCurrentManagedStudent: (id: string | null) => Promise<void>;

  /** Teacher CRUD on the managed-student folder list. */
  addManagedStudent: (name: string) => Promise<ManagedStudent | null>;
  renameManagedStudent: (id: string, name: string) => Promise<void>;
  deleteManagedStudent: (id: string) => Promise<void>;

  /**
   * One-shot import of pre-cloud data from the legacy
   * `note-dict-v1` localStorage blob.  Resolves with how many rows
   * landed in the cloud (or an error message).  Renames the legacy
   * key to `…-imported` afterward so we never re-prompt.
   */
  importLegacy: () => Promise<{ entries: number; sessions: number; error?: string }>;

  /**
   * Look up `word`.
   *
   * `opts.force` (default false): when true, bypass BOTH the per-user
   * library cache (in `entries`) and the global cache server-side, so
   * the AI is always called.  Used by the Refresh button on the result
   * card to regenerate a stale/incorrect answer.  An existing entry
   * matching this word + language + direction is updated in place
   * (same id, same session links); a fresh query falls back to the
   * normal new-entry path.
   */
  query: (
    word: string,
    direction?: TranslationDirection,
    opts?: { force?: boolean },
  ) => Promise<void>;
  clearLatest: () => void;
  deleteEntry: (entryId: string) => Promise<void>;

  startManualClass: (name: string) => Promise<void>;
  endManualClass: () => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  deleteSession: (sessionId: string, deleteEntries: boolean) => Promise<void>;

  setLanguage: (language: string) => void;
  setUILanguage: (lang: UILang) => void;
  setShowPinyin: (v: boolean) => void;
  setStudentSort: (key: StudentSortKey, dir: StudentSortDir) => void;

  /**
   * Try to UPSERT every queued pending-persist back to Supabase.  Each
   * successful round-trip removes its entry from the queue and merges
   * it into the local `entries` map (in case the user reloaded the
   * tab and lost the optimistic-UI in-memory copy).  Errors keep the
   * entry queued for the next attempt.
   *
   * Called automatically:
   *   • after every successful hydrate
   *   • on demand when the user clicks "Retry" in the unsaved-queries
   *     banner
   */
  flushPendingPersists: () => Promise<void>;

  /**
   * Drop every queued pending-persist.  Used by the banner's "Discard"
   * button when the user has decided the unsaved data isn't worth
   * keeping (e.g. they exported a PPT already and don't care if the
   * cloud row goes missing).  Wiped silently — caller is expected to
   * confirm with the user first.
   */
  discardPendingPersists: () => void;

  /**
   * Refresh the `studentLastActivity` map by fetching every entry's
   * (managed_student_id, queried_at) tuple from Supabase and grouping
   * max() client-side.  Called automatically at the end of `hydrate()`
   * — components don't normally need to invoke this themselves.
   */
  loadStudentLastActivity: () => Promise<void>;

  collectEntries: (sessionIds: string[]) => DictionaryEntry[];
}

/* ───────────────────────── store ───────────────────────── */

export const useDictStore = create<DictState>()(
  persist(
    (set, get) => ({
      entries: {},
      sessions: [],
      activeManualSessionId: null,
      prefs: {
        language: DEFAULT_LANGUAGE,
        uiLanguage: DEFAULT_UI_LANG,
        showPinyin: true,
        // Default StudentManager ordering: most recent activity at the
        // top.  This matches how a teacher actually thinks about their
        // folders mid-semester — the student you taught yesterday is
        // the one you most likely want to open today.
        studentSortKey: 'activity',
        studentSortDir: 'desc',
      },
      currentManagedStudentId: null,
      managedStudents: [],
      hydrated: false,
      anonCache: {},
      pendingPersists: {},
      studentLastActivity: {},
      latestEntryId: null,
      latestFromCache: false,
      loading: false,
      error: null,

      /* ─────────── lifecycle ─────────── */

      hydrate: async () => {
        const userId = await getCurrentUserId();
        if (!userId) {
          set({
            hydrated: true,
            entries: {},
            sessions: [],
            activeManualSessionId: null,
            managedStudents: [],
          });
          return;
        }

        const ctx = get().currentManagedStudentId;

        try {
          // Build queries scoped to (owner = me) AND (managed_student = ctx | null)
          let entriesQ = supabase
            .from('entries')
            .select('*')
            .eq('owner_user_id', userId)
            .order('queried_at', { ascending: false });
          entriesQ =
            ctx === null
              ? entriesQ.is('managed_student_id', null)
              : entriesQ.eq('managed_student_id', ctx);

          let sessQ = supabase
            .from('class_sessions')
            .select('*')
            .eq('owner_user_id', userId)
            .order('created_at', { ascending: false });
          sessQ =
            ctx === null
              ? sessQ.is('managed_student_id', null)
              : sessQ.eq('managed_student_id', ctx);

          // Always fetch the managed-student roster too — RLS gates this
          // by teacher_id, so it returns [] for student accounts.
          const studentsQ = supabase
            .from('managed_students')
            .select('*')
            .eq('teacher_id', userId)
            .order('created_at', { ascending: true });

          const [entriesRes, sessRes, studentsRes] = await Promise.all([
            entriesQ,
            sessQ,
            studentsQ,
          ]);
          if (entriesRes.error) throw entriesRes.error;
          if (sessRes.error) throw sessRes.error;
          if (studentsRes.error) throw studentsRes.error;
          const studentRows = (studentsRes.data ?? []) as ManagedStudentRow[];

          const entryRows = (entriesRes.data ?? []) as EntryRow[];
          const sessRows = (sessRes.data ?? []) as SessionRow[];

          // Fetch session_entries links for our sessions only.
          const sessIds = sessRows.map((s) => s.id);
          let links: SessionEntryRow[] = [];
          if (sessIds.length > 0) {
            const linksRes = await supabase
              .from('session_entries')
              .select('session_id, entry_id')
              .in('session_id', sessIds);
            if (linksRes.error) throw linksRes.error;
            links = (linksRes.data ?? []) as SessionEntryRow[];
          }

          const linkMap = new Map<string, string[]>();
          for (const l of links) {
            const arr = linkMap.get(l.session_id) ?? [];
            arr.push(l.entry_id);
            linkMap.set(l.session_id, arr);
          }

          const entriesIdx: Record<string, DictionaryEntry> = {};
          for (const r of entryRows) {
            entriesIdx[r.id] = entryFromRow(r);
          }

          // Within each session, sort entryIds chronologically by queriedAt
          // so first-looked-up appears first when iterating.
          const sessions: ClassSession[] = sessRows.map((r) => {
            const ids = (linkMap.get(r.id) ?? []).slice();
            ids.sort((a, b) => {
              const ea = entriesIdx[a];
              const eb = entriesIdx[b];
              return (ea?.queriedAt ?? 0) - (eb?.queriedAt ?? 0);
            });
            return sessionFromRow(r, ids);
          });

          // At most one manual session is "active" (ended_at IS NULL) per ctx.
          const active = sessions.find((s) => s.kind === 'manual' && !s.endedAt);

          // If the persisted ctx points to a student that's been deleted,
          // silently fall back to the teacher's own context.
          const ctxStillValid =
            ctx === null || studentRows.some((r) => r.id === ctx);

          set({
            entries: entriesIdx,
            sessions,
            activeManualSessionId: active?.id ?? null,
            managedStudents: studentRows.map(
              (r): ManagedStudent => ({
                id: r.id,
                teacher_id: r.teacher_id,
                name: r.name,
                created_at: r.created_at,
              }),
            ),
            currentManagedStudentId: ctxStillValid ? ctx : null,
            // Drop any anon-mode latestEntryId — it pointed to an
            // in-memory entry that's no longer in `entries`, so leaving
            // it would render an empty card after sign-in.
            latestEntryId: null,
            hydrated: true,
            error: null,
          });

          // Replay any persists that failed during the previous
          // session — the user may have lost their tab between an
          // optimistic-UI render and the cloud write.  This is a
          // fire-and-forget background task; failures are logged
          // and the queue stays for the next sign-in / reload.
          // Important: kicked off AFTER `hydrated: true` so the UI
          // can already paint while the upserts run in the back.
          void get().flushPendingPersists();

          // Refresh the student-last-activity aggregate.  Shared
          // between the StudentManager modal and the StudentSwitcher
          // dropdown so both render with the user's chosen sort order
          // consistently.  Fire-and-forget; failures only degrade
          // activity-sort to created-sort.
          void get().loadStudentLastActivity();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error('[dictStore] hydrate failed', err);
          set({ hydrated: true, error: msg });
        }
      },

      reset: () => {
        // NB: anonCache is NOT cleared on reset.  reset() runs when the
        // user signs out — at that point the cloud-mirrored `entries`
        // map should be wiped (it's another user's data, RLS-wise),
        // but the device-local anon cache should keep working as a
        // guest library.  signed-in entries live in `entries` and are
        // separate from anonCache.
        set({
          entries: {},
          sessions: [],
          activeManualSessionId: null,
          managedStudents: [],
          latestEntryId: null,
          latestFromCache: false,
          loading: false,
          error: null,
          hydrated: false,
        });
      },

      setCurrentManagedStudent: async (id) => {
        set({
          currentManagedStudentId: id,
          // Clear the cache immediately so stale-context data doesn't flash.
          entries: {},
          sessions: [],
          activeManualSessionId: null,
          latestEntryId: null,
          hydrated: false,
        });
        await get().hydrate();
      },

      /* ─────────── managed-students CRUD ─────────── */

      addManagedStudent: async (rawName) => {
        const name = rawName.trim();
        if (!name) return null;
        const userId = await getCurrentUserId();
        if (!userId) return null;
        // Raw-fetch INSERT — bypasses wedge-prone supabase-js writes.
        const res = await restInsert<ManagedStudentRow>(
          'managed_students',
          { teacher_id: userId, name },
          { returning: 'representation' },
        );
        if (res.error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] addManagedStudent failed', res.error);
          set({ error: res.error.message });
          return null;
        }
        const row = res.data && res.data.length > 0 ? res.data[0] : null;
        if (!row) {
          set({ error: 'addManagedStudent returned no row' });
          return null;
        }
        const ms: ManagedStudent = {
          id: row.id,
          teacher_id: row.teacher_id,
          name: row.name,
          created_at: row.created_at,
        };
        set((s) => ({ managedStudents: [...s.managedStudents, ms] }));
        return ms;
      },

      renameManagedStudent: async (id, rawName) => {
        const name = rawName.trim();
        if (!name) return;
        const res = await restUpdate<ManagedStudentRow>(
          'managed_students',
          { id },
          { name },
        );
        if (res.error) {
          // eslint-disable-next-line no-console
          console.error(
            '[dictStore] renameManagedStudent failed',
            res.error,
          );
          set({ error: res.error.message });
          return;
        }
        set((s) => ({
          managedStudents: s.managedStudents.map((m) =>
            m.id === id ? { ...m, name } : m,
          ),
        }));
      },

      deleteManagedStudent: async (id) => {
        // Postgres ON DELETE CASCADE wipes that student's entries +
        // class_sessions automatically, which is the desired behavior:
        // when a teacher removes a student folder, all their data goes too.
        const res = await restDelete('managed_students', { id });
        if (res.error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] deleteManagedStudent failed', res.error);
          set({ error: res.error.message });
          return;
        }
        const wasCurrent = get().currentManagedStudentId === id;
        set((s) => ({
          managedStudents: s.managedStudents.filter((m) => m.id !== id),
          // If we deleted the active context, fall back to "self".
          currentManagedStudentId: wasCurrent ? null : s.currentManagedStudentId,
        }));
        if (wasCurrent) {
          // Reload entries+sessions for the new (self) context.
          await get().hydrate();
        }
      },

      /* ─────────── legacy localStorage import ─────────── */

      importLegacy: async () => {
        const userId = await getCurrentUserId();
        if (!userId) return { entries: 0, sessions: 0, error: 'Not signed in' };

        const raw = localStorage.getItem(LEGACY_KEY);
        if (!raw) return { entries: 0, sessions: 0 };

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return { entries: 0, sessions: 0, error: 'Could not parse legacy data' };
        }

        const legacy =
          (parsed as { state?: unknown })?.state ?? (parsed as Record<string, unknown>);
        const entriesObj =
          ((legacy as { entries?: Record<string, DictionaryEntry> })?.entries ??
            {}) as Record<string, DictionaryEntry>;
        const sessionsArr =
          ((legacy as { sessions?: ClassSession[] })?.sessions ??
            []) as ClassSession[];

        const entriesArr = Object.values(entriesObj);
        if (entriesArr.length === 0 && sessionsArr.length === 0) {
          // Nothing to do — quietly tidy up so we never re-prompt.
          localStorage.setItem(`${LEGACY_KEY}-imported`, raw);
          localStorage.removeItem(LEGACY_KEY);
          return { entries: 0, sessions: 0 };
        }

        try {
          // 1. Bulk-insert entries.  PostgREST returns rows in the same
          // order as the request, which gives us a reliable old→new id
          // mapping without per-row queries.
          const idMap = new Map<string, string>();
          if (entriesArr.length > 0) {
            const rows = entriesArr.map((e) => ({
              owner_user_id: userId,
              managed_student_id: null,
              word: e.word,
              direction: e.direction ?? 'zh-to-other',
              language: e.language || 'auto',
              word_syllables: e.wordSyllables ?? [],
              meanings: e.meanings ?? [],
              queried_at: new Date(e.queriedAt).toISOString(),
            }));
            const { data, error } = await supabase
              .from('entries')
              .insert(rows)
              .select('id');
            if (error) throw error;
            const inserted = (data ?? []) as { id: string }[];
            entriesArr.forEach((old, i) => {
              const id = inserted[i]?.id;
              if (id) idMap.set(old.id, id);
            });
          }

          // 2. Bulk-insert sessions, same id-mapping trick.
          const sessIdMap = new Map<string, string>();
          if (sessionsArr.length > 0) {
            const rows = sessionsArr.map((s) => ({
              owner_user_id: userId,
              managed_student_id: null,
              name: s.name,
              kind: s.kind,
              created_at: new Date(s.createdAt).toISOString(),
              ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
            }));
            const { data, error } = await supabase
              .from('class_sessions')
              .insert(rows)
              .select('id');
            if (error) throw error;
            const inserted = (data ?? []) as { id: string }[];
            sessionsArr.forEach((old, i) => {
              const id = inserted[i]?.id;
              if (id) sessIdMap.set(old.id, id);
            });
          }

          // 3. Re-link via session_entries with the mapped ids.
          const links: SessionEntryRow[] = [];
          for (const s of sessionsArr) {
            const newSessId = sessIdMap.get(s.id);
            if (!newSessId) continue;
            for (const oldEntryId of s.entryIds ?? []) {
              const newEntryId = idMap.get(oldEntryId);
              if (newEntryId) {
                links.push({ session_id: newSessId, entry_id: newEntryId });
              }
            }
          }
          if (links.length > 0) {
            const { error } = await supabase.from('session_entries').insert(links);
            if (error) throw error;
          }

          // 4. Stash the legacy blob under a different key (in case the
          // user wants to inspect it later) and remove the live key so
          // we never re-prompt on this device.
          localStorage.setItem(`${LEGACY_KEY}-imported`, raw);
          localStorage.removeItem(LEGACY_KEY);

          // 5. Refresh the cache so the imported rows show up in the UI.
          await get().hydrate();

          return { entries: entriesArr.length, sessions: sessionsArr.length };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error('[dictStore] importLegacy failed', err);
          return { entries: 0, sessions: 0, error: msg };
        }
      },

      /* ─────────── query / mutate ─────────── */

      query: async (rawWord, direction = 'zh-to-other', opts) => {
        const word = rawWord.trim();
        if (!word) return;
        const force = opts?.force === true;
        // Flip the spinner ON synchronously (before any await) so the
        // SearchBox button immediately reflects the click.  Anything
        // that throws below — auth lookup, network fetch, DB insert —
        // is now safely inside the try, so loading always gets cleared
        // in the catch.
        set({ loading: true, error: null, latestFromCache: false });
        try {
          const userId = await getCurrentUserId();
          // Snapshot only the fields safe to read once at the top:
          // prefs (rarely changed, fine), entries (read-only L1 cache
          // lookup), anonCache (same).  Anything mutable across the
          // AI call (currentManagedStudentId / sessions /
          // activeManualSessionId) is RE-READ below right before the
          // insert, so a student-folder switch during the AI wait
          // doesn't tag entries to the wrong student.
          const { prefs, entries, anonCache } = get();

          /* ─── Cache lookup (skip AI on hit) ──────────────────────
           * For forward direction we know the target language up
           * front so it's part of the match.  For reverse, language
           * is auto-detected by AI; match on word + direction only.
           *
           * `force` SKIPS the per-user L1 lookup entirely so we always
           * call the AI.  We DO still locate any matching existing
           * entry below (existingEntry) so we can update it in place
           * once the fresh payload arrives — that preserves the
           * entry's id and any session links.
           * ────────────────────────────────────────────────────── */
          const cache = userId ? entries : anonCache;
          const cacheTargetLang =
            direction === 'zh-to-other' ? prefs.language : '';
          const existingEntry = findCachedEntry(cache, word, cacheTargetLang, direction);

          if (!force && existingEntry && !userId) {
            // Anon cache hit — surface the cached entry, no AI call.
            set({
              entries: { [existingEntry.id]: existingEntry },
              latestEntryId: existingEntry.id,
              latestFromCache: true,
              loading: false,
              error: null,
            });
            return;
          }

          if (!force && existingEntry && userId) {
            // Signed-in cache hit — make sure the entry is also linked
            // to today's auto session and the active manual class
            // (if any), so re-querying a known word during a class
            // still includes it in that class's export.  Other than
            // that, no AI call and no new entries row.
            // applyCloudCacheHit now updates state synchronously and
            // schedules the session re-linking in the background, so
            // we don't `await` it.  The user sees the cached entry
            // the instant we know it's a hit, regardless of how the
            // DB write goes.
            applyCloudCacheHit({
              cached: existingEntry,
              userId,
              getState: get,
              setStore: set,
            });
            return;
          }

          /* ─── L1 miss (or force) — call /api/translate (which
                 itself checks the global L2 cache before hitting the AI,
                 unless `force` is set, in which case it skips L2 too and
                 upserts the result back into L2) ───────────────────── */
          const data = await translateWord(word, prefs.language, direction, force);

          const language =
            direction === 'zh-to-other'
              ? prefs.language
              : data.language?.trim() || 'auto';

          // The server flags responses served from the global
          // dictionary_cache with _fromCache:true so the badge can
          // also fire on those (= someone else paid for this query
          // earlier; we got it free).
          const serverCacheHit = data._fromCache === true;

          // ── Anonymous path ─────────────────────────────────────────
          // Add to the persistent anon cache so future re-queries hit.
          // The current entries map only ever holds the latest one
          // (HistoryView is sign-in only — anon users see only the
          // most recent result), but anonCache keeps the full library.
          if (!userId) {
            // Force-refresh path (anon): reuse the existing id so the
            // anonCache replaces the stale row instead of accumulating
            // duplicates.  When this is a normal first-time miss,
            // existingEntry is null and we mint a fresh id.
            const id =
              force && existingEntry
                ? existingEntry.id
                : typeof crypto !== 'undefined' && 'randomUUID' in crypto
                  ? crypto.randomUUID()
                  : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const anonEntry: DictionaryEntry = {
              id,
              direction,
              word: data.word,
              wordSyllables: data.wordSyllables,
              language,
              meanings: data.meanings,
              queriedAt: Date.now(),
            };
            set({
              entries: { [id]: anonEntry },
              anonCache: addToAnonCache(anonCache, anonEntry),
              latestEntryId: id,
              latestFromCache: serverCacheHit,
              loading: false,
              error: null,
            });
            return;
          }

          // ── Force-refresh signed-in path: update existing entry ────
          //
          // We already have a row for this (word, language, direction)
          // in the cloud; the user clicked Refresh because they didn't
          // like the AI's previous answer.  Mirror the fresh payload
          // onto the existing row in place — same id, so any session
          // links / history positioning are preserved.  The L2 cache
          // was already overwritten by /api/translate (force=true →
          // upsert).
          if (force && existingEntry) {
            const refreshedEntry: DictionaryEntry = {
              ...existingEntry,
              word: data.word,
              wordSyllables: data.wordSyllables,
              language,
              meanings: data.meanings,
              queriedAt: Date.now(),
            };
            set((state) => ({
              entries: { ...state.entries, [existingEntry.id]: refreshedEntry },
              latestEntryId: existingEntry.id,
              // Don't show the "⚡ Cached" badge after a refresh — the
              // user just re-paid for an AI call, the result is
              // demonstrably *not* from cache from their perspective.
              latestFromCache: false,
              loading: false,
              error: null,
            }));
            // Background mirror to cloud — same fire-and-forget
            // pattern as persistNewEntryToCloud.
            updateExistingEntryInCloud(refreshedEntry).catch((err) => {
              // eslint-disable-next-line no-console
              console.warn(
                `[dictStore] background refresh persist failed for entry ${existingEntry.id} (word="${refreshedEntry.word}") — UI updated but cloud row may still hold the old payload until you refresh + re-query:`,
                err,
              );
            });
            return;
          }

          // ── Signed-in path: optimistic UI + background persist ─────
          //
          // Show the AI result IMMEDIATELY (synchronous setStore),
          // then persist to Supabase as a fire-and-forget background
          // task.  The user no longer waits on DB writes for the
          // spinner to clear — so the post-idle "查询中…" forever
          // failure mode (Supabase socket wedged, .insert() never
          // resolves) is gone.  Worst case for that wedge now: this
          // one query won't appear in History until the user
          // refreshes and re-queries (which hits the global cache
          // and saves cleanly under the fresh client).
          //
          // Re-read currentManagedStudentId / activeManualSessionId
          // here (not from the top-of-function snapshot) so the
          // entry is tagged to whichever folder the user ended up
          // in after the AI call, in case they switched mid-wait.
          const fresh = get();
          const ctx: PersistContext = {
            userId,
            managedStudentId: fresh.currentManagedStudentId,
            activeManualSessionId: fresh.activeManualSessionId,
          };

          // Generate the entry's UUID client-side.  Postgres's
          // `default gen_random_uuid()` only fires when no value is
          // sent, so providing one lets us show the card before the
          // INSERT round-trip completes — the id is already known
          // and stable across the optimistic-render and the actual
          // DB row.
          const newEntryId =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `c-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

          const newEntry: DictionaryEntry = {
            id: newEntryId,
            direction,
            word: data.word,
            wordSyllables: data.wordSyllables,
            language,
            meanings: data.meanings,
            queriedAt: Date.now(),
          };

          // 1. SHOW IMMEDIATELY.  Spinner clears, ResultCard renders.
          set((state) => ({
            entries: { ...state.entries, [newEntryId]: newEntry },
            latestEntryId: newEntryId,
            latestFromCache: serverCacheHit,
            loading: false,
            error: null,
          }));

          // 2. PERSIST IN BACKGROUND.  On failure, instead of silently
          //    swallowing the error (which is what caused the lost-
          //    lesson-data bug — a teacher's whole class never landed
          //    in the cloud), we ENQUEUE the entry for retry and let
          //    the UI banner surface it to the user.  The pending
          //    queue lives in localStorage so even a tab close before
          //    retry doesn't lose data.
          persistNewEntryToCloud(newEntry, ctx, get, set).catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.warn(
              `[dictStore] background persist failed for entry ${newEntryId} (word="${newEntry.word}") — enqueued for retry:`,
              err,
            );
            set((state) => ({
              pendingPersists: {
                ...state.pendingPersists,
                [newEntryId]: {
                  entry: newEntry,
                  ctx,
                  enqueuedAt: Date.now(),
                  attempts: 1,
                  lastError: msg,
                },
              },
            }));
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error('[dictStore] query failed', err);
          // If the error came from one of our withSupabaseTimeout
          // aborts (typical post-idle wedge: response was received,
          // but the DB write hangs forever on the SDK's cached socket),
          // give the user a clear next step instead of dumping the
          // raw "AbortError" / "signal is aborted without reason".
          // The AI result is already in the global cache from our
          // /api/translate request, so a refresh + re-query hits
          // cache and is instant.
          const isAbort = /aborted?|abort/i.test(msg) || (err instanceof DOMException && err.name === 'AbortError');
          const friendly = isAbort
            ? '云端保存超时（页面闲置过久后偶发）。请刷新页面后再查一次——结果已缓存，重试会立刻返回。'
            : msg;
          set({ loading: false, error: friendly });
        }
      },

      clearLatest: () =>
        set({ latestEntryId: null, latestFromCache: false, error: null }),

      deleteEntry: async (entryId) => {
        const state = get();
        const exists = state.entries[entryId];
        if (!exists) return;

        // Optimistic local update — undo on server failure.
        const { [entryId]: _removed, ...restEntries } = state.entries;
        const newSessions = state.sessions.map((s) => ({
          ...s,
          entryIds: s.entryIds.filter((id) => id !== entryId),
        }));
        // Also drop the entry from the anon cache so the user doesn't
        // immediately get it back from cache on the next query.
        const { [entryId]: _alsoFromCache, ...restAnonCache } = state.anonCache;
        set({
          entries: restEntries,
          sessions: newSessions,
          anonCache: restAnonCache,
          latestEntryId:
            state.latestEntryId === entryId ? null : state.latestEntryId,
          latestFromCache:
            state.latestEntryId === entryId ? false : state.latestFromCache,
        });

        // FK cascades clean up session_entries.
        const res = await restDelete('entries', { id: entryId });
        if (res.error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] deleteEntry failed', res.error);
          // Restore the entry locally so UI doesn't lie.
          set({
            entries: { ...restEntries, [entryId]: exists },
            sessions: state.sessions,
            anonCache: state.anonCache,
            error: res.error.message,
          });
        }
      },

      startManualClass: async (name) => {
        const userId = await getCurrentUserId();
        if (!userId) return;
        const { currentManagedStudentId } = get();
        const trimmed = name.trim() || `课程 ${dateKey(Date.now())}`;
        const res = await restInsert<SessionRow>(
          'class_sessions',
          {
            owner_user_id: userId,
            managed_student_id: currentManagedStudentId,
            name: trimmed,
            kind: 'manual',
          },
          { returning: 'representation' },
        );
        if (res.error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] startManualClass failed', res.error);
          set({ error: res.error.message });
          return;
        }
        const sessRow = res.data && res.data.length > 0 ? res.data[0] : null;
        if (!sessRow) {
          set({ error: 'startManualClass returned no row' });
          return;
        }
        const session = sessionFromRow(sessRow, []);
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeManualSessionId: session.id,
        }));
      },

      endManualClass: async () => {
        const state = get();
        const id = state.activeManualSessionId;
        if (!id) return;
        const endedAtISO = new Date().toISOString();
        const res = await restUpdate<SessionRow>(
          'class_sessions',
          { id },
          { ended_at: endedAtISO },
        );
        if (res.error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] endManualClass failed', res.error);
          set({ error: res.error.message });
          return;
        }
        const endedAt = new Date(endedAtISO).getTime();
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === id ? { ...sess, endedAt } : sess,
          ),
          activeManualSessionId: null,
        }));
      },

      renameSession: async (sessionId, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const res = await restUpdate<SessionRow>(
          'class_sessions',
          { id: sessionId },
          { name: trimmed },
        );
        if (res.error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] renameSession failed', res.error);
          set({ error: res.error.message });
          return;
        }
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId ? { ...sess, name: trimmed } : sess,
          ),
        }));
      },

      deleteSession: async (sessionId, deleteEntries) => {
        const state = get();
        const target = state.sessions.find((s) => s.id === sessionId);
        if (!target) return;

        let newEntries = state.entries;

        if (deleteEntries) {
          // Only delete entries that belong to NO other session.
          const otherSessions = state.sessions.filter((s) => s.id !== sessionId);
          const referenced = new Set<string>();
          otherSessions.forEach((s) => s.entryIds.forEach((id) => referenced.add(id)));
          const orphaned = target.entryIds.filter((id) => !referenced.has(id));

          if (orphaned.length > 0) {
            // restDelete supports a single `eq.` per column.  For a
            // batch of ids we issue one DELETE per id — sequential
            // raw-fetch deletes are still fast (each ~100–300 ms) and
            // way more reliable than a single supabase-js .in() that
            // can wedge.  Total time for a class of 50 entries: ~10 s.
            for (const orphanId of orphaned) {
              const delRes = await restDelete('entries', { id: orphanId });
              if (delRes.error) {
                // eslint-disable-next-line no-console
                console.error(
                  '[dictStore] deleteSession (entries) failed',
                  delRes.error,
                );
                set({ error: delRes.error.message });
                return;
              }
            }
            newEntries = { ...state.entries };
            orphaned.forEach((id) => delete newEntries[id]);
          }
        }

        // session_entries cascades on the FK.
        const delSessRes = await restDelete('class_sessions', { id: sessionId });
        if (delSessRes.error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] deleteSession failed', delSessRes.error);
          set({ error: delSessRes.error.message });
          return;
        }

        set({
          entries: newEntries,
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          activeManualSessionId:
            state.activeManualSessionId === sessionId
              ? null
              : state.activeManualSessionId,
        });
      },

      /* ─────────── prefs (UI-only, no server) ─────────── */

      setLanguage: (language) => {
        set((s) => ({ prefs: { ...s.prefs, language } }));
      },
      setUILanguage: (uiLanguage) => {
        set((s) => ({ prefs: { ...s.prefs, uiLanguage } }));
      },
      setShowPinyin: (v) => {
        set((s) => ({ prefs: { ...s.prefs, showPinyin: v } }));
      },
      setStudentSort: (key, dir) => {
        set((s) => ({
          prefs: { ...s.prefs, studentSortKey: key, studentSortDir: dir },
        }));
      },

      /* ─────────── pending-persist recovery ─────────── */

      flushPendingPersists: async () => {
        // Snapshot the queue at call-time.  We iterate over this
        // snapshot rather than the live state so concurrent enqueues
        // (a fresh failure from the user typing a new word while we
        // retry) don't get processed twice.
        const queue = Object.values(get().pendingPersists);
        if (queue.length === 0) return;

        // Verify auth before starting — a flush attempted without a
        // signed-in user would fail every row with the same RLS
        // rejection.  If the session is gone, leave the queue intact
        // for the next sign-in.
        const userId = await getCurrentUserId();
        if (!userId) return;

        for (const pending of queue) {
          // If the user signed in as a different account since the
          // entry was queued, skip it — replaying under the wrong
          // owner_user_id would either fail RLS or worse, succeed
          // and silently misfile data.  Leave it in the queue for
          // later (the original user might sign back in).
          if (pending.ctx.userId !== userId) continue;
          try {
            await persistNewEntryToCloud(pending.entry, pending.ctx, get, set);
            // Success — drop from queue and ensure the entry is in
            // the in-memory map (covers the "tab reloaded after
            // failure" recovery case where the optimistic-UI copy
            // is already gone).
            set((state) => {
              const next = { ...state.pendingPersists };
              delete next[pending.entry.id];
              return {
                pendingPersists: next,
                entries: state.entries[pending.entry.id]
                  ? state.entries
                  : { ...state.entries, [pending.entry.id]: pending.entry },
              };
            });
            // eslint-disable-next-line no-console
            console.log(
              `[dictStore] pending-persist replayed: word="${pending.entry.word}"`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // eslint-disable-next-line no-console
            console.warn(
              `[dictStore] pending-persist retry still failing for word="${pending.entry.word}":`,
              err,
            );
            // Bump attempt counter + record latest error so the UI
            // can show progress / staleness.
            set((state) => {
              const cur = state.pendingPersists[pending.entry.id];
              if (!cur) return state;
              return {
                pendingPersists: {
                  ...state.pendingPersists,
                  [pending.entry.id]: {
                    ...cur,
                    attempts: cur.attempts + 1,
                    lastError: msg,
                  },
                },
              };
            });
          }
        }
      },

      discardPendingPersists: () => {
        set({ pendingPersists: {} });
      },

      loadStudentLastActivity: async () => {
        const userId = await getCurrentUserId();
        if (!userId) {
          // Anon — no students at all.  Leave the map untouched (it's
          // already empty from init / reset).
          return;
        }
        // Use restSelect (raw fetch) so the same Promise.race + auto-
        // refresh-on-401 protections apply.  Payload is two columns:
        // small even for teachers with thousands of entries.
        const query =
          `owner_user_id=eq.${userId}` +
          `&managed_student_id=not.is.null` +
          `&select=managed_student_id,queried_at`;
        const res = await restSelect<{
          managed_student_id: string | null;
          queried_at: string;
        }>('entries', query);
        if (res.error || !res.data) {
          // eslint-disable-next-line no-console
          console.warn(
            '[dictStore] loadStudentLastActivity failed (activity sort will fall back to created):',
            res.error,
          );
          return;
        }
        const next: Record<string, number> = {};
        for (const row of res.data) {
          if (!row.managed_student_id) continue;
          const ts = new Date(row.queried_at).getTime();
          if (!next[row.managed_student_id] || ts > next[row.managed_student_id]) {
            next[row.managed_student_id] = ts;
          }
        }
        set({ studentLastActivity: next });
      },

      /* ─────────── derived helpers ─────────── */

      collectEntries: (sessionIds) => {
        const state = get();
        const picked = new Set<string>();
        sessionIds.forEach((sid) => {
          const sess = state.sessions.find((s) => s.id === sid);
          sess?.entryIds.forEach((eid) => picked.add(eid));
        });
        return [...picked]
          .map((id) => state.entries[id])
          .filter((e): e is DictionaryEntry => Boolean(e))
          .sort((a, b) => a.queriedAt - b.queriedAt);
      },
    }),
    {
      // New persist key (v2): old `note-dict-v1` is preserved untouched in
      // localStorage so the Step 4 migration tool can read it.
      name: 'note-dict-prefs-v2',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        prefs: s.prefs,
        currentManagedStudentId: s.currentManagedStudentId,
        // anonCache lives here so guests get a real device-local
        // library that survives reloads.  Capped at
        // MAX_ANON_CACHE_ENTRIES (~200) so the localStorage payload
        // stays well under a megabyte.
        anonCache: s.anonCache,
        // Pending-persist queue MUST live in localStorage so a tab
        // close between the optimistic-UI render and the cloud write
        // doesn't lose data — that's the whole point of the queue.
        // Replayed on the next hydrate via flushPendingPersists.
        pendingPersists: s.pendingPersists,
      }),
      merge: (persistedState, currentState) => {
        const p = persistedState as Partial<DictState> | undefined;
        return {
          ...currentState,
          prefs: { ...currentState.prefs, ...(p?.prefs ?? {}) },
          currentManagedStudentId: p?.currentManagedStudentId ?? null,
          anonCache: p?.anonCache ?? {},
          pendingPersists: p?.pendingPersists ?? {},
        };
      },
    },
  ),
);

/**
 * Expose the store on `window.__dictStore` so we (or a user) can run
 * diagnostics / emergency recovery from the browser console.  Useful
 * scenarios:
 *
 *   • Inspecting state: `__dictStore.getState().pendingPersists`
 *   • Forcing a flush: `__dictStore.getState().flushPendingPersists()`
 *   • Recovering in-memory entries that didn't reach cloud yet (the
 *     exact scenario that motivated this commit):
 *
 *       __dictStore.getState().recoverInMemoryEntries()
 *
 *     This walks the in-memory `entries` map, enqueues every one
 *     into `pendingPersists` (with the current student context), then
 *     triggers a flush.  Safe even if the entry IS already in cloud:
 *     persistNewEntryToCloud upserts by id, so duplicates collapse.
 *
 * Wrapping in a `typeof window` guard so SSR / Node tests don't crash.
 */
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as unknown as { __dictStore: typeof useDictStore }).__dictStore =
    useDictStore;
}

/**
 * Emergency recovery: take every entry in the in-memory `entries`
 * map and enqueue it into the pending-persist queue, then trigger a
 * flush.  Use case: a teaching session where the optimistic UI
 * showed results but the background persist silently hung (the
 * pre-Promise.race wedge bug).  After the user runs this from the
 * console, all of their in-memory data gets upserted to cloud and
 * linked to today's auto session.
 *
 * Not exposed as a regular store action because it's a manual
 * emergency tool — the auto-recovery path is now Promise.race +
 * pending queue + auto-flush on hydrate, which catches the failure
 * AT TIME OF query() rather than after the fact.  This one is for
 * the legacy "data already lost in memory" scenario.
 */
export function recoverInMemoryEntries(): {
  enqueued: number;
  skipped: number;
} {
  const state = useDictStore.getState();
  // Pull userId from the auth-token localStorage blob — getStoredUserIdSync
  // works for any signed-in user, including teachers with no managed
  // students yet and student-role accounts.  If no token, bail.
  const userId = getStoredUserIdSync();
  if (!userId) {
    // eslint-disable-next-line no-console
    console.warn(
      '[dictStore.recoverInMemoryEntries] no userId in localStorage auth token — sign in first',
    );
    return { enqueued: 0, skipped: 0 };
  }
  const ctx: PersistContext = {
    userId,
    managedStudentId: state.currentManagedStudentId,
    activeManualSessionId: state.activeManualSessionId,
  };
  const entries = Object.values(state.entries);
  let enqueued = 0;
  let skipped = 0;
  const additions: Record<string, PendingPersist> = {};
  for (const e of entries) {
    if (state.pendingPersists[e.id]) {
      skipped++;
      continue;
    }
    additions[e.id] = {
      entry: e,
      ctx,
      enqueuedAt: Date.now(),
      attempts: 0,
      lastError: 'recoverInMemoryEntries (manual rescue)',
    };
    enqueued++;
  }
  useDictStore.setState((s) => ({
    pendingPersists: { ...s.pendingPersists, ...additions },
  }));
  void state.flushPendingPersists();
  // eslint-disable-next-line no-console
  console.log(
    `[dictStore.recoverInMemoryEntries] enqueued ${enqueued} entries (skipped ${skipped} already pending); flushing now`,
  );
  return { enqueued, skipped };
}

// Also expose on window for in-tab manual rescue.
if (typeof window !== 'undefined') {
  (
    window as unknown as { __recoverInMemoryEntries: typeof recoverInMemoryEntries }
  ).__recoverInMemoryEntries = recoverInMemoryEntries;
}

export type { ExportOptions };
