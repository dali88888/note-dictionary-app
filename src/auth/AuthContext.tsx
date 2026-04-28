/**
 * AuthContext — single source of truth for "who is logged in".
 *
 * Hydration sequence on every page load:
 *   1. supabase.auth.getSession() resolves either to an active session or null
 *   2. if a session exists, fetch the matching profiles row
 *   3. expose { session, profile, status } to the tree
 *
 * Signup/login/oauth/signout are all funneled through this provider so the
 * UI never has to talk to supabase.auth directly.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, withTimeout } from './supabaseClient';
import type { Profile, UserRole } from './types';

type Status = 'loading' | 'authed' | 'anon';
export type AuthModalMode = 'login' | 'signup';

interface SignupArgs {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

interface SignupResult {
  error: string | null;
  needsEmailConfirm: boolean;
  /**
   * True when Supabase reports the email is already registered but
   * unconfirmed.  In that case Supabase silently does NOT send a new
   * confirmation email (anti-enumeration), so the UI should switch
   * to "we already sent you a link — resend or sign in" copy instead
   * of a hopeful "check your inbox".
   *
   * Detection: Supabase v2's signUp returns a user object with
   * `identities: []` for this case.
   */
  alreadyRegistered: boolean;
}

interface AuthContextValue {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  /** True when env vars are missing — UI should show a config-error banner. */
  configMissing: boolean;
  /** Auth APIs.  All resolve with a friendly error message string on failure. */
  signUpEmail: (args: SignupArgs) => Promise<SignupResult>;
  signInEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInOAuth: (provider: 'google' | 'github') => Promise<{ error: string | null }>;
  /**
   * Re-send the signup confirmation email.  Use when the user clicked
   * "register" with an email that was already pending confirmation, or
   * when their first email got lost.  Supabase enforces an hourly
   * rate-limit per email, so frequent calls return an error.
   */
  resendConfirmation: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Refetch the profile row (call after editing display_name or role). */
  refreshProfile: () => Promise<void>;

