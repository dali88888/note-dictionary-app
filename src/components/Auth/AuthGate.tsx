/**
 * AuthGate — thin wrapper that handles two pre-app states and otherwise
 * lets everything through.  Login is now optional; anonymous users see
 * the full app and are nudged to register via SignupPromptBanner.
 *
 * Behavior:
 *   configMissing → red config-error screen (Supabase env vars not set)
 *   loading       → minimal centered spinner while initial getSession()
 *                   resolves; prevents a flash of unauthed UI before we
 *                   know whether the user is signed in
 *   authed | anon → renders {children} (the real app)
 *
 * The AuthModal (login/signup overlay) and the SignupPromptBanner CTA
 * live elsewhere — this component is only about the brief pre-app
 * gating.
 */
import type { ReactNode } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useT } from '../../i18n/useT';

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
    // Visible spinner + label so the user can tell "the app is alive
    // but waiting on Supabase" apart from "the page is blank because
    // something crashed".  Previously this was a single faint `…`
    // that easily read as a totally white screen.
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-stone-500 text-sm">{t('appTitle')}</div>
        </div>
      </div>
    );
  }

  // Both 'authed' AND 'anon' fall through to the real app.  Anon users
  // can use everything except cloud-backed features (history persistence,
  // managed-student folders, etc), which surface their own sign-in CTAs.
  return <>{children}</>;
}
