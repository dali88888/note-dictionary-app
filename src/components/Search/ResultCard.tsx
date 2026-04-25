import type { DictionaryEntry } from '../../types/dictionary';
import { useDictStore } from '../../store/dictStore';
import { useT } from '../../i18n/useT';
import { ChineseLine } from '../Common/ChineseLine';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

interface Props {
  entry: DictionaryEntry;
  onClose?: () => void;
}

export function ResultCard({ entry, onClose }: Props) {
  const showPinyin = useDictStore((s) => s.prefs.showPinyin);
  const deleteEntry = useDictStore((s) => s.deleteEntry);
  const { t } = useT();

  return (
    <div className="fade-in bg-white rounded-xl shadow-sm border border-stone-200 p-6 relative">
      <button
        onClick={() => {
          deleteEntry(entry.id);
          onClose?.();
        }}
        className="absolute top-3 right-3 w-7 h-7 rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600"
        title={t('deleteRecord')}
      >
        ×
      </button>

      <div className="mb-5">
        <ChineseLine syllables={entry.wordSyllables} showPinyin={showPinyin} size="xl" />
        <div className="mt-2 text-sm text-stone-500">
          {t('translatedToLine', { lang: entry.language, n: entry.meanings.length })}
        </div>
      </div>

      <ol className="space-y-5">
        {entry.meanings.map((m, idx) => (
          <li key={idx} className="border-l-4 border-amber-300 pl-4">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-amber-700 font-bold text-lg">
                {CIRCLED[idx] ?? `${idx + 1}.`}
              </span>
              <span className="inline-block text-xs px-2 py-0.5 bg-stone-100 text-stone-600 rounded font-medium uppercase tracking-wide">
                {m.partOfSpeech}
              </span>
              {m.pinyin && (
                <span className="text-sm italic text-amber-700">
                  {t('pronunciation')}
                  {m.pinyin}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-stone-800 text-base leading-relaxed">
              {m.definition}
            </p>

            <div className="mt-2 pl-2 border-l border-stone-200">
              <div className="text-xs text-stone-500 mb-1">{t('example')}</div>
              <ChineseLine
                syllables={m.example.chinese}
                showPinyin={showPinyin}
                size="md"
              />
              <p className="mt-1 text-sm italic text-stone-600">
                {m.example.translation}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
