import { useState } from 'react';
import { TopBar } from './components/Header/TopBar';
import { SearchView } from './components/Search/SearchView';
import { HistoryView } from './components/History/HistoryView';

type View = 'search' | 'history';

export default function App() {
  const [view, setView] = useState<View>('search');

  return (
    <div className="min-h-screen">
      <TopBar view={view} onChangeView={setView} />
      <main>
        {view === 'search' ? <SearchView /> : <HistoryView />}
      </main>
    </div>
  );
}
