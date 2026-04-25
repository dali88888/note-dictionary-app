/**
 * AuthGate — wraps the entire app.  Behavior:
 *   loading → spinner
 *   anon    → tabbed Login / Signup screen
 *   authed  → renders children (the real app)
 *
 * Also handles the "Supabase env vars missing" config-error state up front
 * with a friendly message instead of a cryptic runtime crash.
 */
import { useState, type ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useT } from '../../i18n/useT';
import { useDictStore } from '../../store/dictStore';
import type { UILang } from '../../i18n';
import { UI_LANGS, UI_LANG_LABEL } from '../../i18n';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';

type Tab = 'login' | 'signup';

export function AuthGate({ children }: { children: ReactNode }) {
  const { status, configMissing } = useAuth();
  const { t } = useT();

  if (configMissing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <div className="max-w-md bg-white border border-red-200 rounded-xl p-6">
          <h1 className="text-lg font-semibold text-red-700 mb-2">
            {t('authConfigMissingTitle')}
          </h1>
          <p className="text-sm text-stone-700 mb-2">
            {t('authConfigMissingBody')}
          </p>
          <pre className="text-xs bg-stone-100 rounded p-2 overflow-x-auto">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`}
          </pre>
        </div>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-stone-400 text-sm">…</div>
      </div>
    );
  }

  if (status === 'anon') {
    return <AuthScreen />;
  }

  return <>{children}</>;
}

function AuthScreen() {
  const [tab, setTab] = useState<Tab>('login');
  const { t } = useT();
  const uiLang = useDictStore((s) => s.prefs.uiLanguage);
  const setUILanguage = useDictStore((s) => s.setUILanguage);

  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Top bar — minimal: app title left, UI language picker right.
          A user who can't log in still benefits from being able to switch the
          locale of the auth screen itself. */}
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-base font-semibold text-stone-800">
            {t('appTitle')}
          </h1>
          <select
            value={uiLang}
            onChange={(e) => setUILanguage(e.target.value as UILang)}
            className="text-xs bg-transparent border border-stone-300 rounded px-2 py-1"
          >
            {UI_LANGS.map((lang) => (
              <option key={lang} value={lang}>
                {UI_LANG_LABEL[lang]}
              </option>
            ))}
          </select>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm bg-white rounded-xl border border-stone-200 shadow-sm p-6">
          {/* Login / Signup tab toggle */}
          <div className="flex border-b border-stone-200 mb-4 -mx-6 px-6">
            <TabButton
              active={tab === 'login'}
              onClick={() => setTab('login')}
              label={t('loginTab')}
            />
            <TabButton
              active={tab === 'signup'}
              onClick={() => setTab('signup')}
              label={t('signupTab')}
            />
          </div>

          {tab === 'login' ? <LoginForm /> : <SignupForm />}
        </div>
      </main>

      <footer className="text-center text-xs text-stone-400 py-3">
        {t('appTitle')}
      </footer>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-amber-600 text-amber-700'
          : 'border-transparent text-stone-500 hover:text-stone-700'
      }`}
    >
      {label}
    </button>
  );
}
