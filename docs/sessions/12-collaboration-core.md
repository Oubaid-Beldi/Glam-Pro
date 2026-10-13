# Session 12 — Collaboration core

**Date:** 2026-10-13
**Live URL:** https://glampro.netlify.app/

> **Numbering note:** the brief for this session said sessions 1–11 were done, but the repo only contains `01`–`10` and CLAUDE.md's session log stopped at 10. This file is numbered 12 as instructed; if a session 11 happened, its notes were never committed.

## Why

The graders tested the app and said it was missing user collaboration — several users must be able to work on the same project. Until now that was explicitly cut ("multi-member roles/invites" in `docs/PLAN.md`) and every RLS policy assumed one owner per project. This session replaced single ownership with **project membership**. It rewrote the security rules on every table, so it was done in phases, keeping the live app working after each one.

Decisions taken as given (from the brief, not re-derived): two roles, `owner` and `member`; invite by email (existing profile → added immediately, unknown email → pending invitation claimed on first Google sign-in with a matching verified email); no invitation emails; authorization lives only in `project_members` — `projects.owner_id` stays but authorizes nothing.

## Phase 1 — Data model and security

No migration convention existed (only `supabase/schema.sql`, run by hand in session 1), so this session started one:

- **Migration:** `supabase/migrations/20261013120000_collaboration.sql` — one `begin … commit` transaction, run by the user in the Supabase SQL editor.
- **Rollback:** `supabase/rollbacks/20261013120000_collaboration_rollback.sql` — kept outside `migrations/` so no tooling ever applies it by accident. Destructive: drops both new tables and the new columns, restores the exact owner-only policies from `schema.sql`. Roll back the frontend to before `96f2210` too, or the Team panel/project switcher will error.
- `supabase/schema.sql` got a header comment pointing at `migrations/`.

What the migration does:

1. `project_members (project_id, user_id, role, created_at)`, pk `(project_id, user_id)`, both FKs `on delete cascade`. Plus a partial unique index allowing **exactly one owner row per project**, and an index on `user_id`.
2. `project_invitations (id, project_id, email, invited_by, status, created_at, accepted_at)`. A check constraint enforces `email = lower(btrim(email))` at the database level, and a partial unique index on `(project_id, email) where status = 'pending'` stops duplicate pending invites.
3. `created_by uuid default auth.uid()` on tasks/notes/posts, `assignee_id` (nullable) on tasks. The free-text `assignee` column is untouched. Session 13 builds the UI for these.
4. Backfill: an owner row in `project_members` for every existing project (from `owner_id`); `created_by` on existing tasks/notes/posts set to their project's owner.
5. Trigger `on_project_created` (AFTER INSERT on projects, SECURITY DEFINER) inserts the creator as `owner`.
6. Helpers, all `SECURITY DEFINER`, `stable`, `set search_path = public`: `is_project_member(project_id)`, `is_project_owner(project_id)`, `shares_project_with(user_id)`. Every policy below uses them; no policy on `project_members` queries `project_members` directly, which is what avoids infinite recursion.
7. RLS rewritten (exact list below).

**Additions beyond the brief, and why:**

- **`profiles.avatar_url`** — the Team panel needs teammates' avatars, and profiles had no avatar column (the top bar reads the *current* user's avatar from their own auth metadata, which isn't available for other users). Backfilled from `auth.users.raw_user_meta_data` (`avatar_url`, falling back to `picture`), and `handle_new_user()` now sets it at signup.
- **`projects.owner_id` is immutable** (trigger `projects_owner_id_immutable` raises on change). The scheduler publishes each due post through the LinkedIn account of `projects.owner_id`. With owner-update RLS alone, an owner could have set `owner_id` to another user's id and published to *their* LinkedIn. The old policy's `with check (owner_id = auth.uid())` used to prevent this by accident; the trigger now does it on purpose. Ownership transfer is therefore out of scope until someone revisits the scheduler.
- **`created_by` is forced by a BEFORE INSERT trigger** (`set_created_by`) to `auth.uid()` whenever there is a signed-in caller, so a member can't attribute their rows to someone else. The service-role backend (`auth.uid()` null) can still set it explicitly.

