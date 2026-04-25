/** A user's role in the app.  Determines which UI affordances they see. */
export type UserRole = 'teacher' | 'student';

/** Mirrors the public.profiles row in Supabase. */
export interface Profile {
  user_id: string;
  display_name: string;
  role: UserRole;
  created_at: string;
}

/** Mirrors public.managed_students.  Only meaningful when role === 'teacher'. */
export interface ManagedStudent {
  id: string;
  teacher_id: string;
  name: string;
  created_at: string;
}
