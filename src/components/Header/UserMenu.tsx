/**
 * UserMenu — small profile chip + signout in the TopBar.
 *
 * Displays the user's display_name + role badge, with a click-out dropdown
 * for "sign out".  Designed to take minimal horizontal space so the TopBar
 * stays single-line on a typical 1280px display.
 */
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useT } from '../../i18n/useT';

export function UserMenu() {
  const { profile, signOut } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!profile) return null;

  const roleLabel =
    profile.role === 'teacher' ? t('roleBadgeTeacher') : t('roleBadgeStudent');
  const roleColor =
    profile.role === 'teacher'
      ? 'bg-emerald-100 text-emerald-800'
      : 'bg-sky-100 text-sky-800';

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1 rounded hover:bg-stone-100 transition-colors"
      >
        <span className="text-sm text-stone-800 max-w-[8rem] truncate">
          {profile.display_name}
        </span>
        <span
          className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${roleColor}`}
        >
          {roleLabel}
        </span>
        <svg
          className={`w-3 h-3 text-stone-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
          viewBox="0 0 12 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M1 1.5L6 6.5L11 1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-44 bg-white border border-stone-200 rounded-md shadow-lg z-20">
          <div className="px-3 py-2 border-b border-stone-100">
            <p className="text-xs text-stone-500 truncate">
              {t('helloUser', { name: profile.display_name })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
            className="w-full text-left px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
          >
            {t('signOutBtn')}
          </button>
        </div>
      )}
    </div>
  );
}
