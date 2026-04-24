import { useState } from 'react';
import { useDictStore } from '../../store/dictStore';
import { Button } from '../UI/Button';

export function SessionBar() {
  const activeId = useDictStore((s) => s.activeManualSessionId);
  const sessions = useDictStore((s) => s.sessions);
  const startManualClass = useDictStore((s) => s.startManualClass);
  const endManualClass = useDictStore((s) => s.endManualClass);

  const active = activeId ? sessions.find((s) => s.id === activeId) : null;
  const [prompting, setPrompting] = useState(false);
  const [draftName, setDraftName] = useState('');

  if (active) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-stone-500">当前课程</span>
        <span className="rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-sm font-medium">
          {active.name}
          <span className="ml-2 text-xs text-amber-700">
            · {active.entryIds.length} 词
          </span>
        </span>
        <Button variant="secondary" size="sm" onClick={endManualClass}>
          结束课程
        </Button>
      </div>
    );
  }

  if (prompting) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draftName.trim()) {
            startManualClass(draftName);
            setDraftName('');
            setPrompting(false);
          }
        }}
        className="flex items-center gap-2"
      >
        <input
          autoFocus
          className="text-sm border border-stone-300 rounded px-2 py-1 w-40"
          placeholder="课程名，如: 商务汉语 3"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
        />
        <Button type="submit" size="sm">
          开始
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setPrompting(false);
            setDraftName('');
          }}
        >
          取消
        </Button>
      </form>
    );
  }

  return (
    <Button variant="secondary" size="sm" onClick={() => setPrompting(true)}>
      + 开始新课程
    </Button>
  );
}