### Exact RLS policy list after this session

| Table | Policy | Command | Rule |
|---|---|---|---|
| projects | `projects: members can read` | SELECT | `is_project_member(id)` |
| projects | `projects: creator can insert` | INSERT | check `owner_id = auth.uid()` |
| projects | `projects: owner can update` | UPDATE | using + check `is_project_owner(id)` |
| projects | `projects: owner can delete` | DELETE | `is_project_owner(id)` |
| tasks | `tasks: members full access` | ALL | using + check `is_project_member(project_id)` |
| notes | `notes: members full access` | ALL | using + check `is_project_member(project_id)` |
| posts | `posts: members full access` | ALL | using + check `is_project_member(project_id)` |
| project_members | `project_members: members can read` | SELECT | `is_project_member(project_id)` |
| project_members | `project_members: member can leave` | DELETE | `user_id = auth.uid() and role <> 'owner'` |
| project_invitations | `project_invitations: owner or invitee can read` | SELECT | `is_project_owner(project_id) or (status = 'pending' and email = lower(auth.jwt() ->> 'email'))` |
| profiles | `profiles: read own and teammates` | SELECT | `id = auth.uid() or shares_project_with(id)` |
| profiles | `profiles: update own` | UPDATE | `id = auth.uid()` (unchanged from session 1) |
| linkedin_accounts | `linkedin_accounts: owner full access` | ALL | `owner_id = auth.uid()` (deliberately unchanged — a token is never visible to teammates) |

Dropped: `projects: owner full access`, `tasks/notes/posts: owner full access`, `profiles: read own`. No INSERT/UPDATE policy exists on `project_members` or any write policy on `project_invitations`; those writes only happen through the backend (service role).

The user ran the migration and confirmed the resulting `pg_policies` listing (screenshot). Afterwards an anonymous REST probe of every table, including the new columns, returned `200 []` — no errors from the helper functions for unauthenticated callers.

### Frontend fix required by Phase 1

There was **no** `.eq('owner_id', …)` filter anywhere in the frontend — `projects-context.tsx` already let RLS decide since session 2. A different problem would have broken things, though: `createProject` used `insert(...).select().single()`. Postgres checks an `INSERT … RETURNING` row against the SELECT policy (`is_project_member(id)`) during the insert, **before** the AFTER INSERT trigger has added the owner row, so the call would have failed with an RLS error. `createProject` now generates the id client-side (`crypto.randomUUID()`), inserts without RETURNING, then reads the row back in a separate query. That works under both the old and new policies, so it was safe to ship first.

## Phase 2 — Backend (session 7 layering)