  /**
   * Login/signup is now optional.  Any component (TopBar buttons,
   * SignupPromptBanner, sign-in CTAs in empty states) can pop the
   * modal by calling openAuthModal('login' | 'signup').  The modal
   * itself is rendered by AuthProvider so consumers don't have to
   * wire it up everywhere.
   */
  authModalOpen: boolean;
  authModalMode: AuthModalMode;
  openAuthModal: (mode?: AuthModalMode) => void;
  closeAuthModal: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name, role, created_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error('[auth] profile fetch failed', error);
    return null;
  }
  return (data as Profile | null) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');

  // Mount: hydrate session, then subscribe to changes.
  useEffect(() => {
    if (!supabaseConfigured) {
      setStatus('anon');
      return;
    }
    let cancelled = false;

    // Hard timeout: if getSession() never resolves (rare, but seen in
    // some networks where Supabase's storage endpoint is throttled),
    // fall back to anon after 5 s so the app actually renders instead
    // of the user staring at a faint loading spinner forever.
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      // eslint-disable-next-line no-console
      console.warn(
        '[auth] getSession() did not resolve within 5s — falling back to anon. ' +
          'Subsequent auth state changes will still flip to authed if a session arrives.',
      );
      setStatus((prev) => (prev === 'loading' ? 'anon' : prev));
    }, 5000);

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (cancelled) return;
        clearTimeout(timeoutId);
        const sess = data.session;
        setSession(sess);
        if (sess) {
          const p = await fetchProfile(sess.user.id);
          if (cancelled) return;
          setProfile(p);
          setStatus('authed');
        } else {
          setStatus('anon');
        }
      })
      .catch((e) => {
        // If getSession itself rejects (corrupted localStorage,
        // crypto API unavailable, etc), don't leave the app stuck —
        // log loudly and fall through to anon mode.
        if (cancelled) return;
        clearTimeout(timeoutId);
        // eslint-disable-next-line no-console
        console.error('[auth] getSession failed; falling back to anon:', e);
        setStatus('anon');
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, sess) => {
      setSession(sess);
      if (sess) {
        const p = await fetchProfile(sess.user.id);
        setProfile(p);
        setStatus('authed');
      } else {
        setProfile(null);
        setStatus('anon');
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session) return;
    const p = await fetchProfile(session.user.id);
    setProfile(p);
  }, [session]);

  const signUpEmail = useCallback<AuthContextValue['signUpEmail']>(
    async ({ email, password, displayName, role }) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Stored on auth.users.raw_user_meta_data; the on_auth_user_created
          // trigger reads display_name + role from here to seed public.profiles.
          data: { display_name: displayName, role },
          // Supabase ignores this URL unless it (or a wildcard match) is
          // listed in Authentication → URL Configuration → Redirect URLs.
          // When ignored, the email's confirm link falls back to "Site URL"
          // — so make sure both are configured in the dashboard.  The
          // trailing slash makes the full URL match a `…/**` whitelist
          // entry without ambiguity.
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) {
        return { error: error.message, needsEmailConfirm: false, alreadyRegistered: false };
      }
      // Supabase v2 anti-enumeration: when the email is already in
      // auth.users (regardless of confirmed state), signUp returns a
      // user object whose `identities` array is empty AND no session.
      // No confirmation email is re-sent in that case — surfacing this
      // explicitly lets the UI offer "resend" or "go to login" rather
      // than waiting forever.
      const identities = data.user?.identities ?? [];
      const alreadyRegistered = !!data.user && identities.length === 0;
      // If email confirmation is required, supabase returns user but no session.
      const needsEmailConfirm = !data.session;
      return { error: null, needsEmailConfirm, alreadyRegistered };
    },
    [],
  );

  const resendConfirmation = useCallback<AuthContextValue['resendConfirmation']>(
    async (email) => {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signInEmail = useCallback<AuthContextValue['signInEmail']>(
    async (email, password) => {
      // Hard 15s ceiling on the sign-in call.  Field reports of "登录中…
      // forever" mean signInWithPassword sometimes never resolves
      // (suspected internal mutex / orphaned auto-refresh on a stale
      // session).  Without a timeout the LoginForm button stays in
      // its busy state and the user is dead in the water.
      //
      // On timeout we surface a friendly Chinese error string so the
      // form's `setBusy(false)` runs and the user can retry.  The
      // legitimate worst case for sign-in (round-trip to Supabase
      // Auth + fetchProfile) is well under 5 s, so 15 s is generous
      // and almost never fires for a healthy network.
      const result = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        15000,
        { error: { message: '登录超时（15s）。请检查网络后重试，或刷新页面后再次尝试。' } as { message: string } } as Awaited<ReturnType<typeof supabase.auth.signInWithPassword>>,
        'signInWithPassword',
      );
      return { error: result.error?.message ?? null };
    },
    [],
  );

  const signInOAuth = useCallback<AuthContextValue['signInOAuth']>(async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      // Same Redirect URLs whitelist requirement as emailRedirectTo —
      // see signUpEmail above for why the trailing slash matters.
      options: { redirectTo: `${window.location.origin}/` },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const openAuthModal = useCallback((mode: AuthModalMode = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => {
    setAuthModalOpen(false);
  }, []);

  // Auto-close the modal when auth flips to authed (i.e. login succeeded).
  // This handles both email/password (synchronous flip) and OAuth
  // (post-redirect onAuthStateChange).
  useEffect(() => {
    if (status === 'authed' && authModalOpen) {
      setAuthModalOpen(false);
    }
  }, [status, authModalOpen]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      configMissing: !supabaseConfigured,
      signUpEmail,
      signInEmail,
      signInOAuth,
      resendConfirmation,
      signOut,
      refreshProfile,
      authModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
    }),
    [
      status,
      session,
      profile,
      signUpEmail,
      signInEmail,
      signInOAuth,
      resendConfirmation,
      signOut,
      refreshProfile,
      authModalOpen,
      authModalMode,
      openAuthModal,
      closeAuthModal,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
