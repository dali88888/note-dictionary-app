import { useState } from 'react';
import { useDictStore } from '../../store/dictStore';
import { useT } from '../../i18n/useT';
import { Button } from '../UI/Button';

export function SessionBar() {
  const activeId = useDictStore((s) => s.activeManualSessionId);
  const sessions = useDictStore((s) => s.sessions);
  const startManualClass = useDictStore((s) => s.startManualClass);
  const endManualClass = useDictStore((s) => s.endManualClass);
  const { t } = useT();

  const active = activeId ? sessions.find((s) => s.id === activeId) : null;
  const [prompting, setPrompting] = useState(false);
  const [draftName, setDraftName] = useState('');

  if (active) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-stone-500">{t('currentClass')}</span>
        <span className="rounded-full bg-amber-100 text-amber-800 px-3 py-1 text-sm font-medium">
          {active.name}
          <span className="ml-2 text-xs text-amber-700">
            {t('wordsUnit', { n: active.entryIds.length })}
          </span>
        </span>
        <Button variant="secondary" size="sm" onClick={endManualClass}>
          {t('endClass')}
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
          placeholder={t('classNamePlaceholder')}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
        />
        <Button type="submit" size="sm">
          {t('start')}
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
          {t('cancel')}
        </Button>
      </form>
    );
  }

  return (
    <Button variant="secondary" size="sm" onClick={() => setPrompting(true)}>
      {t('startNewClass')}
    </Button>
  );
}
