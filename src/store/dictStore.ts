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

const DEFAULT_LANGUAGE = 'English';
const DEFAULT_UI_LANG: UILang = 'en';

/**
 * localStorage key used by the pre-cloud version of this app.  Step 4's
 * importLegacy() reads from it; once the import succeeds the key is
 * renamed to `${LEGACY_KEY}-imported` so we never re-prompt.
 */
export const LEGACY_KEY = 'note-dict-v1';
export const LEGACY_SKIP_KEY = 'note-dict-import-skipped';

interface Prefs {
  language: string;
  uiLanguage: UILang;
  showPinyin: boolean;
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
): Promise<void> {
  const todayKey = dateKey(Date.now());
  let updatedSessions = getState().sessions.slice();

  let autoSession = updatedSessions.find(
    (s) => s.kind === 'auto' && s.name === todayKey,
  );
  if (!autoSession) {
    const { data: sessRow, error: sessErr } = await withSupabaseTimeout(
      (signal) =>
        supabase
          .from('class_sessions')
          .insert({
            owner_user_id: ctx.userId,
            managed_student_id: ctx.managedStudentId,
            name: todayKey,
            kind: 'auto',
          })
          .abortSignal(signal)
          .select()
          .single(),
      SUPABASE_WRITE_TIMEOUT_MS,
      'persist/class_sessions.insert',
    );
    if (sessErr) throw sessErr;
    autoSession = sessionFromRow(sessRow as SessionRow, []);
    updatedSessions = [autoSession, ...updatedSessions];
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
    const { error: linkErr } = await withSupabaseTimeout(
      (signal) =>
        supabase.from('session_entries').insert(links).abortSignal(signal),
      SUPABASE_WRITE_TIMEOUT_MS,
      'persist/session_entries.insert',
    );
    if (linkErr) throw linkErr;

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
 * Persist a brand-new entry (cache miss) to the cloud: INSERT into
 * `entries` (using the client-generated UUID we already showed the
 * user), then attach to today's sessions.  Background task — caller
 * doesn't await it.
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
  // 1. INSERT the entry.  We provide our own UUID — Postgres''s
  //    `default gen_random_uuid()` only kicks in when no value is
  //    sent.  This lets us show the entry in the UI before the
  //    insert completes (the id is already known).
  const { error: entryErr } = await withSupabaseTimeout(
    (signal) =>
      supabase
        .from('entries')
        .insert({
          id: entry.id,
          owner_user_id: ctx.userId,
          managed_student_id: ctx.managedStudentId,
          word: entry.word,
          direction: entry.direction ?? 'zh-to-other',
          language: entry.language,
          word_syllables: entry.wordSyllables,
          meanings: entry.meanings,
        })
        .abortSignal(signal),
    SUPABASE_WRITE_TIMEOUT_MS,
    'persist/entries.insert',
  );
  if (entryErr) throw entryErr;
  // eslint-disable-next-line no-console
  console.log(
    `[dictStore] persisted entry ${entry.id} word="${entry.word}" managed_student_id=${ctx.managedStudentId ?? 'null(self)'}`,
  );

  // 2. Attach to today's auto session + active manual class (if any).
  await attachEntryToTodaysSessions(entry.id, ctx, getState, setStore);
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
  attachEntryToTodaysSessions(cached.id, ctx, getState, setStore).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn(
      `[dictStore] background re-link failed for cached entry ${cached.id} (word="${cached.word}") — entry shown but today's session group may not include it until refresh:`,
      err,
    );
  });
}

