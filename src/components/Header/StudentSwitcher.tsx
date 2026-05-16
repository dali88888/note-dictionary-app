/**
 * StudentSwitcher — TopBar dropdown that lets a teacher choose which
 * "student folder" the current queries should belong to.
 *
 * Visible only when profile.role === 'teacher'.  Renders a chip showing
 * the active context (Myself / 学生张三) plus a menu with:
 *   • all managed-student folders
 *   • a "Manage students…" entry that opens StudentManager
 *
 * The store's setCurrentManagedStudent triggers a re-hydrate, so picking
 * a student instantly swaps the entries+sessions visible in the rest of
 * the UI.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { useDictStore } from '../../store/dictStore';
import { sortStudents } from '../../store/sortStudents';
import { useT } from '../../i18n/useT';
import { StudentManager } from './StudentManager';

export function StudentSwitcher() {
  const { profile } = useAuth();
  const { t } = useT();
  const managedStudents = useDictStore((s) => s.managedStudents);
  const currentManagedStudentId = useDictStore((s) => s.currentManagedStudentId);
  const setCurrentManagedStudent = useDictStore((s) => s.setCurrentManagedStudent);
  // Mirror the sort key/dir the teacher picked in the StudentManager
  // modal so the dropdown and the modal always show the same order.
  // Prior to this, the dropdown was stuck at hydrate-order (created
  // ascending) while the modal honored the user's pref — confusing UX.
  const studentSortKey = useDictStore((s) => s.prefs.studentSortKey);
  const studentSortDir = useDictStore((s) => s.prefs.studentSortDir);
  const studentLastActivity = useDictStore((s) => s.studentLastActivity);

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

  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (profile?.role !== 'teacher') return null;

  const currentStudent = currentManagedStudentId
    ? managedStudents.find((s) => s.id === currentManagedStudentId)
    : null;

  const chipLabel = currentStudent
    ? t('contextStudent', { name: currentStudent.name })
    : t('contextSelf');

  // Use a different color when in a student context — visually warns the
  // teacher that queries here will belong to the student, not them.
  const chipColor = currentStudent
    ? 'bg-violet-100 text-violet-800 hover:bg-violet-200'
    : 'bg-stone-100 text-stone-700 hover:bg-stone-200';

  return (
    <>
      <div ref={wrapperRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${chipColor}`}
        >
          {/* The "Context" prefix label has been removed per the user's
              spec — the chip now just reads "Student: <name>" or "Myself"
              and lets the visual styling (color + chevron) carry the
              "this is a context selector" meaning. */}
          <span className="max-w-[10rem] truncate">{chipLabel}</span>
          <svg
            className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 12 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M1 1.5L6 6.5L11 1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 mt-1 w-60 bg-white border border-stone-200 rounded-md shadow-lg z-20 py-1">
            <MenuItem
              active={currentManagedStudentId === null}
              label={t('contextSelf')}
              onClick={() => {
                setOpen(false);
                if (currentManagedStudentId !== null) {
                  void setCurrentManagedStudent(null);
                }
              }}
            />
            {sortedStudents.length > 0 && (
              <div className="my-1 border-t border-stone-100" />
            )}
            {sortedStudents.map((s) => (
              <MenuItem
                key={s.id}
                active={currentManagedStudentId === s.id}
                label={s.name}
                onClick={() => {
                  setOpen(false);
                  if (currentManagedStudentId !== s.id) {
                    void setCurrentManagedStudent(s.id);
                  }
                }}
              />
            ))}
            <div className="my-1 border-t border-stone-100" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setManagerOpen(true);
              }}
              className="w-full text-left px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50 flex items-center gap-2"
            >
              <span>⚙</span>
              <span>{t('manageStudentsBtn')}</span>
            </button>
          </div>
        )}
      </div>

      {managerOpen && <StudentManager onClose={() => setManagerOpen(false)} />}
    </>
  );
}

function MenuItem({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
        active
          ? 'bg-amber-50 text-amber-900 font-medium'
          : 'text-stone-700 hover:bg-stone-50'
      }`}
    >
      <span className={`w-3 ${active ? 'visible' : 'invisible'}`}>✓</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
