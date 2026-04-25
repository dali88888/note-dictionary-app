/**
 * AuthModal — the login / signup form, but as a dismissable overlay
 * instead of a full-screen blocking gate.
 *
 * Anyone can close it by clicking the backdrop, hitting ✕, or pressing
 * Escape.  When auth succeeds (status flips to 'authed' inside
 * AuthProvider) the modal auto-closes via the effect in AuthContext.
 */
import { useEffect, useState } from 'react';
import { useAuth, type AuthModalMode } from '../../auth/AuthContext';
import { useT } from '../../i18n/useT';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';

export function AuthModal() {
  const { authModalOpen, authModalMode, closeAuthModal, configMissing } =
    useAuth();
  const { t } = useT();
  const [tab, setTab] = useState<AuthModalMode>(authModalMode);

  // Sync tab when caller specifies a mode (e.g. opens via "Sign up" CTA).
  useEffect(() => {
    if (authModalOpen) setTab(authModalMode);
  }, [authModalOpen, authModalMode]);

  // Close on Escape.
  useEffect(() => {
    if (!authModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAuthModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authModalOpen, closeAuthModal]);

  if (!authModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 backdrop-blur-sm overflow-y-auto"
      onClick={closeAuthModal}
    >
      <div
        className="w-full max-w-sm m-4 sm:m-0 bg-white rounded-xl border border-stone-200 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-1">
          <h2 className="text-base font-semibold text-stone-800">
            {tab === 'login' ? t('loginTab') : t('signupTab')}
          </h2>
          <button
            type="button"
            onClick={closeAuthModal}
            className="text-stone-400 hover:text-stone-700 text-xl leading-none px-2 -mr-2"
            aria-label={t('closeBtn')}
          >
            ×
          </button>
        </div>

        {configMissing && (
          <div className="mx-6 mb-3 px-3 py-2 text-xs bg-red-50 border border-red-200 text-red-800 rounded">
            {t('authConfigMissingBody')}
          </div>
        )}

        <div className="px-6 pb-6">
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
      </div>
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
