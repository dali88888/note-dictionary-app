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
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  useDictStore,
  type StudentSortKey,
} from '../../store/dictStore';
import { sortStudents } from '../../store/sortStudents';
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
  const studentSortKey = useDictStore((s) => s.prefs.studentSortKey);
  const studentSortDir = useDictStore((s) => s.prefs.studentSortDir);
  const setStudentSort = useDictStore((s) => s.setStudentSort);
  // `studentLastActivity` is populated by `loadStudentLastActivity()`
  // in the store, which runs at the end of every `hydrate()` AND
  // gets bumped inline by `persistNewEntryToCloud` on every successful
  // query.  We just read from the store — no local fetch, no per-
  // modal-open round-trip.  Critically, the same map drives the
  // StudentSwitcher dropdown, so both views always agree on order.
  const studentLastActivity = useDictStore((s) => s.studentLastActivity);
  const loadStudentLastActivity = useDictStore(
    (s) => s.loadStudentLastActivity,
  );
  const { t } = useT();

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  // Re-fetch the activity aggregate every time the modal opens.  The
  // store version was loaded at hydrate time and bumped on each
  // query, but the user might have opened the modal hours later and
  // wants a fresh view (especially if they were in a different
  // student folder for a while).  Cheap one-shot query; gracefully
  // degrades (activity-sort falls back to created-sort) on failure.
  useEffect(() => {
    void loadStudentLastActivity();
  }, [loadStudentLastActivity]);

  // ── Sorted view of the student list ─────────────────────────────
  //
  // Driven by the shared sortStudents() helper so the order shown
  // here ALWAYS matches the order shown by the StudentSwitcher
  // dropdown.  Three modes mirror Windows folder views: name /
  // created / activity (last query time per folder).  See
  // src/store/sortStudents.ts for the comparator details.
  const sortedStudents = useMemo(
    () =>
      sortStudents(
        managedStudents,
        studentLastActivity,
        studentSortKey,
        studentSortDir,
      ),
    [managedStudents, studentLastActivity, studentSortKey, studentSortDir],
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    await addManagedStudent(name);
    setDraft('');
    setBusy(false);
  };

  // Render the modal via a portal to <body> so its `position: fixed`
  // is positioned against the viewport, NOT against any ancestor that
  // happens to have `backdrop-filter` / `transform` / `filter` /
  // `will-change` / `contain` set — any of those create a containing
  // block for fixed descendants.  TopBar uses `backdrop-blur`, which
  // is exactly such a property, and StudentManager renders inside
  // TopBar's tree (via StudentSwitcher).  Without this portal the
  // modal would be anchored to the ~50 px tall TopBar instead of the
  // full viewport, and `flex items-center` would center it inside
  // that tiny strip — placing the input field unreachably high above
  // the rest of the page.  This is the bug the user reported as
  // "input box appears too high, can't type".
  const modal = (
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
                autoFocus
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

          {/* Sort controls — shown only when there are at least 2
              students, since 0–1 entries don't need ordering. */}
          {managedStudents.length >= 2 && (
            <div className="flex items-center gap-2 text-xs text-stone-500 border-t border-stone-100 pt-3">
              <label htmlFor="student-sort-key" className="whitespace-nowrap">
                {t('studentSortLabel')}
              </label>
              <select
                id="student-sort-key"
                value={studentSortKey}
                onChange={(e) =>
                  setStudentSort(
                    e.target.value as StudentSortKey,
                    studentSortDir,
                  )
                }
                className="text-xs border border-stone-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="name">{t('studentSortByName')}</option>
                <option value="created">{t('studentSortByCreated')}</option>
                <option value="activity">{t('studentSortByActivity')}</option>
              </select>
              {/* Direction toggle: ↑ ascending / ↓ descending.  Click
                  flips it.  Title hints at what each direction means
                  for the currently-selected key (e.g. "A → Z" for name
                  vs "Oldest first" for created/activity). */}
              <button
                type="button"
                onClick={() =>
                  setStudentSort(
                    studentSortKey,
                    studentSortDir === 'asc' ? 'desc' : 'asc',
                  )
                }
                className="px-2 py-1 border border-stone-300 rounded text-stone-600 hover:bg-stone-50"
                title={t(
                  studentSortDir === 'asc'
                    ? 'studentSortDirAscTooltip'
                    : 'studentSortDirDescTooltip',
                )}
                aria-label={t(
                  studentSortDir === 'asc'
                    ? 'studentSortDirAscTooltip'
                    : 'studentSortDirDescTooltip',
                )}
              >
                {studentSortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          )}

          {/* Existing rows */}
          <div
            className={
              managedStudents.length >= 2
                ? 'pt-1'
                : 'border-t border-stone-100 pt-3'
            }
          >
            {managedStudents.length === 0 ? (
              <p className="text-sm text-stone-400 italic py-4 text-center">
                {t('studentEmpty')}
              </p>
            ) : (
              <ul className="space-y-1">
                {sortedStudents.map((s) => (
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

  return createPortal(modal, document.body);
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
