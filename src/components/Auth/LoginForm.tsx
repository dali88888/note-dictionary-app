import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useT } from '../../i18n/useT';
import { Button } from '../UI/Button';
import { OAuthButtons } from './OAuthButtons';

export function LoginForm() {
  const { signInEmail } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true);
    setErr(null);
    const { error } = await signInEmail(email.trim(), password);
    setBusy(false);
    if (error) setErr(error);
    // On success, AuthContext flips status to 'authed' and AuthGate rerenders.
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-xs text-stone-600 mb-1">
          {t('emailLabel')}
        </label>
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>
      <div>
        <label className="block text-xs text-stone-600 mb-1">
          {t('passwordLabel')}
        </label>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      {err && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 space-y-1.5">
          <p>{err}</p>
          {/* The "登录响应超时" path means our retries hit the wall and the
              SDK is likely wedged — surface a one-click reload so the
              user doesn't have to find the browser refresh button. */}
          {/超时|timeout/i.test(err) && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="text-xs font-medium px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
            >
              {t('reloadPage')}
            </button>
          )}
        </div>
      )}

      <Button
        type="submit"
        size="md"
        className="w-full"
        disabled={busy || !email.trim() || !password}
      >
        {busy ? t('signingIn') : t('signInBtn')}
      </Button>

      <div className="relative my-3">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-stone-200" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-2 text-xs text-stone-400">
            {t('orDivider')}
          </span>
        </div>
      </div>

      <OAuthButtons />
    </form>
  );
}
