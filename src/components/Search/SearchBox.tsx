import { useState } from 'react';
import { useDictStore } from '../../store/dictStore';
import { Button } from '../UI/Button';

export function SearchBox() {
  const query = useDictStore((s) => s.query);
  const loading = useDictStore((s) => s.loading);
  const language = useDictStore((s) => s.prefs.language);
  const [word, setWord] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = word.trim();
    if (!trimmed || loading) return;
    query(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex items-stretch gap-2">
        <input
          type="text"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="输入中文词，如：长、打、一带一路"
          disabled={loading}
          className="flex-1 text-lg px-4 py-3 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-stone-50"
          autoFocus
        />
        <Button type="submit" size="lg" disabled={loading || !word.trim()}>
          {loading ? '查询中…' : '查询'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-stone-500">
        目标语言：<span className="font-medium text-stone-700">{language}</span>
        （可在右上角切换）· 回车查询 · 查询记录自动保存
      </p>
    </form>
  );
}
