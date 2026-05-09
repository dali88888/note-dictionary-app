import { useLayoutEffect, useRef, useState } from 'react';
import { useDictStore } from '../../store/dictStore';
import {
  PRESET_LANGUAGES,
  type TranslationDirection,
} from '../../types/dictionary';
import { useT } from '../../i18n/useT';
import { Button } from '../UI/Button';

/**
 * CJK Unified Ideographs ranges — used to auto-detect whether the
 * user's input is Chinese (forward translate) or non-Chinese
 * (reverse translate to Chinese).  Includes the BMP block
 * (U+4E00–U+9FFF) and Extension A (U+3400–U+4DBF), which together
 * cover modern simplified + traditional Chinese.  Pinyin alone
 * ("ni hao") contains no Han characters and correctly routes to
 * reverse mode, where the AI handles transliteration → candidates.
 */
const HAN_RE = /[一-鿿㐀-䶿]/u;

/**
 * Direction is no longer a user-facing toggle.  We pick it from the
 * input itself: any Chinese character → forward (zh-to-other);
 * otherwise → reverse (other-to-zh).  This matches "any language →
 * any language" UX (Google Translate-style) — the user types and we
 * route to the right prompt automatically.
 */
function detectDirection(input: string): TranslationDirection {
  return HAN_RE.test(input) ? 'zh-to-other' : 'other-to-zh';
}

export function SearchBox() {
  const query = useDictStore((s) => s.query);
  const loading = useDictStore((s) => s.loading);
  const language = useDictStore((s) => s.prefs.language);
  const setLanguage = useDictStore((s) => s.setLanguage);
  const { t } = useT();

  const [word, setWord] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isPreset = (PRESET_LANGUAGES as readonly string[]).includes(language);

  // Auto-resize the textarea: shrink to 'auto' first so scrollHeight
  // recomputes correctly when the user deletes characters, then grow
  // to fit the content.  Capped via `max-h-*` on the element so very
  // long input scrolls instead of pushing the layout around.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [word]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = word.trim();
    if (!trimmed || loading) return;
    // Direction is auto-detected from the input.  When trimmed is
    // pure Chinese, we translate INTO `language` (account preference);
    // when it's another language, the target is implicitly Chinese
    // and `language` is ignored downstream.
    query(trimmed, detectDirection(trimmed));
  };

  // Submit on Enter, allow Shift+Enter for a newline.  Critically, also
  // ignore Enter while an IME composition is in progress — Chinese
  // pinyin input uses Enter to confirm a candidate character, and we
  // don't want that to fire a query mid-word.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter') return;
    if (e.shiftKey) return;
    // `isComposing` is the standard signal; some browsers expose it on
    // the synthetic event, others only on the native event.
    if (
      e.nativeEvent.isComposing ||
      (e as unknown as { isComposing?: boolean }).isComposing
    )
      return;
    e.preventDefault();
    handleSubmit(e);
  };

  const handleLangChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === '__other__') {
      setCustomDraft(isPreset ? '' : language);
      setCustomOpen(true);
    } else {
      setLanguage(v);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
        {/* Direction segmented control removed — input language is now
            auto-detected (see detectDirection() above).  This collapses
            the previous "zh→other / other→zh" tabbed UI into a single
            "any language → any language" flow, à la Google Translate. */}

        <div className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
          <textarea
            ref={textareaRef}
            // Larger initial height (3 rows ≈ ~5 lines visible after
            // line-height + padding) so the input feels like a "writing
            // surface" rather than a single-line search box.  Auto-grows
            // beyond this as the user types up to max-h.
            rows={3}
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('searchPlaceholder')}
            disabled={loading}
            className="flex-1 min-w-0 text-lg px-4 py-3 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-stone-50 resize-none overflow-y-auto leading-relaxed max-h-[16rem]"
            autoFocus
          />
          {/* Submit button + target-language dropdown.  `self-start`
              keeps them anchored to the first textarea line as the
              textarea grows for multi-line input. */}
          <Button
            type="submit"
            size="lg"
            disabled={loading || !word.trim()}
            className="self-start"
          >
            {loading ? t('searchLoading') : t('searchBtn')}
          </Button>

          {/* Target-language picker — always visible.  Active when the
              input is Chinese (translate to <lang>); inert when input
              is non-Chinese (target is implicitly Chinese, picker
              setting is ignored).  Showing it unconditionally keeps
              the layout stable across input changes. */}
          <div className="self-start flex items-center gap-1.5 px-3 py-2 border border-stone-300 rounded-lg bg-white">
            <span className="text-sm text-stone-500 whitespace-nowrap">
              {t('translateTo')}
            </span>
            <select
              className="text-sm bg-transparent focus:outline-none"
              value={isPreset ? language : '__other__'}
              onChange={handleLangChange}
            >
              {PRESET_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
              <option value="__other__">
                {isPreset
                  ? t('otherLang')
                  : t('otherLangWith', { value: language })}
              </option>
            </select>
          </div>
        </div>

        <p className="mt-2 text-xs text-stone-500">{t('searchHint')}</p>
      </form>

      {customOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 flex items-center justify-center px-4"
          onClick={() => setCustomOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const v = customDraft.trim();
              if (v) {
                setLanguage(v);
                setCustomOpen(false);
              }
            }}
            className="bg-white rounded-lg shadow-lg p-5 w-full max-w-sm"
          >
            <h3 className="text-base font-semibold mb-2">
              {t('customLangTitle')}
            </h3>
            <p className="text-sm text-stone-500 mb-3">
              {t('customLangHint')}
            </p>
            <input
              autoFocus
              className="w-full border border-stone-300 rounded px-3 py-2 text-sm"
              placeholder={t('customLangPlaceholder')}
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCustomOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={!customDraft.trim()}>
                {t('confirm')}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
