-- GLAM PRO — collaboration: project membership replaces single ownership.
-- Run once in the Supabase SQL editor (Project > SQL Editor > New query > paste > Run).
-- Wrapped in one transaction: it either fully applies or not at all.
-- Rollback: supabase/rollbacks/20261013120000_collaboration_rollback.sql
--
-- After this runs, authorization lives in exactly one place: project_members.
-- projects.owner_id is kept (insert check + which LinkedIn account the scheduler
-- publishes through) but no read/update/delete policy depends on it anymore.

begin;

-- 1. project_members --------------------------------------------------------
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_id_idx on public.project_members (user_id);
-- Exactly one owner row per project.
create unique index if not exists project_members_one_owner_idx
  on public.project_members (project_id) where role = 'owner';

alter table public.project_members enable row level security;

-- 2. project_invitations ----------------------------------------------------
create table if not exists public.project_invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Always stored lowercased + trimmed; enforced here, not just by the backend.
  email text not null check (email = lower(btrim(email)) and email <> ''),
  invited_by uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- A project can't have two pending invitations for the same email.
create unique index if not exists project_invitations_one_pending_idx
  on public.project_invitations (project_id, email) where status = 'pending';
create index if not exists project_invitations_pending_email_idx
  on public.project_invitations (email) where status = 'pending';

alter table public.project_invitations enable row level security;

-- 3. New columns (additive only — existing data is untouched) ----------------
alter table public.tasks
  add column if not exists created_by uuid default auth.uid() references public.profiles(id) on delete set null;
alter table public.tasks
  add column if not exists assignee_id uuid references public.profiles(id) on delete set null;
alter table public.notes
  add column if not exists created_by uuid default auth.uid() references public.profiles(id) on delete set null;
alter table public.posts
  add column if not exists created_by uuid default auth.uid() references public.profiles(id) on delete set null;

-- Teammates' avatars in the Members panel. Google puts the URL in user metadata;
-- copy it onto profiles so it's readable under the profiles RLS policy below.
alter table public.profiles add column if not exists avatar_url text;

-- Client inserts can't spoof attribution: a signed-in caller is always the creator.
-- (auth.uid() is null for the service-role backend, which may set it explicitly.)
create or replace function public.set_created_by()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_set_created_by on public.tasks;
create trigger tasks_set_created_by before insert on public.tasks
  for each row execute function public.set_created_by();
drop trigger if exists notes_set_created_by on public.notes;
create trigger notes_set_created_by before insert on public.notes
  for each row execute function public.set_created_by();
drop trigger if exists posts_set_created_by on public.posts;
create trigger posts_set_created_by before insert on public.posts
  for each row execute function public.set_created_by();

-- 4. Backfill ---------------------------------------------------------------
insert into public.project_members (project_id, user_id, role)
select id, owner_id, 'owner' from public.projects
on conflict (project_id, user_id) do update set role = 'owner';

update public.tasks t set created_by = p.owner_id
  from public.projects p where p.id = t.project_id and t.created_by is null;
update public.notes n set created_by = p.owner_id
  from public.projects p where p.id = n.project_id and n.created_by is null;
update public.posts po set created_by = p.owner_id
  from public.projects p where p.id = po.project_id and po.created_by is null;

update public.profiles pr
  set avatar_url = coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
  from auth.users u
  where u.id = pr.id and pr.avatar_url is null;

-- New signups get avatar_url too (same function as schema.sql, one extra column).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 5. Creating a project makes its creator the owner member -------------------
create or replace function public.handle_new_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do update set role = 'owner';
  return new;
end;
$$;

drop trigger if exists on_project_created on public.projects;
create trigger on_project_created after insert on public.projects
  for each row execute function public.handle_new_project();

-- owner_id decides whose LinkedIn account the scheduler publishes through, so it
-- must never change after creation (otherwise an owner could point a project's
-- scheduled posts at someone else's LinkedIn). Ownership transfer is out of scope.
create or replace function public.prevent_project_owner_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'projects.owner_id cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_owner_id_immutable on public.projects;
create trigger projects_owner_id_immutable before update of owner_id on public.projects
  for each row execute function public.prevent_project_owner_change();

-- 6. Helper functions --------------------------------------------------------
-- SECURITY DEFINER so they read project_members without going through its RLS —
-- that's what lets project_members' own policies use them without infinite recursion.
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.shares_project_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members mine
    join public.project_members theirs on theirs.project_id = mine.project_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

-- 7. RLS policies -------------------------------------------------------------

-- projects
drop policy if exists "projects: owner full access" on public.projects;
drop policy if exists "projects: members can read" on public.projects;
drop policy if exists "projects: creator can insert" on public.projects;
drop policy if exists "projects: owner can update" on public.projects;
drop policy if exists "projects: owner can delete" on public.projects;

create policy "projects: members can read" on public.projects
  for select using (public.is_project_member(id));
create policy "projects: creator can insert" on public.projects
  for insert with check (owner_id = auth.uid());
create policy "projects: owner can update" on public.projects
  for update using (public.is_project_owner(id)) with check (public.is_project_owner(id));
create policy "projects: owner can delete" on public.projects
  for delete using (public.is_project_owner(id));

-- tasks
drop policy if exists "tasks: owner full access" on public.tasks;
drop policy if exists "tasks: members full access" on public.tasks;
create policy "tasks: members full access" on public.tasks
  for all using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

-- notes
drop policy if exists "notes: owner full access" on public.notes;
drop policy if exists "notes: members full access" on public.notes;
create policy "notes: members full access" on public.notes
  for all using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

-- posts
drop policy if exists "posts: owner full access" on public.posts;
drop policy if exists "posts: members full access" on public.posts;
create policy "posts: members full access" on public.posts
  for all using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));

-- project_members: read your projects' member lists; leave (delete your own
-- non-owner row). No insert/update policy — those go through the backend.
drop policy if exists "project_members: members can read" on public.project_members;
drop policy if exists "project_members: member can leave" on public.project_members;
create policy "project_members: members can read" on public.project_members
  for select using (public.is_project_member(project_id));
create policy "project_members: member can leave" on public.project_members
  for delete using (user_id = auth.uid() and role <> 'owner');

-- project_invitations: owner sees their project's invitations; an invitee sees
-- pending invitations addressed to their own email. Writes go through the backend.
drop policy if exists "project_invitations: owner or invitee can read" on public.project_invitations;
create policy "project_invitations: owner or invitee can read" on public.project_invitations
  for select using (
    public.is_project_owner(project_id)
    or (status = 'pending' and email = lower(coalesce(auth.jwt() ->> 'email', '')))
  );

-- profiles: yourself + people you share at least one project with. Nothing wider.
drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: read own and teammates" on public.profiles;
create policy "profiles: read own and teammates" on public.profiles
  for select using (id = auth.uid() or public.shares_project_with(id));
-- "profiles: update own" from schema.sql is unchanged.

-- linkedin_accounts: deliberately NOT changed. Its policy stays
-- "owner_id = auth.uid()" — a token is only ever visible to its own user,
-- never to project teammates.

commit;

-- Verification (optional, run after the above): every policy now in place.
-- select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by tablename, policyname;