/**
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
async function withSupabaseTimeout<T>(
  build: (signal: AbortSignal) => PromiseLike<T>,
  ms: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    // eslint-disable-next-line no-console
    console.warn(`[dictStore] ${label} aborting after ${ms}ms — Supabase write may be wedged after idle`);
    controller.abort();
  }, ms);
  try {
    return await build(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

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

  query: (word: string, direction?: TranslationDirection) => Promise<void>;
  clearLatest: () => void;
  deleteEntry: (entryId: string) => Promise<void>;

  startManualClass: (name: string) => Promise<void>;
  endManualClass: () => Promise<void>;
  renameSession: (sessionId: string, name: string) => Promise<void>;
  deleteSession: (sessionId: string, deleteEntries: boolean) => Promise<void>;

  setLanguage: (language: string) => void;
  setUILanguage: (lang: UILang) => void;
  setShowPinyin: (v: boolean) => void;

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
      },
      currentManagedStudentId: null,
      managedStudents: [],
      hydrated: false,
      anonCache: {},
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
        const { data, error } = await supabase
          .from('managed_students')
          .insert({ teacher_id: userId, name })
          .select()
          .single();
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] addManagedStudent failed', error);
          set({ error: error.message });
          return null;
        }
        const row = data as ManagedStudentRow;
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
        const { error } = await supabase
          .from('managed_students')
          .update({ name })
          .eq('id', id);
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] renameManagedStudent failed', error);
          set({ error: error.message });
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
        const { error } = await supabase
          .from('managed_students')
          .delete()
          .eq('id', id);
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] deleteManagedStudent failed', error);
          set({ error: error.message });
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

      query: async (rawWord, direction = 'zh-to-other') => {
        const word = rawWord.trim();
        if (!word) return;
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
           * ────────────────────────────────────────────────────── */
          const cache = userId ? entries : anonCache;
          const cacheTargetLang =
            direction === 'zh-to-other' ? prefs.language : '';
          const cached = findCachedEntry(cache, word, cacheTargetLang, direction);

          if (cached && !userId) {
            // Anon cache hit — surface the cached entry, no AI call.
            set({
              entries: { [cached.id]: cached },
              latestEntryId: cached.id,
              latestFromCache: true,
              loading: false,
              error: null,
            });
            return;
          }

          if (cached && userId) {
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
              cached,
              userId,
              getState: get,
              setStore: set,
            });
            return;
          }

          /* ─── L1 miss — call /api/translate (which itself checks
                 the global L2 cache before hitting the AI) ─────────── */
          const data = await translateWord(word, prefs.language, direction);

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
            const id =
              (typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : `anon-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

          // 2. PERSIST IN BACKGROUND.  Fire-and-forget — `.catch()`
          //    swallows wedge/timeout errors and just logs them.
          //    The user already has their result; the cost of a
          //    failure here is "missing from History this one
          //    time", not "app appears frozen".
          persistNewEntryToCloud(newEntry, ctx, get, set).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(
              `[dictStore] background persist failed for entry ${newEntryId} (word="${newEntry.word}") — result is shown but not saved to cloud (refresh + re-query to retry):`,
              err,
            );
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
        const { error } = await supabase.from('entries').delete().eq('id', entryId);
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] deleteEntry failed', error);
          // Restore the entry locally so UI doesn't lie.
          set({
            entries: { ...restEntries, [entryId]: exists },
            sessions: state.sessions,
            anonCache: state.anonCache,
            error: error.message,
          });
        }
      },

      startManualClass: async (name) => {
        const userId = await getCurrentUserId();
        if (!userId) return;
        const { currentManagedStudentId } = get();
        const trimmed = name.trim() || `课程 ${dateKey(Date.now())}`;
        const { data: sessRow, error } = await supabase
          .from('class_sessions')
          .insert({
            owner_user_id: userId,
            managed_student_id: currentManagedStudentId,
            name: trimmed,
            kind: 'manual',
          })
          .select()
          .single();
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] startManualClass failed', error);
          set({ error: error.message });
          return;
        }
        const session = sessionFromRow(sessRow as SessionRow, []);
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
        const { error } = await supabase
          .from('class_sessions')
          .update({ ended_at: endedAtISO })
          .eq('id', id);
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] endManualClass failed', error);
          set({ error: error.message });
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
        const { error } = await supabase
          .from('class_sessions')
          .update({ name: trimmed })
          .eq('id', sessionId);
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] renameSession failed', error);
          set({ error: error.message });
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
            const { error: delErr } = await supabase
              .from('entries')
              .delete()
              .in('id', orphaned);
            if (delErr) {
              // eslint-disable-next-line no-console
              console.error('[dictStore] deleteSession (entries) failed', delErr);
              set({ error: delErr.message });
              return;
            }
            newEntries = { ...state.entries };
            orphaned.forEach((id) => delete newEntries[id]);
          }
        }

        // session_entries cascades on the FK.
        const { error } = await supabase
          .from('class_sessions')
          .delete()
          .eq('id', sessionId);
        if (error) {
          // eslint-disable-next-line no-console
          console.error('[dictStore] deleteSession failed', error);
          set({ error: error.message });
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
      }),
      merge: (persistedState, currentState) => {
        const p = persistedState as Partial<DictState> | undefined;
        return {
          ...currentState,
          prefs: { ...currentState.prefs, ...(p?.prefs ?? {}) },
          currentManagedStudentId: p?.currentManagedStudentId ?? null,
          anonCache: p?.anonCache ?? {},
        };
      },
    },
  ),
);

export type { ExportOptions };
