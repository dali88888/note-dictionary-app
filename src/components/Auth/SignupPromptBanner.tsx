/**
 * SignupPromptBanner — sits above the search box for anonymous users.
 * Soft-sells registration by listing the benefits (knowledge base,
 * spaced review, teacher → multiple students).  Dismissible: the
 * choice is persisted to localStorage so we don't re-pester returning
 * visitors who've already explicitly said "no thanks".
 *
 * Hidden entirely for signed-in users.
 */
import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useT } from '../../i18n/useT';

const DISMISS_KEY = 'note-dict-signup-banner-dismissed';

function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
function markDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* private mode; ignore */
  }
}

export function SignupPromptBanner() {
  const { status, openAuthModal } = useAuth();
  const { t } = useT();
  const [hidden, setHidden] = useState(isDismissed());

  if (status !== 'anon') return null;
  if (hidden) return null;

  return (
    <aside
      role="region"
      aria-label={t('signupPromptTitle')}
      className="bg-gradient-to-br from-amber-50 to-stone-50 border border-amber-200 rounded-xl px-4 py-3 sm:px-5 sm:py-4 flex items-start gap-3 sm:gap-4"
    >
      <div className="text-2xl shrink-0 leading-none mt-0.5" aria-hidden="true">
        ✨
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-stone-800">
          {t('signupPromptTitle')}
        </h3>
        <p className="text-sm text-stone-600 mt-0.5">
          {t('signupPromptBody')}
        </p>
        <ul className="mt-2 space-y-0.5 text-xs text-stone-600">
          <li>• {t('signupPromptBullet1')}</li>
          <li>• {t('signupPromptBullet2')}</li>
          <li>• {t('signupPromptBullet3')}</li>
          <li>• {t('signupPromptBullet4')}</li>
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openAuthModal('signup')}
            className="text-sm font-medium px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white"
          >
            {t('signupPromptCtaSignup')}
          </button>
          <button
            type="button"
            onClick={() => openAuthModal('login')}
            className="text-sm text-stone-600 hover:text-stone-900 px-2 py-1.5"
          >
            {t('signupPromptCtaLogin')}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          markDismissed();
          setHidden(true);
        }}
        className="text-stone-400 hover:text-stone-700 text-lg leading-none px-2 -mr-2 -mt-1"
        aria-label={t('signupPromptDismiss')}
        title={t('signupPromptDismiss')}
      >
        ×
      </button>
    </aside>
  );
}
