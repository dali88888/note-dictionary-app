/**
 * LegacyImportDialog — one-time prompt asking the user whether to copy the
 * pre-cloud `note-dict-v1` localStorage blob into their freshly-created
 * Supabase account.
 *
 * Detection lives in App.tsx; this component just renders the modal and
 * dispatches importLegacy()/markSkipped() based on the user's choice.
 */
import { useState } from 'react';
import { useDictStore, markLegacyImportSkipped } from '../../store/dictStore';
import { useT } from '../../i18n/useT';
import { Button } from '../UI/Button';

interface Props {
  /** Counts shown to the user so they know what's about to be moved. */
  stats: { entries: number; sessions: number };
  onClose: () => void;
}

type Phase = 'idle' | 'importing' | 'done' | 'error';

export function LegacyImportDialog({ stats, onClose }: Props) {
  const importLegacy = useDictStore((s) => s.importLegacy);
  const { t } = useT();

  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<{
    entries: number;
    sessions: number;
    error?: string;
  } | null>(null);

  const handleImport = async () => {
    setPhase('importing');
    const r = await importLegacy();
    setResult(r);
    setPhase(r.error ? 'error' : 'done');
  };

  const handleSkip = () => {
    markLegacyImportSkipped();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center px-4"
      // Skip-via-backdrop only when not in the middle of importing.
      onClick={() => phase === 'idle' && handleSkip()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
      >
        <h2 className="text-base font-semibold text-stone-800">
          {t('importLegacyTitle')}
        </h2>

        {phase === 'done' && result ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              ✓{' '}
              {t('importLegacyDone', {
                entries: result.entries,
                sessions: result.sessions,
              })}
            </p>
            <div className="flex justify-end">
              <Button onClick={onClose}>{t('closeBtn')}</Button>
            </div>
          </div>
        ) : phase === 'error' && result?.error ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {t('importLegacyFailed', { msg: result.error })}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t('closeBtn')}
              </Button>
              <Button onClick={handleImport}>{t('importLegacyConfirm')}</Button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-stone-600 mt-3 leading-relaxed">
              {t('importLegacyBody', {
                entries: stats.entries,
                sessions: stats.sessions,
              })}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                size="md"
                onClick={handleSkip}
                disabled={phase === 'importing'}
              >
                {t('importLegacySkip')}
              </Button>
              <Button
                size="md"
                onClick={handleImport}
                disabled={phase === 'importing'}
              >
                {phase === 'importing'
                  ? t('importLegacyImporting')
                  : t('importLegacyConfirm')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