- `server/middleware/require-auth.ts` — new. Reads `Authorization: Bearer`, verifies via `server/services/auth.service.ts` (`supabase.auth.getUser()`), attaches `req.authUser = { id, email, emailVerified }` (type augmentation in `server/types/auth.types.ts`). **Deviation:** the brief said unauthenticated requests go "through the existing error-handler" — there isn't one in this codebase. The middleware answers 401 itself, in the same `{ error }` JSON shape every controller already uses. Adding a global error handler just for this would have changed nothing visible.
- **Existing routes were not moved onto the middleware.** The brief said to add it "if existing routes don't verify the caller yet". They already do: posts, voice, and LinkedIn status each verify the bearer token inside their service (sessions 5/8/9), and `posts.service.ts` checks project access with a user-scoped client, so RLS (now membership-based) lets members generate posts for shared projects. Double-wrapping them would only add a second `getUser` round trip. Migrating them is optional cleanup.
- `server/routes/members.routes.ts`, `server/controllers/members.controller.ts` (zod schemas: uuid params, `email` trimmed + lowercased + validated), `server/services/members.service.ts`, `server/types/members.types.ts`, mounted under `/api` in `netlify/functions/api.ts`:
  - `POST /api/projects/:projectId/invitations` `{ email }` — owner only. Existing profile (case-insensitive `ilike`, with `%`/`_` escaped so they aren't wildcards) not yet a member → inserted as `member`, invitation recorded as `accepted` (an older pending one for the same email is accepted instead of duplicated). Already a member → 409. Unknown email → pending invitation (a duplicate pending invite → 409).
  - `DELETE /api/projects/:projectId/invitations/:invitationId` — owner only, pending only (else 409) → `revoked`. 204.
  - `DELETE /api/projects/:projectId/members/:userId` — the owner can remove anyone except the owner row; a member can remove only themselves. 204.
  - `POST /api/invitations/claim` — email from the verified token only, and only if Supabase marks it confirmed (`email_confirmed_at`, always set for Google). Converts every matching pending invitation into membership, marks it accepted, returns `{ joined: [{ projectId, projectName }] }` (newly joined projects only). Idempotent.
  - Status mapping: `bad_request` 400, `not_found` 404 (also used when the caller isn't in the project at all, so a non-member can't probe which project ids exist), `forbidden` 403, `conflict` 409, `config_error`/`db_error` 500.
- `assertMember` / `assertOwner` in `members.service.ts` are the real authorization for these writes, because the backend uses the service-role client and bypasses RLS. Like the policies, they read only `project_members`, never `projects.owner_id`.
- **Tests:** Vitest (`npm test` → `vitest run`, `vitest.config.ts` scoped to `server/**/*.test.ts`) with an in-memory Supabase query-builder fake (`server/test/fake-supabase.ts`) swapped in via `vi.mock` of `createAdminClient`. 17 tests in `server/services/members.service.test.ts`: the owner can invite (email normalized); a non-owner member is rejected (403) and an outsider gets 404; an existing user is added directly with an accepted invitation record; unknown email → pending; duplicate pending → 409; existing member → 409; email wildcards don't match; the owner revokes / a non-owner can't revoke; the owner can't be removed (by self or by a member); the owner removes a member; a member leaves; a member can't remove another member; claim converts only pending invitations matching the caller's email (ignores other emails and revoked ones); unverified email claims nothing; claim is idempotent. All pass.
- New dependencies: `zod` (^4.6.7), `vitest` (^5.0.4, dev). Both were explicitly requested; CLAUDE.md had previously noted neither existed.

## Phase 3 — Frontend

- **Team panel on the Projects page** (`src/components/MembersPanel.tsx`), shown below the project grid for the active project. **Why the Projects page and not a "Team" tab:** the app has no per-project detail route — the active project is chosen and managed on `/projects`, so putting its team there needs no new route, no tab component, and no new navigation concept. It also mirrors how every other page works on "the active project".
  - Everyone sees the members (avatar, name + "(you)", email, Owner/Member badge).
  - The owner also sees: an invite-by-email form (with a note that no email is sent and the teammate must sign in with that Google account), the result message ("X was added" vs "Invitation saved…"), pending invitations with a revoke button, and a remove button on each non-owner member. Revoke/remove use `window.confirm` (same pattern as Tasks/Notes delete).
  - Non-owners see "Owned by <name>" and a **Leave project** button; leaving refreshes the project list (the active project falls back to the first remaining one).
- `src/lib/use-project-members.ts` — reads are direct RLS-scoped queries (`project_members` + embedded `profiles`; `project_invitations` only if the caller is the owner); writes go through `src/lib/api.ts`'s new `apiFetch` helper, which attaches the current session's access token to every `/api` call.
- `projects-context.tsx` now selects `*, project_members(user_id, role, profiles(name, email))` and derives `my_role` and `owner_name` for each project — from membership, not `owner_id`.
- **Claim after sign-in:** once per app load per signed-in user (a `useRef` guard, which also survives StrictMode's double effect), `ProjectsProvider` calls `POST /api/invitations/claim`. If anything was joined it refreshes the project list and shows a toast per project: "You've been added to <project>". Toasts use shadcn's **Sonner** component (`src/components/ui/sonner.tsx`, `<Toaster position="top-center" />` in `App.tsx`). The generated component imported `next-themes` for dark mode; the app is light-only, so it was pinned to `theme="light"` and `next-themes` uninstalled.
- **Project switcher** (`TopBar`): a teal "Shared" badge on projects you don't own (the hover title shows "Owner: <name>"); project cards on `/projects` show "Shared · Owner: <name>".
- **Owner-only controls hidden from members:** invite form, pending invitations, remove buttons. Rename/delete project never existed in the UI (RLS already restricts both to the owner if they're added later).
- **Marketing:** for a shared project, the LinkedIn card tells the member that scheduled posts publish to the owner's LinkedIn, not theirs (see Known issues).

## Deploys (credit budget)

Four pushes instead of the planned 2–3 — one was a self-inflicted mistake:

1. `99ecb8d` + `78d02ac` — Phase 1 code, plus a `netlify.toml` `ignore` rule meant to skip builds for docs-only pushes (`git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF -- . ':(exclude)docs' ':(exclude)CLAUDE.md'`). **It backfired:** Netlify cancelled this build with "Canceled build due to no content change", even though `src/` had changed — most likely because `$CACHED_COMMIT_REF` was empty, which turns the command into a comparison against the working tree. The live site was left on the old frontend with the migration already applied, so live "Create project" was broken until the next push.
2. `d0c33d5` — reverted the ignore rule (net zero diff to `netlify.toml`), deployed Phase 1 within seconds. Confirmed the live bundle changed. **Lesson recorded in CLAUDE.md:** don't use a `$CACHED_COMMIT_REF`-based ignore rule here.
3. `96f2210` + `99d92a1` — Phase 2 + Phase 3.
4. This docs commit (CLAUDE.md, `docs/plan.md`, this file — docs only, still a full deploy since the ignore rule was reverted).

## Verification performed

- `npm run build`, `npm run typecheck:server`, `npm test` (17/17) — clean. `npm run lint` — the same 4 pre-existing `only-export-components` warnings as sessions 6–10, nothing new.
- Anonymous REST probes after the migration: all 8 tables `200 []`, new columns selectable.
- PostgREST check of the new frontend selects (`projects` with nested `project_members → profiles`, `project_members → profiles` with `avatar_url`, pending `project_invitations`): all `200`, with a deliberately wrong column as a control (`400`, so the 200s are meaningful). This was done because the user asked to skip the browser-automation step; these queries were the riskiest untested frontend change.
- Local `netlify dev`: `/api/health` 200; the four member routes return 401 without a token; the old routes (`generate-posts`, `linkedin/status`) are unchanged (401 without a token). Found that `SUPABASE_ANON_KEY` is empty in Netlify's `dev` context (secret-flagged, production-only), so every token check failed locally with a 500 config error; worked around for the session by passing the public anon key from `.env.local` through the shell (now in CLAUDE.md Known issues).
- Live, post-deploy: all four member routes return `401 {"error":"Invalid or expired session."}` for a bogus token (route exists, middleware verifies with Supabase); `/api/health` 200; the served bundle contains the Team panel / claim-toast strings.
- **Two-account flow, run by the user — confirmed "all done and clear":** account A invited B's email before B had ever signed in → B signed in and was added automatically (toast + "Shared" project) → B added a task and a note → A saw them after refreshing → A removed B → B lost access → a never-invited account C couldn't see the project. **Where it ran:** on **localhost** (`netlify dev` on port 5173, at the user's request), not on the live URL. That build is the same code as the deployed `99d92a1`, and localhost uses the **production** Supabase project (the only one), so the RLS policies, triggers and data under test were the live ones. The parts that differ from production are the Netlify Functions runtime and env vars: those were checked live separately (the member routes' 401s above, which prove the deployed function verifies tokens against Supabase). The full flow was not repeated click-by-click on glampro.netlify.app.

## What session 13 should do first

1. Read CLAUDE.md and this file.
2. Build the UI for the columns this session only added: a teammate picker for a task's assignee (`tasks.assignee_id`; keep showing the free-text `assignee` for older rows), and "created by" on tasks/notes/posts (`created_by` → `profiles`, readable for teammates under the new profiles policy).
3. Decide whether posts in shared projects should keep publishing through the owner's LinkedIn (current behavior) or through `created_by` / whoever scheduled the post. Changing it means touching `scheduler.service.ts` and possibly relaxing the `owner_id` immutability reasoning.
4. Optional: rename/delete project UI (owner only), and moving the older routes onto `requireAuth`.
