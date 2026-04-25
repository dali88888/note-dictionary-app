import { useDictStore } from '../../store/dictStore';
import { UI_LANGS, UI_LANG_LABEL, type UILang } from '../../i18n';
import { useT } from '../../i18n/useT';
import { Toggle } from '../UI/Toggle';
import { SessionBar } from '../Session/SessionBar';

type View = 'search' | 'history';

interface Props {
  view: View;
  onChangeView: (v: View) => void;
}

export function TopBar({ view, onChangeView }: Props) {
  const uiLanguage = useDictStore((s) => s.prefs.uiLanguage);
  const showPinyin = useDictStore((s) => s.prefs.showPinyin);
  const setUILanguage = useDictStore((s) => s.setUILanguage);
  const setShowPinyin = useDictStore((s) => s.setShowPinyin);
  const { t } = useT();

  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-stone-200">
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">📖</span>
          <h1 className="text-base font-semibold text-stone-800">{t('appTitle')}</h1>
        </div>

        <nav className="flex items-center gap-1 ml-2">
          <button
            onClick={() => onChangeView('search')}
            className={`px-3 py-1 rounded text-sm font-medium ${
              view === 'search'
                ? 'bg-amber-100 text-amber-800'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {t('tabSearch')}
          </button>
          <button
            onClick={() => onChangeView('history')}
            className={`px-3 py-1 rounded text-sm font-medium ${
              view === 'history'
                ? 'bg-amber-100 text-amber-800'
                : 'text-stone-600 hover:bg-stone-100'
            }`}
          >
            {t('tabHistory')}
          </button>
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-stone-500">🌐</span>
            <select
              className="text-sm border border-stone-300 rounded px-2 py-1 bg-white"
              value={uiLanguage}
              onChange={(e) => setUILanguage(e.target.value as UILang)}
              title={t('uiLangLabel')}
            >
              {UI_LANGS.map((lang) => (
                <option key={lang} value={lang}>
                  {UI_LANG_LABEL[lang]}
                </option>
              ))}
            </select>
          </div>

          <Toggle
            label={t('pinyin')}
            checked={showPinyin}
            onChange={setShowPinyin}
          />

          <div className="h-5 w-px bg-stone-300" />
          <SessionBar />
        </div>
      </div>
    </header>
  );
}
