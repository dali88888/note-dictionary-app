/**
 * Regression tests for sortStudents().  This comparator drives BOTH
 * the StudentManager modal AND the StudentSwitcher dropdown — they
 * must always show the same order.  If anyone "simplifies" one of
 * the call sites to bypass this helper, the order will desync and
 * users will see one ordering in the modal and a different ordering
 * in the dropdown chip — exactly the bug this change fixed.
 */
import { describe, expect, it } from 'vitest';
import { sortStudents } from './sortStudents';
import type { ManagedStudent } from '../auth/types';

const T_BASE = 1_700_000_000_000;

function makeStudent(
  id: string,
  name: string,
  createdAt: string,
): ManagedStudent {
  return { id, teacher_id: 't-1', name, created_at: createdAt };
}

const STUDENTS = [
  makeStudent('s-jonas', 'Jonas', '2026-01-01T00:00:00Z'),
  makeStudent('s-anna', 'Anna', '2026-03-15T00:00:00Z'),
  makeStudent('s-mads', 'Mads', '2026-02-01T00:00:00Z'),
  makeStudent('s-z', 'Z. Newest', '2026-04-01T00:00:00Z'),
];

// Activity timestamps: Anna had a class most recently, Jonas earlier,
// Mads no activity (will fall back to created_at), Z newest has none.
const ACTIVITY = {
  's-anna': T_BASE + 3_000,
  's-jonas': T_BASE + 1_000,
};

describe('sortStudents', () => {
  it('name asc orders alphabetically (locale-aware, case-insensitive)', () => {
    const sorted = sortStudents(STUDENTS, ACTIVITY, 'name', 'asc');
    expect(sorted.map((s) => s.name)).toEqual([
      'Anna',
      'Jonas',
      'Mads',
      'Z. Newest',
    ]);
  });

  it('name desc reverses the alphabetical order', () => {
    const sorted = sortStudents(STUDENTS, ACTIVITY, 'name', 'desc');
    expect(sorted.map((s) => s.name)).toEqual([
      'Z. Newest',
      'Mads',
      'Jonas',
      'Anna',
    ]);
  });

  it('created asc puts oldest folder first', () => {
    const sorted = sortStudents(STUDENTS, ACTIVITY, 'created', 'asc');
    expect(sorted.map((s) => s.name)).toEqual([
      'Jonas',
      'Mads',
      'Anna',
      'Z. Newest',
    ]);
  });

  it('created desc puts newest folder first', () => {
    const sorted = sortStudents(STUDENTS, ACTIVITY, 'created', 'desc');
    expect(sorted.map((s) => s.name)).toEqual([
      'Z. Newest',
      'Anna',
      'Mads',
      'Jonas',
    ]);
  });

  it('activity desc puts most-recently-active first; folders with no activity fall back to created_at', () => {
    const sorted = sortStudents(STUDENTS, ACTIVITY, 'activity', 'desc');
    // Effective activity timestamp per student:
    //   Jonas: ACTIVITY['s-jonas'] = T_BASE + 1000 (≈ Nov 2023)
    //   Anna:  ACTIVITY['s-anna']  = T_BASE + 3000 (≈ Nov 2023, 2s later than Jonas)
    //   Mads:  no entry in ACTIVITY → fallback to created_at = 2026-02-01
    //   Z:     no entry in ACTIVITY → fallback to created_at = 2026-04-01
    //
    // Descending order (newest first):
    //   Z (2026-04-01) > Mads (2026-02-01) > Anna (2023, slightly later)
    //   > Jonas (2023, slightly earlier).
    //
    // The fallback semantics ("newly-created but no entries yet"
    // sorts as if 'last touched at creation time') intentionally
    // pushes brand-new empty folders to the top under desc-activity —
    // matches the teacher's mental model of "this folder was last
    // touched when I made it".
    expect(sorted.map((s) => s.name)).toEqual([
      'Z. Newest',
      'Mads',
      'Anna',
      'Jonas',
    ]);
  });

  it('activity asc reverses the activity ordering', () => {
    const sorted = sortStudents(STUDENTS, ACTIVITY, 'activity', 'asc');
    // Same effective timestamps as the desc test above; ASC reverses.
    expect(sorted.map((s) => s.name)).toEqual([
      'Jonas',
      'Anna',
      'Mads',
      'Z. Newest',
    ]);
  });

  it('is stable when sort key + tiebreaker yield equal values (id is the final tiebreaker)', () => {
    const a = makeStudent('s-a', 'Alex', '2026-01-01T00:00:00Z');
    const b = makeStudent('s-b', 'Alex', '2026-01-01T00:00:00Z');
    const c = makeStudent('s-c', 'Alex', '2026-01-01T00:00:00Z');
    const all = [c, a, b]; // input in scrambled order
    const sorted = sortStudents(all, {}, 'name', 'asc');
    // All names equal → tiebreaker by id, ascending.
    expect(sorted.map((s) => s.id)).toEqual(['s-a', 's-b', 's-c']);
  });

  it('does not mutate the input array', () => {
    const original = [...STUDENTS];
    sortStudents(original, ACTIVITY, 'name', 'desc');
    expect(original).toEqual(STUDENTS);
  });

  it('returns an empty array for an empty input', () => {
    expect(sortStudents([], {}, 'name', 'asc')).toEqual([]);
  });
});
