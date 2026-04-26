import type { DictionaryEntry, Meaning, Register } from '../../types/dictionary';
import { useDictStore } from '../../store/dictStore';
import { useT } from '../../i18n/useT';
import type { StringKey } from '../../i18n';
import { ChineseLine } from '../Common/ChineseLine';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];

const REGISTER_KEY: Record<Register, StringKey> = {
  casual: 'registerCasual',
  colloquial: 'registerColloquial',
  neutral: 'registerNeutral',
  formal: 'registerFormal',
  literary: 'registerLiterary',
};

const REGISTER_COLOR: Record<Register, string> = {
  casual: 'bg-pink-50 text-pink-700 border-pink-200',
  colloquial: 'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-stone-100 text-stone-700 border-stone-200',
  formal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  literary: 'bg-violet-50 text-violet-700 border-violet-200',
};

interface Props {
  entry: DictionaryEntry;
  onClose?: () => void;
}

export function ResultCard({ entry, onClose }: Props) {
  const showPinyin = useDictStore((s) => s.prefs.showPinyin);
  const deleteEntry = useDictStore((s) => s.deleteEntry);
  const { t } = useT();

  const isReverse = entry.direction === 'other-to-zh';
  const sentenceMode = isSentenceMode(entry);

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

      {isReverse ? (
        <ReverseHeader entry={entry} />
      ) : (
        <ForwardHeader entry={entry} showPinyin={showPinyin} />
      )}

      <ol className="space-y-5">
        {entry.meanings.map((m, idx) => (
          <li key={idx} className="border-l-4 border-amber-300 pl-4">
            {isReverse ? (
              <ReverseMeaningBody
                m={m}
                idx={idx}
                showPinyin={showPinyin}
                sentenceMode={sentenceMode}
              />
            ) : (
              <ForwardMeaningBody
                m={m}
                idx={idx}
                showPinyin={showPinyin}
                sentenceMode={sentenceMode}
              />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ─── Forward (zh → other) ──────────────────────────────────── */

/**
 * "Sentence-translation mode": the AI was given a full sentence rather
 * than a word, so it returned exactly one meaning with no example
 * (example.chinese: []).  Used to swap copy + drop the meaning numbering
 * + skip the example block.  See FORWARD_PROMPT in api/translate.ts.
 */
function isSentenceMode(entry: DictionaryEntry): boolean {
  return (
    entry.meanings.length === 1 &&
    (entry.meanings[0]?.example?.chinese?.length ?? 0) === 0
  );
}

function ForwardHeader({
  entry,
  showPinyin,
}: {
  entry: DictionaryEntry;
  showPinyin: boolean;
}) {
  const { t } = useT();
  const sentence = isSentenceMode(entry);
  return (
    <div className="mb-5">
      <ChineseLine syllables={entry.wordSyllables} showPinyin={showPinyin} size="xl" />
      <div className="mt-2 text-sm text-stone-500">
        {sentence
          ? t('sentenceTranslatedTo', { lang: entry.language })
          : t('translatedToLine', { lang: entry.language, n: entry.meanings.length })}
      </div>
    </div>
  );
}

function ForwardMeaningBody({
  m,
  idx,
  showPinyin,
  sentenceMode,
}: {
  m: Meaning;
  idx: number;
  showPinyin: boolean;
  sentenceMode: boolean;
}) {
  const { t } = useT();
  const hasExample = (m.example?.chinese?.length ?? 0) > 0;
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        {/* In sentence mode there's only one "meaning" and it IS the
            translation — numbering it ① feels off.  Skip the badge. */}
        {!sentenceMode && (
          <span className="text-amber-700 font-bold text-lg">
            {CIRCLED[idx] ?? `${idx + 1}.`}
          </span>
        )}
        {/* Hide the partOfSpeech tag for sentences — the AI sets it to
            "sentence" purely as a mode signal, not as user-facing info. */}
        {!sentenceMode && m.partOfSpeech && (
          <span className="inline-block text-xs px-2 py-0.5 bg-stone-100 text-stone-600 rounded font-medium uppercase tracking-wide">
            {m.partOfSpeech}
          </span>
        )}
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

      {hasExample && (
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
      )}
    </>
  );
}

/* ─── Reverse (other → zh) ──────────────────────────────────── */

function ReverseHeader({ entry }: { entry: DictionaryEntry }) {
  const { t } = useT();
  const n = entry.meanings.length;
  return (
    <div className="mb-5">
      <h2 className="text-2xl text-stone-900 font-semibold leading-snug break-words">
        {entry.word}
      </h2>
      <div className="mt-2 text-sm text-stone-500">
        {n > 1
          ? t('chineseCandidatesLine', { lang: entry.language, n })
          : t('chineseCandidatesLineSingle', { lang: entry.language })}
      </div>
    </div>
  );
}

function ReverseMeaningBody({
  m,
  idx,
  showPinyin,
  sentenceMode,
}: {
  m: Meaning;
  idx: number;
  showPinyin: boolean;
  sentenceMode: boolean;
}) {
  const { t } = useT();
  const reg = m.register;
  const regKey = reg ? REGISTER_KEY[reg] : null;
  const regColor = reg ? REGISTER_COLOR[reg] : '';
  const hasExample = (m.example?.chinese?.length ?? 0) > 0;
  const hasDefinition = !!m.definition && m.definition.trim().length > 0;
  return (
    <>
      <div className="flex items-baseline gap-2 flex-wrap">
        {/* Skip the ① numbering for sentence mode (only one item) */}
        {!sentenceMode && (
          <span className="text-amber-700 font-bold text-lg">
            {CIRCLED[idx] ?? `${idx + 1}.`}
          </span>
        )}
        {/* Chinese candidate — large with ruby pinyin */}
        {m.hanziSyllables && m.hanziSyllables.length > 0 && (
          <ChineseLine
            syllables={m.hanziSyllables}
            showPinyin={showPinyin}
            size="lg"
          />
        )}
        {regKey && (
          <span
            className={`inline-block text-xs px-2 py-0.5 rounded border font-medium ${regColor}`}
          >
            {t(regKey)}
          </span>
        )}
        {/* Hide the partOfSpeech tag for sentences — it's set to
            "sentence" purely as a mode signal, not user-facing info. */}
        {!sentenceMode && m.partOfSpeech && (
          <span className="inline-block text-xs px-2 py-0.5 bg-stone-100 text-stone-600 rounded font-medium tracking-wide">
            {m.partOfSpeech}
          </span>
        )}
      </div>

      {/* Usage note — for word/phrase mode this is the "when to use which
          candidate" guidance.  For sentence mode it's optional commentary;
          skip the heading + box if the AI didn't fill it in. */}
      {hasDefinition && (
        <div className="mt-2">
          {!sentenceMode && (
            <div className="text-xs text-stone-500 mb-0.5">{t('usageNote')}</div>
          )}
          <p className="text-stone-800 text-sm leading-relaxed">{m.definition}</p>
        </div>
      )}

      {/* Example: Chinese sentence + source-language translation.
          Skipped entirely for full-sentence input — see REVERSE_PROMPT. */}
      {hasExample && (
        <div className="mt-3 pl-2 border-l border-stone-200">
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
      )}
    </>
  );
}
