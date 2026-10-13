-- GLAM PRO — rollback for supabase/migrations/20261013120000_collaboration.sql
-- Restores single-owner RLS exactly as supabase/schema.sql defined it.
--
-- DESTRUCTIVE: drops project_members and project_invitations (all memberships and
-- invitations are lost) and the created_by / assignee_id / avatar_url columns.
-- Teammates immediately lose access to projects they don't own.
--
-- The frontend from the collaboration work queries project_members/project_invitations;
-- after rolling back the database, also revert the app to the last pre-collaboration
-- commit (or the Members panel and project switcher will show errors).

begin;

-- 1. Policies back to owner-only --------------------------------------------
drop policy if exists "projects: members can read" on public.projects;
drop policy if exists "projects: creator can insert" on public.projects;
drop policy if exists "projects: owner can update" on public.projects;
drop policy if exists "projects: owner can delete" on public.projects;
drop policy if exists "projects: owner full access" on public.projects;
create policy "projects: owner full access" on public.projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "tasks: members full access" on public.tasks;
drop policy if exists "tasks: owner full access" on public.tasks;
create policy "tasks: owner full access" on public.tasks
  for all using (
    exists (select 1 from public.projects p where p.id = tasks.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = tasks.project_id and p.owner_id = auth.uid())
  );

drop policy if exists "notes: members full access" on public.notes;
drop policy if exists "notes: owner full access" on public.notes;
create policy "notes: owner full access" on public.notes
  for all using (
    exists (select 1 from public.projects p where p.id = notes.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = notes.project_id and p.owner_id = auth.uid())
  );

drop policy if exists "posts: members full access" on public.posts;
drop policy if exists "posts: owner full access" on public.posts;
create policy "posts: owner full access" on public.posts
  for all using (
    exists (select 1 from public.projects p where p.id = posts.project_id and p.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p where p.id = posts.project_id and p.owner_id = auth.uid())
  );

drop policy if exists "profiles: read own and teammates" on public.profiles;
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (id = auth.uid());

-- linkedin_accounts was never changed by the migration — nothing to restore.

-- 2. Triggers and functions -------------------------------------------------
drop trigger if exists on_project_created on public.projects;
drop trigger if exists projects_owner_id_immutable on public.projects;
drop trigger if exists tasks_set_created_by on public.tasks;
drop trigger if exists notes_set_created_by on public.notes;
drop trigger if exists posts_set_created_by on public.posts;

drop function if exists public.handle_new_project();
drop function if exists public.prevent_project_owner_change();
drop function if exists public.set_created_by();

-- Original handle_new_user (no avatar_url), before the column is dropped below.
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

-- 3. Tables (policies on them go with them) ----------------------------------
drop table if exists public.project_invitations;
drop table if exists public.project_members;

-- Helpers last: nothing references them once the policies above are gone.
drop function if exists public.is_project_member(uuid);
drop function if exists public.is_project_owner(uuid);
drop function if exists public.shares_project_with(uuid);

-- 4. Columns ----------------------------------------------------------------
alter table public.tasks drop column if exists created_by;
alter table public.tasks drop column if exists assignee_id;
alter table public.notes drop column if exists created_by;
alter table public.posts drop column if exists created_by;
alter table public.profiles drop column if exists avatar_url;

commit;
