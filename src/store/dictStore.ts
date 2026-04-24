import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  ClassSession,
  DictionaryEntry,
  ExportOptions,
} from '../types/dictionary';
import { translateWord } from '../api/translateClient';

const DEFAULT_LANGUAGE = 'English';

interface Prefs {
  language: string;
  showPinyin: boolean;
}

interface DictState {
  entries: Record<string, DictionaryEntry>;
  sessions: ClassSession[];
  activeManualSessionId: string | null;
  prefs: Prefs;

  /** latest result shown in search view (not persisted across reloads) */
  latestEntryId: string | null;
  /** transient loading/error state */
  loading: boolean;
  error: string | null;

  query: (word: string) => Promise<void>;
  clearLatest: () => void;
  deleteEntry: (entryId: string) => void;

  startManualClass: (name: string) => void;
  endManualClass: () => void;
  renameSession: (sessionId: string, name: string) => void;
  deleteSession: (sessionId: string, deleteEntries: boolean) => void;

  setLanguage: (language: string) => void;
  setShowPinyin: (v: boolean) => void;

  /** called by export module to collect entries for a set of sessions */
  collectEntries: (sessionIds: string[]) => DictionaryEntry[];
}

function uid(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  );
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function findOrCreateAutoSession(
  sessions: ClassSession[],
  ts: number,
): { sessions: ClassSession[]; session: ClassSession } {
  const key = dateKey(ts);
  const existing = sessions.find((s) => s.kind === 'auto' && s.name === key);
  if (existing) return { sessions, session: existing };
  const created: ClassSession = {
    id: uid(),
    name: key,
    kind: 'auto',
    createdAt: ts,
    entryIds: [],
  };
  return { sessions: [created, ...sessions], session: created };
}

export const useDictStore = create<DictState>()(
  persist(
    (set, get) => ({
      entries: {},
      sessions: [],
      activeManualSessionId: null,
      prefs: { language: DEFAULT_LANGUAGE, showPinyin: true },

      latestEntryId: null,
      loading: false,
      error: null,

      query: async (rawWord: string) => {
        const word = rawWord.trim();
        if (!word) return;
        set({ loading: true, error: null });
        try {
          const { prefs } = get();
          const data = await translateWord(word, prefs.language);
          const ts = Date.now();
          const entry: DictionaryEntry = {
            ...data,
            // Gemini sometimes mis-fills the language echo field; force it
            // to whatever the user actually requested so the UI stays consistent.
            language: prefs.language,
            id: uid(),
            queriedAt: ts,
          };

          const state = get();
          const newEntries = { ...state.entries, [entry.id]: entry };

          // auto session for today
          const autoPass = findOrCreateAutoSession(state.sessions, ts);
          let newSessions = autoPass.sessions.map((s) =>
            s.id === autoPass.session.id
              ? { ...s, entryIds: [...s.entryIds, entry.id] }
              : s,
          );

          // manual session if active
          if (state.activeManualSessionId) {
            newSessions = newSessions.map((s) =>
              s.id === state.activeManualSessionId
                ? { ...s, entryIds: [...s.entryIds, entry.id] }
                : s,
            );
          }

          set({
            entries: newEntries,
            sessions: newSessions,
            latestEntryId: entry.id,
            loading: false,
            error: null,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          set({ loading: false, error: msg });
        }
      },

      clearLatest: () => set({ latestEntryId: null, error: null }),

      deleteEntry: (entryId: string) => {
        const state = get();
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
      },

      startManualClass: (name: string) => {
        const ts = Date.now();
        const session: ClassSession = {
          id: uid(),
          name: name.trim() || `课程 ${dateKey(ts)}`,
          kind: 'manual',
          createdAt: ts,
          entryIds: [],
        };
        set((s) => ({
          sessions: [session, ...s.sessions],
          activeManualSessionId: session.id,
        }));
      },

      endManualClass: () => {
        const state = get();
        if (!state.activeManualSessionId) return;
        const endedAt = Date.now();
        const newSessions = state.sessions.map((s) =>
          s.id === state.activeManualSessionId ? { ...s, endedAt } : s,
        );
        set({ sessions: newSessions, activeManualSessionId: null });
      },

      renameSession: (sessionId: string, name: string) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId ? { ...sess, name: name.trim() || sess.name } : sess,
          ),
        }));
      },

      deleteSession: (sessionId: string, deleteEntries: boolean) => {
        const state = get();
        const target = state.sessions.find((s) => s.id === sessionId);
        if (!target) return;

        let newEntries = state.entries;
        if (deleteEntries) {
          // only delete entries that don't belong to any OTHER session
          const otherSessions = state.sessions.filter((s) => s.id !== sessionId);
          const stillReferenced = new Set<string>();
          otherSessions.forEach((s) =>
            s.entryIds.forEach((id) => stillReferenced.add(id)),
          );
          const toDelete = target.entryIds.filter((id) => !stillReferenced.has(id));
          newEntries = { ...state.entries };
          toDelete.forEach((id) => {
            delete newEntries[id];
          });
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

      setLanguage: (language: string) => {
        set((s) => ({ prefs: { ...s.prefs, language } }));
      },
      setShowPinyin: (v: boolean) => {
        set((s) => ({ prefs: { ...s.prefs, showPinyin: v } }));
      },

      collectEntries: (sessionIds: string[]) => {
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
      name: 'note-dict-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        entries: s.entries,
        sessions: s.sessions,
        activeManualSessionId: s.activeManualSessionId,
        prefs: s.prefs,
      }),
    },
  ),
);

export type { ExportOptions };
