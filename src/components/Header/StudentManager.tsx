/**
 * StudentManager — modal where a teacher CRUDs the list of managed-student
 * folders.  Triggered from StudentSwitcher's "Manage students…" entry.
 *
 * Layout:
 *   ┌─ Title + hint ───────────────────────────────────────┐
 *   │  Add row:  [name input] [Add]                         │
 *   │  ──────────                                           │
 *   │  Existing students (one row each):                    │
 *   │    name   [Rename]  [Delete]                          │
 *   │    (edit mode swaps in input + Save/Cancel)           │
 *   │  ──────────                                           │
 *   │  [Close]                                              │
 *   └───────────────────────────────────────────────────────┘
 *
 * Deletes use a JS confirm() prompt because the consequence (cascade
 * delete of all that student's entries+sessions) is destructive and
 * worth a beat of friction.
 */
import { useState } from 'react';
import { useDictStore } from '../../store/dictStore';
import { useT } from '../../i18n/useT';
import { Button } from '../UI/Button';
import type { ManagedStudent } from '../../auth/types';

interface Props {
  onClose: () => void;
}

export function StudentManager({ onClose }: Props) {
  const managedStudents = useDictStore((s) => s.managedStudents);
  const addManagedStudent = useDictStore((s) => s.addManagedStudent);
  const renameManagedStudent = useDictStore((s) => s.renameManagedStudent);
  const deleteManagedStudent = useDictStore((s) => s.deleteManagedStudent);
  const { t } = useT();

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    await addManagedStudent(name);
    setDraft('');
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center px-4 py-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="p-5 border-b border-stone-200">
          <h2 className="text-base font-semibold text-stone-800">
            {t('studentManagerTitle')}
          </h2>
          <p className="text-xs text-stone-500 mt-1 leading-relaxed">
            {t('studentManagerHint')}
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Add row */}
          <form onSubmit={handleAdd} className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs text-stone-600 mb-1">
                {t('addStudentLabel')}
              </label>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('addStudentPlaceholder')}
                disabled={busy}
                className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-stone-50"
              />
            </div>
            <Button type="submit" size="md" disabled={!draft.trim() || busy}>
              {t('addStudentBtn')}
            </Button>
          </form>

          {/* Existing rows */}
          <div className="border-t border-stone-100 pt-3">
            {managedStudents.length === 0 ? (
              <p className="text-sm text-stone-400 italic py-4 text-center">
                {t('studentEmpty')}
              </p>
            ) : (
              <ul className="space-y-1">
                {managedStudents.map((s) => (
                  <StudentRow
                    key={s.id}
                    student={s}
                    onRename={(name) => renameManagedStudent(s.id, name)}
                    onDelete={async () => {
                      if (
                        confirm(t('studentDeleteConfirm', { name: s.name }))
                      ) {
                        await deleteManagedStudent(s.id);
                      }
                    }}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-stone-200 flex justify-end">
          <Button variant="ghost" size="md" onClick={onClose}>
            {t('closeBtn')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StudentRow({
  student,
  onRename,
  onDelete,
}: {
  student: ManagedStudent;
  onRename: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(student.name);
  const [busy, setBusy] = useState(false);

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-1">
        <input
          autoFocus
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1 px-2 py-1 border border-stone-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <Button
          size="sm"
          disabled={!draft.trim() || draft.trim() === student.name || busy}
          onClick={async () => {
            const v = draft.trim();
            if (!v || v === student.name) {
              setEditing(false);
              return;
            }
            setBusy(true);
            await onRename(v);
            setBusy(false);
            setEditing(false);
          }}
        >
          {t('studentRowSave')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setDraft(student.name);
            setEditing(false);
          }}
        >
          {t('studentRowCancel')}
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-2 py-1">
      <span className="flex-1 text-sm text-stone-800 truncate">
        {student.name}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-stone-500 hover:text-stone-800 px-2 py-1"
      >
        {t('studentRowEdit')}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-red-600 hover:text-red-800 px-2 py-1"
      >
        {t('studentRowDelete')}
      </button>
    </li>
  );
}
