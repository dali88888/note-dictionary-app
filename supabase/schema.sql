-- ─────────────────────────────────────────────────────────────────────────
-- note-dictionary · Supabase schema (v1)
--
-- Apply once in Supabase SQL Editor.  Idempotent: safe to re-run; uses
-- IF NOT EXISTS / OR REPLACE so re-applying is a no-op when nothing changed.
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────── tables ───────────

-- One row per authenticated user.  display_name + role are captured at signup
-- (passed via auth.users.raw_user_meta_data) and copied here by the trigger
-- below.
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role         text not null check (role in ('teacher', 'student')) default 'student',
  created_at   timestamptz not null default now()
);

-- Teacher-managed student "sub-folders": each represents an actual learner
-- whose lookups the teacher curates.  The student does NOT log in directly
-- in v1 — teachers manage these on the student's behalf.
create table if not exists public.managed_students (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(user_id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

-- Dictionary entries.  managed_student_id NULL ⇒ entry belongs to the
-- owner themselves; non-NULL ⇒ entry belongs to that managed student
-- (and the owner is the teacher who manages them).
create table if not exists public.entries (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null references public.profiles(user_id) on delete cascade,
  managed_student_id  uuid references public.managed_students(id) on delete cascade,
  word                text not null,
  direction           text not null check (direction in ('zh-to-other','other-to-zh')),
  language            text not null,
  word_syllables      jsonb not null,
  meanings            jsonb not null,
  queried_at          timestamptz not null default now()
);

create index if not exists entries_owner_idx
  on public.entries (owner_user_id, managed_student_id, queried_at desc);

-- Class sessions: same ownership semantics as entries.
create table if not exists public.class_sessions (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid not null references public.profiles(user_id) on delete cascade,
  managed_student_id  uuid references public.managed_students(id) on delete cascade,
  name                text not null,
  kind                text not null check (kind in ('auto','manual')),
  created_at          timestamptz not null default now(),
  ended_at            timestamptz
);

create index if not exists class_sessions_owner_idx
  on public.class_sessions (owner_user_id, managed_student_id, created_at desc);

-- Many-to-many: an entry can belong to both an auto session (today's date)
-- AND a manual session (the active class), simultaneously.
create table if not exists public.session_entries (
  session_id uuid not null references public.class_sessions(id) on delete cascade,
  entry_id   uuid not null references public.entries(id) on delete cascade,
  primary key (session_id, entry_id)
);

-- ─────────── trigger: auto-create profile on signup ───────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────── row-level security ───────────

alter table public.profiles         enable row level security;
alter table public.managed_students enable row level security;
alter table public.entries          enable row level security;
alter table public.class_sessions   enable row level security;
alter table public.session_entries  enable row level security;

-- Drop any existing policies (so re-running this script doesn't error).
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles','managed_students','entries','class_sessions','session_entries')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- profiles: a user reads + writes only their own row.
create policy profiles_self_read   on public.profiles for select using (user_id = auth.uid());
create policy profiles_self_insert on public.profiles for insert with check (user_id = auth.uid());
create policy profiles_self_update on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- managed_students: only the owning teacher.
create policy ms_owner_all on public.managed_students for all
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- entries: only the owner_user_id user.
create policy entries_owner_all on public.entries for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- class_sessions: only the owner.
create policy sessions_owner_all on public.class_sessions for all
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- session_entries: indirect — joined via class_sessions ownership.
create policy session_entries_owner_all on public.session_entries for all
  using (
    exists (
      select 1 from public.class_sessions s
      where s.id = session_id and s.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.class_sessions s
      where s.id = session_id and s.owner_user_id = auth.uid()
    )
  );
