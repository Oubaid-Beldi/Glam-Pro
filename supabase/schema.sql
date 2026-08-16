-- GLAM PRO — initial schema
-- Run once in the Supabase SQL editor (Project > SQL Editor > New query > paste > Run).
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS.

-- 1. profiles ---------------------------------------------------------------
-- Mirrors auth.users, one row per user, created automatically on signup.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text
);

alter table profiles enable row level security;

drop policy if exists "profiles: read own" on profiles;
create policy "profiles: read own" on profiles
  for select using (id = auth.uid());

drop policy if exists "profiles: update own" on profiles;
create policy "profiles: update own" on profiles
  for update using (id = auth.uid());

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. projects -----------------------------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table projects enable row level security;

drop policy if exists "projects: owner full access" on projects;
create policy "projects: owner full access" on projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 3. tasks ----------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  assignee text,
  due_date date,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;

drop policy if exists "tasks: owner full access" on tasks;
create policy "tasks: owner full access" on tasks
  for all using (
    exists (select 1 from projects p where p.id = tasks.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = tasks.project_id and p.owner_id = auth.uid())
  );

-- 4. notes ------------------------------------------------------------------
create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  content text,
  created_at timestamptz not null default now()
);

alter table notes enable row level security;

drop policy if exists "notes: owner full access" on notes;
create policy "notes: owner full access" on notes
  for all using (
    exists (select 1 from projects p where p.id = notes.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = notes.project_id and p.owner_id = auth.uid())
  );

-- 5. posts ------------------------------------------------------------------
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  objective text,
  ai_variants jsonb,
  content text,
  platform text not null default 'linkedin',
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'failed')),
  scheduled_at timestamptz,
  published_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

alter table posts enable row level security;

drop policy if exists "posts: owner full access" on posts;
create policy "posts: owner full access" on posts
  for all using (
    exists (select 1 from projects p where p.id = posts.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from projects p where p.id = posts.project_id and p.owner_id = auth.uid())
  );
