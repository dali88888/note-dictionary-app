/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Stamped by vite.config.ts `define` at build time.  Logged at boot so
// users / debuggers can confirm which deploy is actually running in
// the browser.  Falls back to the build ISO timestamp in dev.
declare const __APP_VERSION__: string;
