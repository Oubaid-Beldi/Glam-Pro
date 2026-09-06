# CLAUDE.md — GLAM PRO Project Memory

Read this file first, every session, before doing anything else. Then read **all** files in `docs/sessions/`, in order, for the full history of what's been built and why. The scope and sequencing are already decided — don't re-derive them from scratch, follow `docs/PLAN.md` (the full 7-day plan) and this file.

## Project

GLAM PRO: a small web app combining (1) internal project/task/notes management and (2) an AI-assisted marketing workflow — generate LinkedIn post drafts, edit/validate them, schedule them, auto-publish them — with a calendar view of post status (scheduled / published / pending / failed).

## Constraints

Solo dev, context gets cleared between sessions on purpose to avoid overload. Every session must leave the repo **deployed and working** — never leave it half-broken. If a session runs long, cut scope, not the deploy-and-document step at the end.

## Stack — do not deviate without a strong reason; if you do, record why in the session log

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + shadcn/ui + lucide-react icons
- **Backend:** Express-style route handlers wrapped with `serverless-http`, deployed as Netlify Functions (`netlify/functions/*.ts`). Not a separate server — one deploy target only, Netlify.
- **Backend internal architecture (as of session 7):** layered, not flat files. `netlify/functions/*.ts` are thin entrypoints only (Express app assembly for `api.ts`, a one-line call into a service for `scheduler.ts`) — no route logic or business logic lives in them. Shared backend source lives in `server/` at the repo root: `server/routes/` (path → controller wiring only), `server/controllers/` (parse request, call service, shape HTTP response — no business logic, no direct third-party calls), `server/services/` (the actual business logic, framework-agnostic — takes/returns plain typed discriminated-union results, never touches `req`/`res`, never throws), `server/integrations/` (thin wrappers around external APIs — Groq, Supabase, LinkedIn — nothing outside this folder calls those SDKs directly), `server/types/` (shared interfaces/DTOs across layers). Every new backend feature from session 7 onward follows this pattern — don't add a new flat file to `netlify/functions/`. (No `server/middleware/`, no zod, no Vitest — those were never actually built; don't assume they exist without checking.)
- **DB/Auth:** Supabase (Postgres + Auth + Row Level Security), login via **OAuth2 only** (Google sign-in) — no email/password forms, no signup/reset flows
- **AI:** Groq API, OpenAI-compatible client, model `openai/gpt-oss-120b` (`llama-3.3-70b-versatile` was removed from Groq's catalog — see docs/sessions/07-architecture-refactor.md), key in `GROQ_API_KEY`
- **Scheduler:** Netlify Scheduled Function, `@hourly` cron, checks Supabase for due posts
- **Voice input (as of session 8):** speech-to-text for the AI-generation objective field, via Groq Whisper (`whisper-large-v3-turbo`) — same `GROQ_API_KEY`, no new provider or account. Browser records audio with MediaRecorder (60s cap, cancel-while-recording), sends it base64-encoded to `POST /api/posts/transcribe`, backend transcribes it and returns plain text that fills the objective field for the user to review/edit before generating — voice never skips straight to AI generation. See docs/sessions/08-voice-input.md.
- **Social publish (as of session 9):** LinkedIn "Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" products, `openid profile w_member_social` scope, `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET`. **Working, confirmed live** — auto-publishes to the connected LinkedIn **member's personal profile**, not a Company Page. Posting as a Page requires LinkedIn's separately-reviewed Community Management API (`w_organization_social`), which is out of scope (no self-serve approval path). OAuth flow: `GET /auth/linkedin/connect` (top-level redirect, signed state) → LinkedIn consent → `GET /auth/linkedin/callback` → stores the token in `linkedin_accounts`. `server/integrations/linkedin.client.ts` -> `server/services/linkedin.service.ts` -> `server/routes/linkedin.routes.ts` + `server/controllers/linkedin.controller.ts`, following session 7's layering. `scheduler.service.ts` calls `publishToLinkedIn()` per due post. Manual "Copy content" / "Mark as published" fallback buttons also ship on every scheduled/failed post (Marketing + Calendar), so the workflow stays usable without a live connection or after a 60-day token expiry (no refresh token — reconnect required). See docs/sessions/09-linkedin-polish.md.
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
profiles (id uuid pk, email text, name text)

projects (id uuid pk, owner_id uuid fk->profiles, name text, description text, created_at timestamptz)

tasks (id uuid pk, project_id uuid fk->projects, title text,
       status text check in ('todo','doing','done'),
       priority text check in ('low','medium','high'),
       assignee text, due_date date, created_at timestamptz)

notes (id uuid pk, project_id uuid fk->projects, title text, content text, created_at timestamptz)

posts (id uuid pk, project_id uuid fk->projects,
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

RLS on every table, scoped to `auth.uid()` via `owner_id` → `project_id` chain (posts/tasks/notes) or `owner_id` directly (linkedin_accounts). Reuse the same policy pattern everywhere.

## Conventions

- Env vars (set in Netlify site settings, never committed, never fabricated as placeholders that silently fail): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (functions only, never shipped to the client), `GROQ_API_KEY`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
- Google OAuth2 Client ID/Secret are NOT Netlify env vars — they're configured directly in the Supabase dashboard under Authentication → Providers. The app only ever calls `supabase.auth.signInWithOAuth({provider: 'google'})`.
- If an env var is missing, ask the user for it — don't invent a value.
- Every session ends the same way: commit + push to `main` (triggers Netlify auto-deploy) → confirm the **live** URL actually works, not just localhost → update the "Current status" section below → append a new `docs/sessions/0N-<name>.md`.
- **Commit messages:** `<feature-slug> - <three word change description>`. No mention of "session" anywhere in a commit message — session numbering is a docs/sessions/ concept only, not a git concept. Reuse the same feature-slug every time that feature is touched again, don't invent a new one — that's what makes `git log` read as a history per feature instead of noise. Canonical feature-slugs for this project (use exactly these, add a new one only if a session genuinely starts a feature not listed): `app-shell`, `auth`, `projects`, `tasks`, `notes`, `ai-generation`, `voice-input`, `scheduling`, `calendar`, `linkedin`, `dashboard`, `data-model`, `architecture`, `project-log` (for CLAUDE.md/docs-only commits with no feature code). Example history: `app-shell - initial project scaffold`, `data-model - add supabase schema`, `project-log - update status log`, `app-shell - responsive mobile drawer`.

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

## Current status

*(overwrite this section each session — it's the single source of truth for "where are we")*

**MVP complete, plus the Dashboard filled in.** All core + stretch features from `docs/PLAN.md`'s 7-day plan shipped by session 9; this session (10) filled in the one placeholder the plan never scoped — the Dashboard nav item, which had shown "Coming soon" since session 1.

- Last completed: Session 10 — built the real Dashboard (`src/pages/Dashboard.tsx`), project-scoped like every other page. Read-only: task counts by status (todo/doing/done), total note count, post status breakdown (draft/scheduled/published/failed) using the existing `success`/`warning`/`error`/`info` design-system colors, and the next 5 upcoming scheduled posts sorted ascending by `scheduled_at`. Reuses the existing `useTasks`/`useNotes`/`usePosts` hooks and `post-format.ts`'s `STATUS_LABEL`/`formatDateTime` — no new tables, endpoints, or env vars. Friendly empty state when a project has zero tasks/notes/posts. See docs/sessions/10-dashboard.md.
- Next up: nothing specifically planned. If picked up again: (1) Company Page posting via LinkedIn's Community Management API (needs a review-gated LinkedIn application, not self-serve — see the stack section above), (2) LinkedIn token refresh before the 60-day expiry forces a reconnect, (3) the open items below.
- Live URL: [glampro.netlify.app](https://glampro.netlify.app/)
- Known issues / TODO:
  - LinkedIn auto-publish only posts to the connected **member's personal profile**, never a Company Page — this is a hard LinkedIn platform/product limitation, not a bug (see the stack section above).
  - No LinkedIn token refresh — access tokens last ~60 days, then the user must click "Connect LinkedIn" again from Marketing.
  - When setting `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET` in Netlify (or after changing them), **redeploy** before testing — a warm function container can keep serving the old value from memory even after the env var is updated (see docs/sessions/09-linkedin-polish.md).
  - Everything from session 7's "Known issues" (Notes' live round-trip, the `SUPABASE_SERVICE_ROLE_KEY` rotation) remains open — see docs/sessions/07-architecture-refactor.md.
