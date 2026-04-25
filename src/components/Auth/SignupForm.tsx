import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useT } from '../../i18n/useT';
import { passwordIsStrong } from '../../auth/passwordRules';
import type { UserRole } from '../../auth/types';
import { Button } from '../UI/Button';
import { OAuthButtons } from './OAuthButtons';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';

export function SignupForm() {
  const { signUpEmail } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRequired, setConfirmRequired] = useState(false);

  const canSubmit =
    email.trim() &&
    displayName.trim() &&
    passwordIsStrong(password) &&
    !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    const { error, needsEmailConfirm } = await signUpEmail({
      email: email.trim(),
      password,
      displayName: displayName.trim(),
      role,
    });
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    if (needsEmailConfirm) {
      // Show "check your inbox" state instead of redirecting.
      setConfirmRequired(true);
    }
    // If needsEmailConfirm is false (e.g. confirmation disabled in
    // Supabase), a session is created immediately — AuthContext flips
    // status to 'authed' which auto-closes the AuthModal.
  };

  if (confirmRequired) {
    return (
      <div className="text-center space-y-2 py-4">
        <div className="text-3xl">📧</div>
        <p className="text-sm text-stone-700 font-medium">
          {t('confirmEmailHeading')}
        </p>
        <p className="text-xs text-stone-500">
          {t('confirmEmailBody', { email: email.trim() })}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {/* Role selector — chunky segmented control so the choice feels deliberate. */}
      <div>
        <label className="block text-xs text-stone-600 mb-1">
          {t('roleLabel')}
        </label>
        <div className="grid grid-cols-2 gap-2">
          <RoleChoice
            active={role === 'student'}
            onClick={() => setRole('student')}
            title={t('roleStudent')}
            subtitle={t('roleStudentHint')}
          />
          <RoleChoice
            active={role === 'teacher'}
            onClick={() => setRole('teacher')}
            title={t('roleTeacher')}
            subtitle={t('roleTeacherHint')}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-stone-600 mb-1">
          {t('displayNameLabel')}
        </label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

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
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <PasswordStrengthIndicator password={password} />
      </div>

      {err && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
          {err}
        </p>
      )}

      <Button type="submit" size="md" className="w-full" disabled={!canSubmit}>
        {busy ? t('signingUp') : t('signUpBtn')}
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

function RoleChoice({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-md border transition-colors ${
        active
          ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-200'
          : 'border-stone-200 bg-white hover:border-stone-300'
      }`}
    >
      <div className={`text-sm font-medium ${active ? 'text-amber-800' : 'text-stone-800'}`}>
        {title}
      </div>
      <div className="text-xs text-stone-500 mt-0.5">{subtitle}</div>
    </button>
  );
}
