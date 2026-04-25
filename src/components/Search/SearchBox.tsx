import { useState } from 'react';
import { useDictStore } from '../../store/dictStore';
import { PRESET_LANGUAGES } from '../../types/dictionary';
import { useT } from '../../i18n/useT';
import { Button } from '../UI/Button';

export function SearchBox() {
  const query = useDictStore((s) => s.query);
  const loading = useDictStore((s) => s.loading);
  const language = useDictStore((s) => s.prefs.language);
  const setLanguage = useDictStore((s) => s.setLanguage);
  const { t } = useT();

  const [word, setWord] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customDraft, setCustomDraft] = useState('');

  const isPreset = (PRESET_LANGUAGES as readonly string[]).includes(language);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = word.trim();
    if (!trimmed || loading) return;
    query(trimmed);
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
        <div className="flex items-stretch gap-2 flex-wrap sm:flex-nowrap">
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            placeholder={t('searchPlaceholder')}
            disabled={loading}
            className="flex-1 min-w-0 text-lg px-4 py-3 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-stone-50"
            autoFocus
          />
          <Button type="submit" size="lg" disabled={loading || !word.trim()}>
            {loading ? t('searchLoading') : t('searchBtn')}
          </Button>

          {/* Translate-target selector — sits to the right of the Search button */}
          <div className="flex items-center gap-1.5 px-3 border border-stone-300 rounded-lg bg-white">
            <span className="text-sm text-stone-500 whitespace-nowrap">
              {t('translateTo')}
            </span>
            <select
              className="text-sm bg-transparent py-1 focus:outline-none"
              value={isPreset ? language : '__other__'}
              onChange={handleLangChange}
            >
              {PRESET_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
              <option value="__other__">
                {isPreset ? t('otherLang') : t('otherLangWith', { value: language })}
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
            <h3 className="text-base font-semibold mb-2">{t('customLangTitle')}</h3>
            <p className="text-sm text-stone-500 mb-3">{t('customLangHint')}</p>
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
