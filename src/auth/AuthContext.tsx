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
import { supabase, supabaseConfigured } from './supabaseClient';
import type { Profile, UserRole } from './types';

type Status = 'loading' | 'authed' | 'anon';

interface SignupArgs {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
}

interface AuthContextValue {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  /** True when env vars are missing — UI should show a config-error banner. */
  configMissing: boolean;
  /** Auth APIs.  All resolve with a friendly error message string on failure. */
  signUpEmail: (args: SignupArgs) => Promise<{ error: string | null; needsEmailConfirm: boolean }>;
  signInEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  signInOAuth: (provider: 'google' | 'github') => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Refetch the profile row (call after editing display_name or role). */
  refreshProfile: () => Promise<void>;
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

  // Mount: hydrate session, then subscribe to changes.
  useEffect(() => {
    if (!supabaseConfigured) {
      setStatus('anon');
      return;
    }
    let cancelled = false;

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
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
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) return { error: error.message, needsEmailConfirm: false };
      // If email confirmation is required, supabase returns user but no session.
      const needsEmailConfirm = !data.session;
      return { error: null, needsEmailConfirm };
    },
    [],
  );

  const signInEmail = useCallback<AuthContextValue['signInEmail']>(
    async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signInOAuth = useCallback<AuthContextValue['signInOAuth']>(async (provider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      profile,
      configMissing: !supabaseConfigured,
      signUpEmail,
      signInEmail,
      signInOAuth,
      signOut,
      refreshProfile,
    }),
    [status, session, profile, signUpEmail, signInEmail, signInOAuth, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
