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
import { supabase } from '../auth/supabaseClient';
import type { ManagedStudent } from '../auth/types';

const DEFAULT_LANGUAGE = 'English';
const DEFAULT_UI_LANG: UILang = 'zh';

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

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
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

  /** Transient. */
  latestEntryId: string | null;
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
      latestEntryId: null,
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
        set({
          entries: {},
          sessions: [],
          activeManualSessionId: null,
          managedStudents: [],
          latestEntryId: null,
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

      /* ─────────── query / mutate ─────────── */

      query: async (rawWord, direction = 'zh-to-other') => {
        const word = rawWord.trim();
        if (!word) return;
        const userId = await getCurrentUserId();
        if (!userId) {
          set({ error: 'Not signed in' });
          return;
        }
        set({ loading: true, error: null });
        try {
          const { prefs, currentManagedStudentId, sessions, entries, activeManualSessionId } =
            get();
          const data = await translateWord(word, prefs.language, direction);

          const language =
            direction === 'zh-to-other'
              ? prefs.language
              : data.language?.trim() || 'auto';

          // 1. Insert the entry.  DB fills id + queried_at.
          const { data: entryRow, error: entryErr } = await supabase
            .from('entries')
            .insert({
              owner_user_id: userId,
              managed_student_id: currentManagedStudentId,
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

          // 2. Find or create today's auto session.
          const todayKey = dateKey(newEntry.queriedAt);
          let autoSession = sessions.find(
            (s) => s.kind === 'auto' && s.name === todayKey,
          );
          let updatedSessions = sessions.slice();
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

          // 3. Link entry to auto session (and to manual if active).
          const linksToInsert: SessionEntryRow[] = [
            { session_id: autoSession.id, entry_id: newEntry.id },
          ];
          if (
            activeManualSessionId &&
            activeManualSessionId !== autoSession.id &&
            updatedSessions.some((s) => s.id === activeManualSessionId)
          ) {
            linksToInsert.push({
              session_id: activeManualSessionId,
              entry_id: newEntry.id,
            });
          }
          const { error: linkErr } = await supabase
            .from('session_entries')
            .insert(linksToInsert);
          if (linkErr) throw linkErr;

          // 4. Mirror locally.
          const linkedSessionIds = new Set(linksToInsert.map((l) => l.session_id));
          updatedSessions = updatedSessions.map((s) =>
            linkedSessionIds.has(s.id)
              ? { ...s, entryIds: [...s.entryIds, newEntry.id] }
              : s,
          );

          set({
            entries: { ...entries, [newEntry.id]: newEntry },
            sessions: updatedSessions,
            latestEntryId: newEntry.id,
            loading: false,
            error: null,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // eslint-disable-next-line no-console
          console.error('[dictStore] query failed', err);
          set({ loading: false, error: msg });
        }
      },

      clearLatest: () => set({ latestEntryId: null, error: null }),

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
        set({
          entries: restEntries,
          sessions: newSessions,
          latestEntryId:
            state.latestEntryId === entryId ? null : state.latestEntryId,
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
      }),
      merge: (persistedState, currentState) => {
        const p = persistedState as Partial<DictState> | undefined;
        return {
          ...currentState,
          prefs: { ...currentState.prefs, ...(p?.prefs ?? {}) },
          currentManagedStudentId: p?.currentManagedStudentId ?? null,
        };
      },
    },
  ),
);

export type { ExportOptions };
