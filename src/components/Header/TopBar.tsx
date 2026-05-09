import { useDictStore } from '../../store/dictStore';
import { UI_LANGS, UI_LANG_LABEL, type UILang } from '../../i18n';
import { useT } from '../../i18n/useT';
import { Toggle } from '../UI/Toggle';
import { SessionBar } from '../Session/SessionBar';
import { UserMenu } from './UserMenu';
import { StudentSwitcher } from './StudentSwitcher';
import { useAuth } from '../../auth/AuthContext';

type View = 'search' | 'history';

interface Props {
  view: View;
  onChangeView: (v: View) => void;
}

/**
 * Two-row header layout.
 *
 *   Row 1: [📖 Dictionary & Note] ............ [User Teacher] [Student: x] [+ New lesson] [🌐 Lang] [Pinyin]
 *   Row 2: [Lookup] [History & Export]
 *
 * Why two rows: the previous single-row layout wrapped messily on
 * English defaults — there isn't enough horizontal room to fit the
 * title + 5 tools + 2 nav tabs at once.  Splitting nav onto its own
 * row also matches the user's mental model: Lookup / History are
 * sub-views of the account, so they belong below the account /
 * preferences cluster, not in the same horizontal band.
 *
 * Right-cluster order is dictated by the user's spec: User → Student
 * → +New lesson are grouped together (left-most on the right side)
 * since they're the per-account context controls; Lang / Pinyin sit
 * to their right as global preferences.
 */
export function TopBar({ view, onChangeView }: Props) {
  const uiLanguage = useDictStore((s) => s.prefs.uiLanguage);
  const showPinyin = useDictStore((s) => s.prefs.showPinyin);
  const setUILanguage = useDictStore((s) => s.setUILanguage);
  const setShowPinyin = useDictStore((s) => s.setShowPinyin);
  const { status, openAuthModal } = useAuth();
  const { t } = useT();

  const isAuthed = status === 'authed';

  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-stone-200">
      <div className="max-w-6xl mx-auto px-4">
        {/* ── Row 1: title + right cluster ──────────────────────── */}
        <div className="py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Title — large, brand-styled, left-aligned via mr-auto.
              No `max-w-5xl` on the outer container so the right cluster
              has room to fit on a single line at typical desktop widths. */}
          <div className="flex items-center gap-2 mr-auto">
            <span className="text-2xl leading-none">📖</span>
            <h1 className="text-2xl font-bold text-stone-800 tracking-tight leading-none">
              {t('appTitle')}
            </h1>
          </div>

          {/* Right cluster.  Order — per the user's spec — is:
              [User Teacher] [Student: x] [+ New lesson] | [Lang] [Pinyin]
              for authed users, with Lang/Pinyin trailing as global prefs.
              For anon users we drop the account-context items entirely and
              show login / signup CTAs instead. */}
          {isAuthed ? (
            <>
              <UserMenu />
              <StudentSwitcher />
              <SessionBar />
              <div className="h-5 w-px bg-stone-300" />
              <LangPicker
                uiLanguage={uiLanguage}
                onChange={(v) => setUILanguage(v)}
                title={t('uiLangLabel')}
              />
              <Toggle
                label={t('pinyin')}
                checked={showPinyin}
                onChange={setShowPinyin}
              />
            </>
          ) : (
            <>
              <LangPicker
                uiLanguage={uiLanguage}
                onChange={(v) => setUILanguage(v)}
                title={t('uiLangLabel')}
              />
              <Toggle
                label={t('pinyin')}
                checked={showPinyin}
                onChange={setShowPinyin}
              />
              <div className="h-5 w-px bg-stone-300" />
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="text-sm text-stone-600 hover:text-stone-900 px-2 py-1"
              >
                {t('loginTab')}
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('signup')}
                className="text-sm font-medium px-3 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white"
              >
                {t('signupTab')}
              </button>
            </>
          )}
        </div>

        {/* ── Row 2: navigation tabs ─────────────────────────────
            Sub-views of the account, so they sit *below* the account
            controls — matches the user's mental model.  A subtle
            top border separates the rows visually without adding
            vertical weight. */}
        <nav className="flex items-center gap-1 pb-2 border-t border-stone-100 pt-2">
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
      </div>
    </header>
  );
}

/**
 * Tiny extracted component just to deduplicate the language picker
 * between the authed and anon paths above.  Kept inline rather than
 * in its own file because it's purely structural — no state, no
 * exports needed elsewhere.
 */
function LangPicker({
  uiLanguage,
  onChange,
  title,
}: {
  uiLanguage: UILang;
  onChange: (v: UILang) => void;
  title: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm text-stone-500">🌐</span>
      <select
        className="text-sm border border-stone-300 rounded px-2 py-1 bg-white"
        value={uiLanguage}
        onChange={(e) => onChange(e.target.value as UILang)}
        title={title}
      >
        {UI_LANGS.map((lang) => (
          <option key={lang} value={lang}>
            {UI_LANG_LABEL[lang]}
          </option>
        ))}
      </select>
    </div>
  );
}
