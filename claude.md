# CLAUDE.md — GLAM PRO Project Memory

Read this file first, every session, before doing anything else. Then read **all** files in `docs/sessions/`, in order, for the full history of what's been built and why. The scope and sequencing are already decided — don't re-derive them from scratch, follow `docs/PLAN.md` (the full 7-day plan) and this file.

## Project

GLAM PRO: a small web app combining (1) internal project/task/notes management and (2) an AI-assisted marketing workflow — generate LinkedIn post drafts, edit/validate them, schedule them, auto-publish them — with a calendar view of post status (scheduled / published / pending / failed).

## Constraints

Solo dev, context gets cleared between sessions on purpose to avoid overload. Every session must leave the repo **deployed and working** — never leave it half-broken. If a session runs long, cut scope, not the deploy-and-document step at the end.

## Stack — do not deviate without a strong reason; if you do, record why in the session log

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + shadcn/ui + lucide-react icons
- **Backend:** Express-style route handlers wrapped with `serverless-http`, deployed as Netlify Functions (`netlify/functions/*.ts`). Not a separate server — one deploy target only, Netlify.
- **Backend internal architecture (as of session 7):** layered, not flat files. `netlify/functions/*.ts` are thin entrypoints only (Express app assembly for `api.ts`, a one-line call into a service for `scheduler.ts`) — no route logic or business logic lives in them. Shared backend source lives in `server/` at the repo root: `server/routes/` (path → controller wiring only), `server/controllers/` (parse request, call service, shape HTTP response — no business logic, no direct third-party calls), `server/services/` (the actual business logic, framework-agnostic — takes/returns plain typed discriminated-union results, never touches `req`/`res`, never throws), `server/integrations/` (thin wrappers around external APIs — Groq, Supabase, LinkedIn — nothing outside this folder calls those SDKs directly), `server/types/` (shared interfaces/DTOs across layers), `server/middleware/` (as of session 12: `require-auth.ts` — verifies the `Authorization: Bearer <supabase access token>` header via `supabase.auth.getUser()` and attaches `req.authUser = { id, email, emailVerified }`; 401 `{ error }` otherwise — there is no shared Express error handler, middleware/controllers respond directly). Every new backend feature from session 7 onward follows this pattern — don't add a new flat file to `netlify/functions/`. New authenticated routes use `requireAuth`; the older posts/voice/LinkedIn routes still verify the token inside their services (they predate the middleware and already work — migrating them is optional cleanup, not a bug). Request validation uses **zod** (members controller; added session 12). Backend unit tests use **Vitest** (`npm test`, `vitest.config.ts`, only `server/**/*.test.ts`) with an in-memory Supabase fake at `server/test/fake-supabase.ts` — no frontend tests exist.
- **DB/Auth:** Supabase (Postgres + Auth + Row Level Security), login via **OAuth2 only** (Google sign-in) — no email/password forms, no signup/reset flows
- **AI:** Groq API, OpenAI-compatible client, model `openai/gpt-oss-120b` (`llama-3.3-70b-versatile` was removed from Groq's catalog — see docs/sessions/07-architecture-refactor.md), key in `GROQ_API_KEY`
- **Scheduler:** Netlify Scheduled Function, `@hourly` cron, checks Supabase for due posts
- **Voice input (as of session 8):** speech-to-text for the AI-generation objective field, via Groq Whisper (`whisper-large-v3-turbo`) — same `GROQ_API_KEY`, no new provider or account. Browser records audio with MediaRecorder (60s cap, cancel-while-recording), sends it base64-encoded to `POST /api/posts/transcribe`, backend transcribes it and returns plain text that fills the objective field for the user to review/edit before generating — voice never skips straight to AI generation. See docs/sessions/08-voice-input.md.
- **Social publish (as of session 9):** LinkedIn "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" products, `openid profile w_member_social` scope, `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET`. **Working, confirmed live** — auto-publishes to the connected LinkedIn **member's personal profile**, not a Company Page. Posting as a Page requires LinkedIn's separately-reviewed Community Management API (`w_organization_social`), which is out of scope (no self-serve approval path). OAuth flow: `GET /auth/linkedin/connect` (top-level redirect, signed state) → LinkedIn consent → `GET /auth/linkedin/callback` → stores the token in `linkedin_accounts`. `server/integrations/linkedin.client.ts` -> `server/services/linkedin.service.ts` -> `server/routes/linkedin.routes.ts` + `server/controllers/linkedin.controller.ts`, following session 7's layering. `scheduler.service.ts` calls `publishToLinkedIn()` per due post. Manual "Copy content" / "Mark as published" fallback buttons also ship on every scheduled/failed post (Marketing + Calendar), so the workflow stays usable without a live connection or after a 60-day token expiry (no refresh token — reconnect required). See docs/sessions/09-linkedin-polish.md.
- **Collaboration (as of session 12):** projects are shared through **membership**, not single ownership. Two roles: `owner` (invite/remove members, revoke invitations, edit/delete the project) and `member` (everything else: tasks, notes, posts, AI generation, scheduling). Anyone but the owner can leave. **Authorization lives only in `project_members`** — RLS uses the SECURITY DEFINER helpers `is_project_member()` / `is_project_owner()` / `shares_project_with()`, and the backend (service-role client, bypasses RLS) re-checks with `assertOwner`/`assertMember` in `server/services/members.service.ts`. `projects.owner_id` stays but authorizes nothing except the projects INSERT check; it's immutable (trigger) because it also picks **whose LinkedIn the scheduler publishes through** — posts in a shared project always go out on the owner's LinkedIn. Invite by email: existing profile → added immediately; unknown email → pending `project_invitations` row, converted on that person's first sign-in by `POST /api/invitations/claim` (email taken from the verified token, never the body). **No invitation emails are sent** — the owner tells the teammate to sign in. Writes go through `/api/projects/:projectId/invitations[/:invitationId]`, `/api/projects/:projectId/members/:userId`, `/api/invitations/claim`; reads (member list, pending invitations) are direct RLS-scoped Supabase queries from React. UI: Team panel on the Projects page (`src/components/MembersPanel.tsx`), "Shared" badge in the project switcher. Migration + rollback: `supabase/migrations/20261013120000_collaboration.sql`, `supabase/rollbacks/20261013120000_collaboration_rollback.sql`. See docs/sessions/12-collaboration-core.md.
- **Hosting/CI:** Netlify only, auto-deploy from GitHub `main`
- **Instagram:** cut entirely, out of scope for this build

## Design system

- Colors: primary navy `#0B2340` · accent teal `#3EC6E0` · bg `#F7F9FB` · surface `#FFFFFF` · border `#E4E9EF` · text primary `#101828` · text secondary `#667085` · success `#22C55E` · warning `#F59E0B` · error `#EF4444` · info `#3EC6E0`
- Font: Inter only (Semibold/Bold headings, Regular body), base 16px, line-height 1.5
- Layout: fixed left sidebar (Dashboard · Projects · Tasks · Notes · Marketing · Calendar) + top bar with project switcher + avatar
- Components: shadcn/ui primitives only, don't hand-roll. Rounded-xl cards, soft shadows, 8px spacing scale (dense, dashboard-style, not spacious)
- Icons: lucide-react only, never emoji
- **Responsive, mobile-first:** below ~768px the sidebar collapses into a hamburger-triggered drawer (or a bottom nav — pick one and stay consistent), main content reflows to a single column, tables/cards stack instead of overflowing. Touch targets ≥44×44px. No horizontal scroll at any width. Every screen built in every session must be checked at a mobile width before that session is considered done, not just desktop.

## Data model (Supabase / Postgres)

```sql
profiles (id uuid pk, email text, name text, avatar_url text)

projects (id uuid pk, owner_id uuid fk->profiles  -- immutable; NOT used for authorization,
          name text, description text, created_at timestamptz)

project_members (project_id uuid fk->projects on delete cascade,
                 user_id uuid fk->profiles on delete cascade,
                 role text check in ('owner','member') default 'member',  -- exactly one owner per project
                 created_at timestamptz, pk (project_id, user_id))

project_invitations (id uuid pk, project_id uuid fk->projects on delete cascade,
                     email text  -- always lowercased + trimmed (check constraint),
                     invited_by uuid fk->profiles,
                     status text check in ('pending','accepted','revoked') default 'pending',
                     created_at timestamptz, accepted_at timestamptz)
                     -- partial unique index: one pending invitation per (project_id, email)

tasks (id uuid pk, project_id uuid fk->projects, title text,
       status text check in ('todo','doing','done'),
       priority text check in ('low','medium','high'),
       assignee text,                      -- legacy free text, kept
       assignee_id uuid fk->profiles,      -- nullable, UI comes in session 13
       due_date date, created_by uuid fk->profiles, created_at timestamptz)

notes (id uuid pk, project_id uuid fk->projects, title text, content text,
       created_by uuid fk->profiles, created_at timestamptz)

posts (id uuid pk, project_id uuid fk->projects, created_by uuid fk->profiles,
       objective text,
       ai_variants jsonb,
       content text,
       platform text default 'linkedin',
       status text check in ('draft','scheduled','published','failed'),
       scheduled_at timestamptz,
       published_at timestamptz,
       error_message text,
       created_at timestamptz)

linkedin_accounts (owner_id uuid pk fk->profiles, access_token text, member_urn text,
       expires_at timestamptz, created_at timestamptz, updated_at timestamptz)
```

`created_by` is set by a BEFORE INSERT trigger to `auth.uid()` for every client insert (can't be spoofed). Creating a project auto-inserts its creator as the `owner` row in `project_members` (AFTER INSERT trigger) — so the frontend inserts a project with a client-generated id and reads it back in a **separate** query; `insert().select()` on `projects` fails RLS because RETURNING is checked before that trigger runs.

RLS on every table (as of session 12 — see docs/sessions/12-collaboration-core.md for the exact policy list): **membership-based** via SECURITY DEFINER helpers (`is_project_member(project_id)`, `is_project_owner(project_id)`, `shares_project_with(user_id)`; policies on `project_members` must only go through these, never query `project_members` directly, or Postgres recurses infinitely). tasks/notes/posts: members full access. projects: members read, owner update/delete, insert only with `owner_id = auth.uid()`. project_members: members read, a non-owner can delete their own row; other writes via the backend only. project_invitations: owner reads their project's, invitee reads pending ones for their own JWT email; writes via the backend only. profiles: self + people you share a project with. linkedin_accounts: unchanged, `owner_id = auth.uid()` only — never visible to teammates. Schema history: `supabase/schema.sql` (original) then `supabase/migrations/*.sql` in filename order; rollbacks in `supabase/rollbacks/`.

## Conventions

- Env vars (set in Netlify site settings, never committed, never fabricated as placeholders that silently fail): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (functions only, never shipped to the client), `GROQ_API_KEY`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
- Google OAuth2 Client ID/Secret are NOT Netlify env vars — they're configured directly in the Supabase dashboard under Authentication → Providers. The app only ever calls `supabase.auth.signInWithOAuth({provider: 'google'})`.
- If an env var is missing, ask the user for it — don't invent a value.
- Every session ends the same way: commit + push to `main` (triggers Netlify auto-deploy) → confirm the **live** URL actually works, not just localhost → update the "Current status" section below → append a new `docs/sessions/0N-<name>.md`.
- **Commit messages:** `<feature-slug> - <three word change description>`. No mention of "session" anywhere in a commit message — session numbering is a docs/sessions/ concept only, not a git concept. Reuse the same feature-slug every time that feature is touched again, don't invent a new one — that's what makes `git log` read as a history per feature instead of noise. Canonical feature-slugs for this project (use exactly these, add a new one only if a session genuinely starts a feature not listed): `app-shell`, `auth`, `projects`, `tasks`, `notes`, `ai-generation`, `voice-input`, `scheduling`, `calendar`, `linkedin`, `dashboard`, `collaboration`, `data-model`, `architecture`, `project-log` (for CLAUDE.md/docs-only commits with no feature code). Example history: `app-shell - initial project scaffold`, `data-model - add supabase schema`, `project-log - update status log`, `app-shell - responsive mobile drawer`.

## Session log

*(one line per completed session, appended in order — do not reorder or delete old entries)*

- docs/sessions/01-foundation.md
- docs/sessions/02-auth-projects.md
- docs/sessions/03-tasks.md
- docs/sessions/04-notes.md
- docs/sessions/05-ai-generation.md
- docs/sessions/06-scheduling-calendar.md
- docs/sessions/07-architecture-refactor.md
- docs/sessions/08-voice-input.md
- docs/sessions/09-linkedin-polish.md
- docs/sessions/10-dashboard.md
- docs/sessions/12-collaboration-core.md *(no 11 file exists in the repo — see that file's note)*

## Current status

*(overwrite this section each session — it's the single source of truth for "where are we")*

**MVP complete + multi-user collaboration core.** The graders' feedback was that several users must be able to work on the same project; session 12 replaced single ownership with project membership (owner/member roles, invite by email, claim on first sign-in, Team panel).

- Last completed: Session 12 — collaboration core. One DB migration (`project_members`, `project_invitations`, `created_by` on tasks/notes/posts, `assignee_id` on tasks, `profiles.avatar_url`, all RLS rewritten around membership), `requireAuth` middleware + members routes/controller/service with zod validation and 17 Vitest unit tests, Team panel on the Projects page, auto-claim with a toast after sign-in, "Shared" badge in the project switcher. Two-account flow (invite before signup → auto-join → shared task/note → remove → access lost; uninvited account sees nothing) confirmed by the user on localhost against the production database; deployed endpoints checked live. See docs/sessions/12-collaboration-core.md.
- Next up: **session 13** — UI for the columns this session only added: pick a teammate as a task's assignee (`tasks.assignee_id`, the free-text `assignee` stays for old rows), show who created each task/note/post (`created_by`). Also consider: project rename/delete UI (RLS already restricts it to the owner; no UI exists yet), ownership transfer (blocked today by the `owner_id` immutability trigger — would need the scheduler's LinkedIn-account choice revisited first). Older backlog: LinkedIn Company Page posting, LinkedIn token refresh.
- Live URL: [glampro.netlify.app](https://glampro.netlify.app/)
- Known issues / TODO:
  - **Shared projects publish through the owner's LinkedIn.** Any member can schedule a post; the scheduler always uses `projects.owner_id`'s `linkedin_accounts` row. Marketing shows a note to members saying so. Changing this (e.g. publish as `created_by`) is a product decision, not done.
  - No invitation emails — the owner has to tell the teammate to sign in with Google using the invited address. Invitations only match the exact email of the Google account.
  - Local `netlify dev`: `SUPABASE_ANON_KEY` is **empty in Netlify's `dev` context** (it's secret-flagged, production-only), so every authenticated function call fails locally with "missing Supabase env vars" unless you start it as `SUPABASE_ANON_KEY=<VITE_SUPABASE_ANON_KEY from .env.local> netlify dev ...` (it's the public publishable key). To sign in locally, serve on port **5173** (the only localhost origin in Supabase's redirect allow-list): `netlify dev --framework "#custom" --command "npx vite --port 5174 --strictPort" --target-port 5174 --port 5173`.
  - Don't add a `netlify.toml` `ignore` rule based on `$CACHED_COMMIT_REF` — tried in session 12, it cancelled a real code deploy ("no content change"). Reverted.
  - LinkedIn auto-publish only posts to the connected **member's personal profile**, never a Company Page — this is a hard LinkedIn platform/product limitation, not a bug (see the stack section above).
  - No LinkedIn token refresh — access tokens last ~60 days, then the user must click "Connect LinkedIn" again from Marketing.
  - When setting `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET` in Netlify (or after changing them), **redeploy** before testing — a warm function container can keep serving the old value from memory even after the env var is updated (see docs/sessions/09-linkedin-polish.md).
  - Everything from session 7's "Known issues" (Notes' live round-trip, the `SUPABASE_SERVICE_ROLE_KEY` rotation) remains open — see docs/sessions/07-architecture-refactor.md.
