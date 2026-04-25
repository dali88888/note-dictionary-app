import { useMemo, useState } from 'react';
import { useDictStore } from '../../store/dictStore';
import type { ClassSession, DictionaryEntry, ExportOptions } from '../../types/dictionary';
import { useT } from '../../i18n/useT';
import type { StringKey } from '../../i18n';
import { Button } from '../UI/Button';
import { Toggle } from '../UI/Toggle';
import { ChineseLine } from '../Common/ChineseLine';
import { exportToPptx } from '../../export/exportPptx';

type Tab = 'all' | 'date' | 'class';

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function HistoryView() {
  const entries = useDictStore((s) => s.entries);
  const sessions = useDictStore((s) => s.sessions);
  const showPinyin = useDictStore((s) => s.prefs.showPinyin);
  const uiLanguage = useDictStore((s) => s.prefs.uiLanguage);
  const deleteEntry = useDictStore((s) => s.deleteEntry);
  const deleteSession = useDictStore((s) => s.deleteSession);
  const collectEntries = useDictStore((s) => s.collectEntries);
  const { t } = useT();

  const [tab, setTab] = useState<Tab>('all');
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportOpts, setExportOpts] = useState<ExportOptions>({
    includePinyin: true,
    includeExampleTranslation: true,
    wordsPerSlide: 1,
    title: '',
  });

  const allEntries = useMemo(
    () => Object.values(entries).sort((a, b) => b.queriedAt - a.queriedAt),
    [entries],
  );

  const autoSessions = useMemo(
    () => sessions.filter((s) => s.kind === 'auto').sort((a, b) => b.createdAt - a.createdAt),
    [sessions],
  );
  const manualSessions = useMemo(
    () => sessions.filter((s) => s.kind === 'manual').sort((a, b) => b.createdAt - a.createdAt),
    [sessions],
  );

  const toggleSession = (id: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedEntries = useMemo(
    () => collectEntries([...selectedSessionIds]),
    [selectedSessionIds, collectEntries, entries, sessions],
  );

  const handleExport = async () => {
    if (!selectedEntries.length) return;
    setExporting(true);
    setExportError(null);
    try {
      const picked = sessions.filter((s) => selectedSessionIds.has(s.id));
      await exportToPptx(picked, selectedEntries, exportOpts, uiLanguage);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  };

  const tabLabelKey: Record<Tab, StringKey> = {
    all: 'tabAll',
    date: 'tabByDate',
    class: 'tabByClass',
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 border-b border-stone-200 mb-4">
        {(['all', 'date', 'class'] as Tab[]).map((tk) => (
          <button
            key={tk}
            onClick={() => setTab(tk)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === tk
                ? 'border-amber-600 text-amber-700'
                : 'border-transparent text-stone-500 hover:text-stone-700'
            }`}
          >
            {t(tabLabelKey[tk])}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] gap-6">
        <div>
          {tab === 'all' && (
            <AllEntriesList entries={allEntries} onDelete={deleteEntry} showPinyin={showPinyin} />
          )}
          {tab === 'date' && (
            <SessionGroupList
              sessions={autoSessions}
              entriesMap={entries}
              selected={selectedSessionIds}
              onToggle={toggleSession}
              onDelete={(id) => deleteSession(id, false)}
              emptyText={t('emptyByDate')}
            />
          )}
          {tab === 'class' && (
            <SessionGroupList
              sessions={manualSessions}
              entriesMap={entries}
              selected={selectedSessionIds}
              onToggle={toggleSession}
              onDelete={(id) => deleteSession(id, false)}
              emptyText={t('emptyByClass')}
            />
          )}
        </div>

        <aside className="bg-white border border-stone-200 rounded-xl p-4 h-fit md:sticky md:top-20">
          <h3 className="text-sm font-semibold text-stone-700 mb-2">
            {t('exportPptTitle')}
          </h3>
          <p className="text-xs text-stone-500 mb-3">{t('exportHint')}</p>

          <div className="text-sm mb-3">
            <div className="text-stone-600">
              {t('selectedSessions', { n: selectedSessionIds.size })}
            </div>
            <div className="text-stone-900 font-medium">
              {t('dedupedEntries', { n: selectedEntries.length })}
            </div>
          </div>

          <div className="space-y-2 mb-3 border-t border-stone-100 pt-3">
            <Toggle
              label={t('includePinyin')}
              checked={exportOpts.includePinyin}
              onChange={(v) => setExportOpts({ ...exportOpts, includePinyin: v })}
            />
            <Toggle
              label={t('includeExampleTranslation')}
              checked={exportOpts.includeExampleTranslation}
              onChange={(v) =>
                setExportOpts({ ...exportOpts, includeExampleTranslation: v })
              }
            />
            <label className="block text-xs text-stone-500 mt-2">
              {t('pptTitleLabel')}
              <input
                type="text"
                value={exportOpts.title ?? ''}
                onChange={(e) => setExportOpts({ ...exportOpts, title: e.target.value })}
                placeholder={t('pptTitlePlaceholder')}
                className="mt-1 w-full border border-stone-300 rounded px-2 py-1 text-sm text-stone-800"
              />
            </label>
          </div>

          <Button
            onClick={handleExport}
            disabled={!selectedEntries.length || exporting}
            size="md"
            className="w-full"
          >
            {exporting ? t('exporting') : t('exportBtn')}
          </Button>

          {exportError && (
            <p className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
              {t('exportFailed', { msg: exportError })}
            </p>
          )}

          {selectedSessionIds.size > 0 && (
            <button
              onClick={() => setSelectedSessionIds(new Set())}
              className="mt-3 text-xs text-stone-500 hover:text-stone-700 underline"
            >
              {t('clearSelection')}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function AllEntriesList({
  entries,
  onDelete,
  showPinyin,
}: {
  entries: DictionaryEntry[];
  onDelete: (id: string) => void;
  showPinyin: boolean;
}) {
  const { t } = useT();
  if (!entries.length) {
    return (
      <p className="text-sm text-stone-400 italic pt-4">{t('emptyAll')}</p>
    );
  }
  return (
    <ul className="divide-y divide-stone-200 bg-white rounded-xl border border-stone-200">
      {entries.map((entry) => {
        const isReverse = entry.direction === 'other-to-zh';
        const firstCandidate = isReverse ? entry.meanings[0]?.hanziSyllables : null;
        return (
          <li key={entry.id} className="p-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                    isReverse
                      ? 'bg-violet-50 text-violet-700 border-violet-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {t(isReverse ? 'dirBadgeOtherToZh' : 'dirBadgeZhToOther')}
                </span>
                {isReverse ? (
                  <span className="text-base text-stone-900 font-semibold break-words">
                    {entry.word}
                  </span>
                ) : (
                  <ChineseLine
                    syllables={entry.wordSyllables}
                    showPinyin={showPinyin}
                    size="md"
                  />
                )}
              </div>
              {isReverse && firstCandidate && firstCandidate.length > 0 && (
                <div className="mt-1 ml-1">
                  <ChineseLine
                    syllables={firstCandidate}
                    showPinyin={showPinyin}
                    size="md"
                  />
                </div>
              )}
              <div className="text-xs text-stone-500 mt-0.5">
                {t('allEntriesSub', {
                  lang: entry.language,
                  time: formatDateTime(entry.queriedAt),
                  n: entry.meanings.length,
                })}
              </div>
              <p className="text-sm text-stone-700 mt-1 truncate">
                {entry.meanings[0]?.definition}
              </p>
            </div>
            <button
              onClick={() => onDelete(entry.id)}
              className="text-stone-400 hover:text-red-600 text-xs px-2"
            >
              {t('delete')}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SessionGroupList({
  sessions,
  entriesMap,
  selected,
  onToggle,
  onDelete,
  emptyText,
}: {
  sessions: ClassSession[];
  entriesMap: Record<string, DictionaryEntry>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  emptyText: string;
}) {
  const { t } = useT();
  if (!sessions.length) {
    return <p className="text-sm text-stone-400 italic pt-4">{emptyText}</p>;
  }
  return (
    <ul className="space-y-3">
      {sessions.map((sess) => {
        const entries = sess.entryIds
          .map((id) => entriesMap[id])
          .filter((e): e is DictionaryEntry => Boolean(e));
        const isSelected = selected.has(sess.id);
        return (
          <li
            key={sess.id}
            className={`bg-white rounded-xl border p-3 ${
              isSelected ? 'border-amber-400 ring-1 ring-amber-200' : 'border-stone-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggle(sess.id)}
                className="w-4 h-4 accent-amber-600"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-stone-800">{sess.name}</span>
                  <span className="text-xs text-stone-500">
                    {sess.kind === 'auto' ? t('autoArchive') : t('manualClass')}
                  </span>
                  <span className="text-xs text-stone-500">
                    {t('wordsUnit', { n: entries.length })}
                  </span>
                  {sess.endedAt && (
                    <span className="text-xs text-green-700">· {t('ended')}</span>
                  )}
                </div>
                <div className="text-xs text-stone-400 mt-0.5">
                  {t('startedAt', { time: formatDateTime(sess.createdAt) })}
                  {sess.endedAt
                    ? t('endedAt', { time: formatDateTime(sess.endedAt) })
                    : ''}
                </div>
              </div>
              <button
                onClick={() => {
                  if (
                    confirm(t('deleteSessionConfirm', { name: sess.name }))
                  ) {
                    onDelete(sess.id);
                  }
                }}
                className="text-stone-400 hover:text-red-600 text-xs"
              >
                {t('delete')}
              </button>
            </div>
            {entries.length > 0 && (
              <div className="mt-2 pl-7 flex flex-wrap gap-1.5">
                {entries.slice(0, 20).map((e) => {
                  const isReverse = e.direction === 'other-to-zh';
                  // For reverse: show the first Chinese candidate as the chip text (more
                  // useful than the source-language input). Fall back to the original
                  // input if no hanzi candidate present.
                  const chipText = isReverse
                    ? e.meanings[0]?.hanziSyllables
                        ?.map((s) => s.hanzi)
                        .join('') || e.word
                    : e.word;
                  return (
                    <span
                      key={e.id}
                      className={`text-sm px-2 py-0.5 rounded ${
                        isReverse
                          ? 'bg-violet-50 text-violet-700 border border-violet-200'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                      title={isReverse ? e.word : undefined}
                    >
                      {chipText}
                    </span>
                  );
                })}
                {entries.length > 20 && (
                  <span className="text-xs text-stone-400 self-center">
                    {t('moreN', { n: entries.length - 20 })}
                  </span>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
