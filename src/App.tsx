import { useEffect, useMemo, useState } from 'react';
import { TopBar } from './components/Header/TopBar';
import { SearchView } from './components/Search/SearchView';
import { HistoryView } from './components/History/HistoryView';
import { AuthGate } from './components/Auth/AuthGate';
import { AuthModal } from './components/Auth/AuthModal';
import { LegacyImportDialog } from './components/Auth/LegacyImportDialog';
import { PendingPersistsBanner } from './components/Common/PendingPersistsBanner';
import { useAuth } from './auth/AuthContext';
import {
  useDictStore,
  readLegacyStats,
  legacyImportSkipped,
} from './store/dictStore';
import { RTL_LANGS } from './i18n';

type View = 'search' | 'history';

export default function App() {
  const [view, setView] = useState<View>('search');
  const { status, session } = useAuth();
  const hydrate = useDictStore((s) => s.hydrate);
  const reset = useDictStore((s) => s.reset);
  const hydrated = useDictStore((s) => s.hydrated);
  const cloudEntryCount = useDictStore((s) => Object.keys(s.entries).length);
  const cloudSessionCount = useDictStore((s) => s.sessions.length);
  const uiLanguage = useDictStore((s) => s.prefs.uiLanguage);

  // Mirror the current UI language onto the <html> element:
  //   • `lang` so screen readers & search engines pick the right
  //     pronunciation / language model
  //   • `dir` so Arabic flips to RTL automatically.  Tailwind's
  //     `rtl:` variants and many CSS logical properties (margin-inline-*,
  //     text-end, etc.) do the right thing once `dir="rtl"` is set,
  //     so the bulk of the layout adapts without per-component edits.
  useEffect(() => {
    const html = document.documentElement;
    html.lang = uiLanguage;
    html.dir = (RTL_LANGS as ReadonlyArray<string>).includes(uiLanguage) ? 'rtl' : 'ltr';
  }, [uiLanguage]);

  // Bridge AuthContext → dictStore.  Whenever auth flips:
  //   • authed → load entries + sessions for this user (+ current ctx) from Supabase
  //   • anon  → wipe the in-memory cache so a different user can't see prior data
  // Re-keying on session.user.id covers the (rare) account-switch-without-reload case.
  useEffect(() => {
    if (status === 'authed' && session) {
      void hydrate();
    } else if (status === 'anon') {
      reset();
    }
  }, [status, session?.user.id, hydrate, reset]);

  /*
   * Decide whether to surface the legacy-import prompt.  All of these must
   * be true:
   *   • user is authed AND we've finished the initial cloud fetch
   *   • cloud is empty (don't pollute existing data; merging is messy)
   *   • localStorage still holds the pre-cloud `note-dict-v1` blob with
   *     non-zero entries/sessions
   *   • user hasn't already chosen "Skip" on this device
   *
   * `legacyDecision` is computed once per relevant state change and held
   * in a state slot so the dialog stays on screen across renders even if
   * its inputs would later flip (e.g. the import itself empties the
   * legacy blob).
   */
  const legacyStats = useMemo(() => {
    if (status !== 'authed' || !hydrated) return null;
    if (cloudEntryCount > 0 || cloudSessionCount > 0) return null;
    if (legacyImportSkipped()) return null;
    return readLegacyStats();
  }, [status, hydrated, cloudEntryCount, cloudSessionCount, session?.user.id]);

  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    if (legacyStats) setImportOpen(true);
  }, [legacyStats]);

  return (
    <AuthGate>
      <div className="min-h-screen">
        <TopBar view={view} onChangeView={setView} />
        {/* Sits between TopBar and main content so it's visible no
            matter which view (Lookup / History) the user is on, and
            so they see it the moment they return to the tab. */}
        <PendingPersistsBanner />
        <main>
          {view === 'search' ? <SearchView /> : <HistoryView />}
        </main>
      </div>

      {/* Login/signup overlay — opened from TopBar buttons or any
          sign-in CTA elsewhere via useAuth().openAuthModal(). */}
      <AuthModal />

      {importOpen && legacyStats && (
        <LegacyImportDialog
          stats={legacyStats}
          onClose={() => setImportOpen(false)}
        />
      )}
    </AuthGate>
  );
}
