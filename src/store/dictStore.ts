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
const DEFAULT_UI_LANG: UILang = 'zh';

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

/**
 * Cloud cache hit: the user re-queried a word that already lives in
 * their library.  No AI call, no new entries row — but we still want
 * the lookup to count as part of today's session group and the active
 * manual class (so the user can export this query along with everything
 * else they did during that class).
 *
 * Idempotent: if the entry is already linked to a session we don't
 * insert a duplicate row.
 */
async function applyCloudCacheHit(opts: {
  cached: DictionaryEntry;
  userId: string;
  // The store's getState — used at the BOTTOM of this function to read
  // the freshest sessions / managed-student context, instead of trusting
  // a snapshot captured at the top.  See `mergeSessionsAfterQuery` and
  // the comment in query() for why this matters: a parallel hydrate()
  // can rewrite `sessions` between our read and our write.
  getState: () => DictState;
  setStore: (
    s:
      | Partial<DictState>
      | ((state: DictState) => Partial<DictState>),
  ) => void;
}): Promise<void> {
  const { cached, userId, getState, setStore } = opts;

  // Read CURRENT state so the linking decisions reflect any student
  // switch / class-session change that happened while the L1 lookup
  // was being decided.
  const fresh0 = getState();
  const currentManagedStudentId = fresh0.currentManagedStudentId;
  const activeManualSessionId = fresh0.activeManualSessionId;
  let updatedSessions = fresh0.sessions.slice();

  // Find or create today's auto session (same logic as miss path).
  const todayKey = dateKey(Date.now());
  let autoSession = updatedSessions.find(
    (s) => s.kind === 'auto' && s.name === todayKey,
  );
  if (!autoSession) {
    const { data: sessRow, error: sessErr } = await supabase
      .from('class_sessions')
      .insert({
        owner_user_id: userId,
        managed_student_id: currentManagedStudentId,
        name: todayKey,
        kind: 'auto',
      })
      .select()
      .single();
    if (sessErr) throw sessErr;
    autoSession = sessionFromRow(sessRow as SessionRow, []);
    updatedSessions = [autoSession, ...updatedSessions];
  }

  // Pick the sessions that *would* receive a new link (skip ones
  // that already have this entry — duplicate inserts violate the
  // session_entries primary key).
  const targetSessions: ClassSession[] = [];
  if (!autoSession.entryIds.includes(cached.id)) targetSessions.push(autoSession);
  if (
    activeManualSessionId &&
    activeManualSessionId !== autoSession.id
  ) {
    const manual = updatedSessions.find((s) => s.id === activeManualSessionId);
    if (manual && !manual.entryIds.includes(cached.id)) targetSessions.push(manual);
  }

  if (targetSessions.length > 0) {
    const links: SessionEntryRow[] = targetSessions.map((s) => ({
      session_id: s.id,
      entry_id: cached.id,
    }));
    const { error: linkErr } = await supabase.from('session_entries').insert(links);
    if (linkErr) throw linkErr;
    // Mirror locally.
    const linkedIds = new Set(targetSessions.map((s) => s.id));
    updatedSessions = updatedSessions.map((s) =>
      linkedIds.has(s.id) ? { ...s, entryIds: [...s.entryIds, cached.id] } : s,
    );
  }

  setStore((state) => ({
    sessions: mergeSessionsAfterQuery(state.sessions, updatedSessions),
    latestEntryId: cached.id,
    latestFromCache: true,
    loading: false,
    error: null,
  }));
}

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

async function getCurrentUserId(): Promise<string | null> {
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
            await applyCloudCacheHit({
              cached,
              userId,
              // Pass live store accessors so cache-hit re-linking uses
              // the current student context, not the stale snapshot.
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

          // ── Signed-in path: persist to Supabase ────────────────────
          //
          // Re-read the LATEST currentManagedStudentId / activeManualSessionId
          // here, NOT the snapshot taken at the top of query().  The AI
          // call between the snapshot and this point can take 5–15 s,
          // and during that time the user may have switched student
          // folders or started/ended a manual class.  Using the snapshot
          // would tag the new entry to whichever folder was active when
          // the user clicked search, NOT where they ended up — that's
          // the "我的词条没收录到该学生" bug user reported.
          const fresh = get();
          const targetManagedStudentId = fresh.currentManagedStudentId;
          const targetActiveManualId = fresh.activeManualSessionId;
          const targetSessions = fresh.sessions;

          // 1. Insert the entry.  DB fills id + queried_at.
          const { data: entryRow, error: entryErr } = await supabase
            .from('entries')
            .insert({
              owner_user_id: userId,
              managed_student_id: targetManagedStudentId,
              word: data.word,
              direction,
              language,
              word_syllables: data.wordSyllables,
              meanings: data.meanings,
            })
            .select()
            .single();
          if (entryErr) throw entryErr;
          const newEntry = entryFromRow(entryRow as EntryRow);
          // eslint-disable-next-line no-console
          console.log(
            `[dictStore] inserted entry ${newEntry.id} word="${newEntry.word}" managed_student_id=${targetManagedStudentId ?? 'null(self)'}`,
          );

          // 2. Find or create today's auto session in the LATEST sessions.
          const todayKey = dateKey(newEntry.queriedAt);
          let autoSession = targetSessions.find(
            (s) => s.kind === 'auto' && s.name === todayKey,
          );
          let updatedSessions = targetSessions.slice();
          if (!autoSession) {
            const { data: sessRow, error: sessErr } = await supabase
              .from('class_sessions')
              .insert({
                owner_user_id: userId,
                managed_student_id: targetManagedStudentId,
                name: todayKey,
                kind: 'auto',
              })
              .select()
              .single();
            if (sessErr) throw sessErr;
            autoSession = sessionFromRow(sessRow as SessionRow, []);
            updatedSessions = [autoSession, ...updatedSessions];
          }

          // 3. Link entry to auto session (and to manual if active).
          const linksToInsert: SessionEntryRow[] = [
            { session_id: autoSession.id, entry_id: newEntry.id },
          ];
          if (
            targetActiveManualId &&
            targetActiveManualId !== autoSession.id &&
            updatedSessions.some((s) => s.id === targetActiveManualId)
          ) {
            linksToInsert.push({
              session_id: targetActiveManualId,
              entry_id: newEntry.id,
            });
          }
          const { error: linkErr } = await supabase
            .from('session_entries')
            .insert(linksToInsert);
          if (linkErr) throw linkErr;

          // 4. Mirror locally — use the FRESHEST `entries` map at the
          // moment of write via the functional setter.  Otherwise a
          // background hydrate (e.g. one that was triggered by a student
          // switch during the AI call) could land between our snapshot
          // and this set, and we'd clobber its entries with our stale copy.
          const linkedSessionIds = new Set(linksToInsert.map((l) => l.session_id));
          updatedSessions = updatedSessions.map((s) =>
            linkedSessionIds.has(s.id)
              ? { ...s, entryIds: [...s.entryIds, newEntry.id] }
              : s,
          );

          set((state) => ({
            entries: { ...state.entries, [newEntry.id]: newEntry },
            // Merge our updated sessions back over fresh state — but
            // keep any sessions that arrived via hydrate that we didn't
            // know about.  Build a map for this.
            sessions: mergeSessionsAfterQuery(state.sessions, updatedSessions),
            latestEntryId: newEntry.id,
            latestFromCache: serverCacheHit,
            loading: false,
            error: null,
          }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error('[dictStore] query failed', err);
          set({ loading: false, error: msg });
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
