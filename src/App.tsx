import { useEffect, useState } from 'react';
import { TopBar } from './components/Header/TopBar';
import { SearchView } from './components/Search/SearchView';
import { HistoryView } from './components/History/HistoryView';
import { AuthGate } from './components/Auth/AuthGate';
import { useAuth } from './auth/AuthContext';
import { useDictStore } from './store/dictStore';

type View = 'search' | 'history';

export default function App() {
  const [view, setView] = useState<View>('search');
  const { status, session } = useAuth();
  const hydrate = useDictStore((s) => s.hydrate);
  const reset = useDictStore((s) => s.reset);

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

  return (
    <AuthGate>
      <div className="min-h-screen">
        <TopBar view={view} onChangeView={setView} />
        <main>
          {view === 'search' ? <SearchView /> : <HistoryView />}
        </main>
      </div>
    </AuthGate>
  );
}
