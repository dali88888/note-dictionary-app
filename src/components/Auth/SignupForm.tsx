import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useT } from '../../i18n/useT';
import { passwordIsStrong } from '../../auth/passwordRules';
import type { UserRole } from '../../auth/types';
import { Button } from '../UI/Button';
import { OAuthButtons } from './OAuthButtons';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';

export function SignupForm() {
  const { signUpEmail, resendConfirmation, openAuthModal } = useAuth();
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('student');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRequired, setConfirmRequired] = useState(false);
  // Distinguish "first-time signup, please check inbox" from "this
  // email was already registered, Supabase won't re-send automatically"
  // — see AuthContext.signUpEmail for the detection logic.
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  // Resend-confirmation feedback (rate-limited by Supabase to ~once/hour
  // per email, so the user sees either a success line or the upstream
  // error verbatim).
  const [resendBusy, setResendBusy] = useState(false);
  const [resendOk, setResendOk] = useState(false);
  const [resendErr, setResendErr] = useState<string | null>(null);

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
    const result = await signUpEmail({
      email: email.trim(),
      password,
      displayName: displayName.trim(),
      role,
    });
    setBusy(false);
    if (result.error) {
      setErr(result.error);
      return;
    }
    if (result.needsEmailConfirm) {
      // Show "check your inbox" — or, if Supabase says this email was
      // already registered, switch to the "we already sent it before"
      // copy so the user isn't waiting for a phantom email.
      setAlreadyRegistered(result.alreadyRegistered);
      setConfirmRequired(true);
    }
    // If needsEmailConfirm is false (e.g. confirmation disabled in
    // Supabase), a session is created immediately — AuthContext flips
    // status to 'authed' which auto-closes the AuthModal.
  };

  const handleResend = async () => {
    setResendBusy(true);
    setResendErr(null);
    setResendOk(false);
    const { error } = await resendConfirmation(email.trim());
    setResendBusy(false);
    if (error) {
      setResendErr(error);
      return;
    }
    setResendOk(true);
  };

  if (confirmRequired) {
    return (
      <div className="text-center space-y-3 py-4">
        <div className="text-3xl">{alreadyRegistered ? '🔁' : '📧'}</div>
        <p className="text-sm text-stone-700 font-medium">
          {alreadyRegistered
            ? t('confirmEmailAlreadyHeading')
            : t('confirmEmailHeading')}
        </p>
        <p className="text-xs text-stone-500 px-2">
          {alreadyRegistered
            ? t('confirmEmailAlreadyBody', { email: email.trim() })
            : t('confirmEmailBody', { email: email.trim() })}
        </p>

        {!alreadyRegistered && (
          <p className="text-[11px] text-stone-400 px-2">
            {t('confirmEmailHint')}
          </p>
        )}

        {/* Resend / sign-in actions.  Resend is the primary action when
            the email was already registered (no phantom email coming),
            but we show it in both cases to handle "first email got
            lost in spam" too. */}
        <div className="flex flex-col gap-2 pt-2">
          <Button
            type="button"
            size="sm"
            variant={alreadyRegistered ? 'primary' : 'secondary'}
            onClick={handleResend}
            disabled={resendBusy}
            className="w-full"
          >
            {resendBusy ? t('confirmEmailResending') : t('confirmEmailResend')}
          </Button>
          <button
            type="button"
            onClick={() => openAuthModal('login')}
            className="text-xs text-stone-600 hover:text-stone-900 underline underline-offset-2"
          >
            {t('confirmEmailGoLogin')}
          </button>
        </div>

        {resendOk && (
          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1 mx-2">
            {t('confirmEmailResent')}
          </p>
        )}
        {resendErr && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mx-2">
            {t('confirmEmailResendFailed', { msg: resendErr })}
          </p>
        )}
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
