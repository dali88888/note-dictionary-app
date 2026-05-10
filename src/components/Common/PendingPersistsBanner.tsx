/**
 * PendingPersistsBanner — sticky amber banner that surfaces background
 * persist failures.
 *
 * Without this banner, the optimistic-UI flow can lose a teacher's
 * entire lesson silently: AI returns -> result shows -> background
 * `entries.upsert` fails (idle-wedged Supabase socket / expired auth /
 * network blip) -> .catch() logs a warning to a console nobody looks
 * at -> tab gets closed -> queue is empty in the cloud and the data
 * is gone.  The user only finds out the next day when they go to
 * export the PPT.
 *
 * With it: the moment any persist fails, the entry is enqueued in
 * `state.pendingPersists` (which is persisted to localStorage).  This
 * banner renders whenever the queue is non-empty, telling the user
 * exactly how many queries are still waiting to sync, with two
 * actions:
 *
 *   • Retry now — manually fires `flushPendingPersists`.  Used when
 *     the user knows their network just came back, or after they
 *     refreshed the tab to clear a wedged SDK.
 *   • Discard   — clears the queue (with a confirm prompt).  Used
 *     when the user already exported a PPT from the in-memory data
 *     and doesn't care about the cloud row going missing.
 *
 * The banner is non-blocking — sits below TopBar, above the page
 * content, doesn't intercept clicks elsewhere.
 */
import { useDictStore } from '../../store/dictStore';
import { useT } from '../../i18n/useT';

export function PendingPersistsBanner() {
  const pendingMap = useDictStore((s) => s.pendingPersists);
  const flush = useDictStore((s) => s.flushPendingPersists);
  const discard = useDictStore((s) => s.discardPendingPersists);
  const { t } = useT();

  const pending = Object.values(pendingMap);
  if (pending.length === 0) return null;

  // Show the words involved so the user can tell at a glance which
  // queries are pending — useful both for "oh, those are recoverable"
  // recognition and for deciding whether to discard.  Cap to a
  // handful so a runaway queue doesn't blow up the banner height.
  const previewWords = pending
    .slice(0, 5)
    .map((p) => p.entry.word)
    .join(' / ');
  const overflow = pending.length - 5;

  return (
    <div
      className="bg-amber-50 border-b border-amber-200 text-amber-900 text-sm"
      role="status"
      aria-live="polite"
    >
      <div className="max-w-6xl mx-auto px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">
          {t('pendingPersistsCount', { n: pending.length })}
        </span>
        <span className="text-amber-700 truncate min-w-0 flex-1">
          {previewWords}
          {overflow > 0 ? ` +${overflow}` : ''}
        </span>
        <button
          type="button"
          onClick={() => void flush()}
          className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium"
        >
          {t('pendingPersistsRetry')}
        </button>
        <button
          type="button"
          onClick={() => {
            // Confirm before discarding — losing this data is
            // irreversible, and the banner's whole reason to exist
            // is to prevent silent data loss.
            if (window.confirm(t('pendingPersistsDiscardConfirm'))) {
              discard();
            }
          }}
          className="px-3 py-1 rounded text-amber-700 hover:bg-amber-100 text-xs"
        >
          {t('pendingPersistsDiscard')}
        </button>
      </div>
    </div>
  );
}
