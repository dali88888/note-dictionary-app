import { useDictStore } from '../../store/dictStore';
import { SearchBox } from './SearchBox';
import { ResultCard } from './ResultCard';

export function SearchView() {
  const loading = useDictStore((s) => s.loading);
  const error = useDictStore((s) => s.error);
  const latestEntryId = useDictStore((s) => s.latestEntryId);
  const entry = useDictStore((s) =>
    s.latestEntryId ? s.entries[s.latestEntryId] : null,
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <SearchBox />

      {loading && (
        <div className="bg-white rounded-xl border border-stone-200 p-6 space-y-3">
          <div className="skeleton h-8 w-32" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-5/6" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
          查询失败：{error}
        </div>
      )}

      {!loading && !error && entry && (
        <ResultCard key={latestEntryId ?? 'none'} entry={entry} />
      )}

      {!loading && !error && !entry && (
        <div className="text-center text-stone-400 text-sm pt-10">
          在上方输入中文词开始查询。所有查询会自动按日期归档，课后可导出为 PPT。
        </div>
      )}
    </div>
  );
}
