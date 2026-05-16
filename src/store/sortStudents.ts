/**
 * Shared comparator for the teacher's managed-student list.
 *
 * Used by:
 *   • StudentManager modal (Manage student folders → the list of rows)
 *   • StudentSwitcher dropdown (top-bar "Student:" chip)
 *
 * Single source of truth so the order shown in one place ALWAYS matches
 * the order shown in the other.  Prior to this extraction, the
 * StudentManager sorted by `prefs.studentSortKey/Dir` while the
 * dropdown showed raw hydrate-order (created_at asc) — the user had
 * no way to make the two views match.
 *
 * Pure function: no I/O, no React, no Zustand.  Easy to unit-test
 * (`sortStudents.test.ts`).
 */
import type { ManagedStudent } from '../auth/types';
import type { StudentSortKey, StudentSortDir } from './dictStore';

/**
 * Returns a new array, sorted per (sortKey, sortDir).  Original input
 * is not mutated.  Activity sort consults `lastActivity` (entry-id
 * keyed map of last `queried_at` in ms); folders missing from that
 * map fall back to their own `created_at` so they sort to the bottom
 * of an activity-desc view rather than disappearing.
 */
export function sortStudents(
  students: readonly ManagedStudent[],
  lastActivity: Readonly<Record<string, number>>,
  sortKey: StudentSortKey,
  sortDir: StudentSortDir,
): ManagedStudent[] {
  const arr = students.slice();
  arr.sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') {
      // localeCompare with sensitivity:'base' so case + accent
      // differences don't split otherwise-equal names; "anna" and
      // "Anna" sort together.
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    } else if (sortKey === 'created') {
      cmp =
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    } else {
      // activity
      const aLast =
        lastActivity[a.id] ?? new Date(a.created_at).getTime();
      const bLast =
        lastActivity[b.id] ?? new Date(b.created_at).getTime();
      cmp = aLast - bLast;
    }
    // Stable tiebreaker so equal sort keys (two students added in the
    // same millisecond, or two folders with no entries sharing only
    // their created_at) don't shuffle unpredictably across renders.
    if (cmp === 0) cmp = a.id.localeCompare(b.id);
    return sortDir === 'asc' ? cmp : -cmp;
  });
  return arr;
}
