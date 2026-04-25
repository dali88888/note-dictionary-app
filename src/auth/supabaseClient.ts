import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // We don't `throw` here — the app should still load so a missing-config
  // banner can render gracefully.  Consumers should null-check `supabase`.
  // eslint-disable-next-line no-console
  console.error(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY not set. ' +
      'Auth will not work until you configure .env.local.',
  );
}

/**
 * Singleton Supabase client.  Uses a publishable (anon) key — safe in browser
 * bundles because all data access is gated by row-level security policies.
 */
export const supabase = createClient(url ?? '', key ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // handles OAuth + email-confirm redirects
  },
});

export const supabaseConfigured = Boolean(url && key);
