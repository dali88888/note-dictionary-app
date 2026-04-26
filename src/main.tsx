import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Build identifier — printed at module-load so DevTools always shows
// which build is running, even when the app appears blank.  Vite
// stamps __APP_VERSION__ at build time (see vite.config.ts define).
// eslint-disable-next-line no-console
console.log(
  `[note-dict] booting · build ${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}`,
);

// ErrorBoundary wraps everything (including AuthProvider) so even an
// init-time throw in supabase / context still renders a visible error
// card instead of leaving <div id="root"> blank.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
