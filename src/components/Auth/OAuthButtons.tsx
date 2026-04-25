import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useT } from '../../i18n/useT';

/**
 * Two side-by-side OAuth buttons (Google, GitHub).  Pressing one initiates
 * the redirect-based flow via supabase.auth.signInWithOAuth.  On return,
 * AuthContext picks up the new session automatically.
 */
export function OAuthButtons() {
  const { signInOAuth } = useAuth();
  const { t } = useT();
  const [busy, setBusy] = useState<'google' | 'github' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const go = async (provider: 'google' | 'github') => {
    setBusy(provider);
    setErr(null);
    const { error } = await signInOAuth(provider);
    if (error) {
      setErr(error);
      setBusy(null);
    }
    // On success the page redirects, so no need to clear `busy`.
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => go('google')}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 px-3 py-2 text-sm border border-stone-300 rounded-md bg-white hover:bg-stone-50 disabled:opacity-50"
        >
          <GoogleGlyph />
          <span>{busy === 'google' ? '…' : t('signInWithGoogle')}</span>
        </button>
        <button
          type="button"
          onClick={() => go('github')}
          disabled={busy !== null}
          className="flex items-center justify-center gap-2 px-3 py-2 text-sm border border-stone-300 rounded-md bg-white hover:bg-stone-50 disabled:opacity-50"
        >
          <GitHubGlyph />
          <span>{busy === 'github' ? '…' : t('signInWithGitHub')}</span>
        </button>
      </div>
      {err && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {err}
        </p>
      )}
    </div>
  );
}

function GoogleGlyph() {
  // Multi-color "G" used per Google brand guidelines.
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5 44.5 36.3 44.5 25c0-1.5-.2-3-.5-4.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8c1.8-3.8 5.6-6.5 10.1-6.5 3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 45.5c5.4 0 10.3-2 14-5.3l-6.5-5.5c-1.9 1.5-4.4 2.4-7.5 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 41.1 16.2 45.5 24 45.5z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2.1-2 3.9-3.7 5.2l6.5 5.5c-.5.4 7-5.1 7-13.7 0-1.5-.2-3-.5-4.5z" />
    </svg>
  );
}

function GitHubGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.69-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.95.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
