import { useState } from 'react';
import { TopBar } from './components/Header/TopBar';
import { SearchView } from './components/Search/SearchView';
import { HistoryView } from './components/History/HistoryView';
import { AuthGate } from './components/Auth/AuthGate';

type View = 'search' | 'history';

export default function App() {
  const [view, setView] = useState<View>('search');

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
