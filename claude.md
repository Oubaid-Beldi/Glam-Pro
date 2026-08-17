
# CLAUDE.md — GLAM PRO Project Memory

Read this file first, every session, before doing anything else. Then read **all** files in `docs/sessions/`, in order, for the full history of what's been built and why. The scope and sequencing are already decided — don't re-derive them from scratch, follow `docs/PLAN.md` (the full 7-day plan) and this file.

## Project

GLAM PRO: a small web app combining (1) internal project/task/notes management and (2) an AI-assisted marketing workflow — generate LinkedIn post drafts, edit/validate them, schedule them, auto-publish them — with a calendar view of post status (scheduled / published / pending / failed).

## Constraints

Solo dev, context gets cleared between sessions on purpose to avoid overload. Every session must leave the repo **deployed and working** — never leave it half-broken. If a session runs long, cut scope, not the deploy-and-document step at the end.

## Stack — do not deviate without a strong reason; if you do, record why in the session log

- **Frontend:** React + Vite + TypeScript + Tailwind CSS + shadcn/ui + lucide-react icons
- **Backend:** Express-style route handlers wrapped with `serverless-http`, deployed as Netlify Functions (`netlify/functions/*.ts`). Not a separate server — one deploy target only, Netlify.
- **DB/Auth:** Supabase (Postgres + Auth + Row Level Security), login via **OAuth2 only** (Google sign-in) — no email/password forms, no signup/reset flows
- **AI:** Groq API, OpenAI-compatible client, model `llama-3.3-70b-versatile`, key in `GROQ_API_KEY`
- **Scheduler:** Netlify Scheduled Function, `@hourly` cron, checks Supabase for due posts
- **Social publish:** LinkedIn "Share on LinkedIn" product / `w_member_social` scope — stretch goal (session 7), has a manual fallback
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
```

RLS on every table, scoped to `auth.uid()` via `owner_id` → `project_id` chain. Reuse the same policy pattern everywhere.

## Conventions

- Env vars (set in Netlify site settings, never committed, never fabricated as placeholders that silently fail): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (functions only, never shipped to the client), `GROQ_API_KEY`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
- Google OAuth2 Client ID/Secret are NOT Netlify env vars — they're configured directly in the Supabase dashboard under Authentication → Providers. The app only ever calls `supabase.auth.signInWithOAuth({provider: 'google'})`.
- If an env var is missing, ask the user for it — don't invent a value.
- Every session ends the same way: commit + push to `main` (triggers Netlify auto-deploy) → confirm the **live** URL actually works, not just localhost → update the "Current status" section below → append a new `docs/sessions/0N-<name>.md`.
- **Commit messages:** `<feature-slug> - <three word change description>`. No mention of "session" anywhere in a commit message — session numbering is a docs/sessions/ concept only, not a git concept. Reuse the same feature-slug every time that feature is touched again, don't invent a new one — that's what makes `git log` read as a history per feature instead of noise. Canonical feature-slugs for this project (use exactly these, add a new one only if a session genuinely starts a feature not listed): `app-shell`, `auth`, `projects`, `tasks`, `notes`, `ai-generation`, `scheduling`, `calendar`, `linkedin`, `data-model`, `project-log` (for CLAUDE.md/docs-only commits with no feature code). Example history: `app-shell - initial project scaffold`, `data-model - add supabase schema`, `project-log - update status log`, `app-shell - responsive mobile drawer`.

## Session log

*(one line per completed session, appended in order — do not reorder or delete old entries)*

- docs/sessions/01-foundation.md
- docs/sessions/02-auth-projects.md
- docs/sessions/03-tasks.md
- docs/sessions/04-notes.md
- docs/sessions/05-ai-generation.md
- docs/sessions/06-scheduling-calendar.md
- docs/sessions/07-architecture-refactor.md

## Current status

*(overwrite this section each session — it's the single source of truth for "where are we")*

- Last completed: Session 7 — Architecture refactor (pure reorganization, no behavior change: `netlify/functions/` flattened logic split into a layered `server/` tree — `routes/ -> controllers/ -> services/ -> integrations/` + shared `types/` — imported by two thin function entrypoints, `netlify/functions/api.ts` and `scheduler.ts`; `generate-posts.ts` as a standalone function was removed, its logic folded into `api.ts` via `server/routes/posts.routes.ts`. See docs/sessions/07-architecture-refactor.md for the full new folder structure and the deviations from the brief (three Supabase client factories instead of one, to preserve the RLS-scoped auth check; route path kept as `/generate-posts` not `/posts/generate`, to preserve the exact frontend-facing HTTP path). New `npm run typecheck:server` script + `tsconfig.server.json` for standalone typechecking those folders, same as before — still not part of `tsc -b`/`npm run build`.)
- Next up: Session 8 — LinkedIn auto-publish (stretch goal, manual-fallback if it doesn't land in time) + final polish pass, per docs/PLAN.md Day 7. Follow session 7's layering for any new code — see "What session 8 should do first" in docs/sessions/07-architecture-refactor.md.
- Live URL: [glampro.netlify.app](https://glampro.netlify.app/)
- Known issues / TODO:
  - Session 7's refactor was verified via `npm run typecheck:server`, `npm run build`, `npm run lint` (all clean) and a line-by-line read of old vs. new logic — but **not** re-verified with a live authenticated round-trip through `/api/generate-posts` post-deploy (would need an interactive Google sign-in handoff). Worth closing out opportunistically at the start of session 8, before adding new LinkedIn code on top.
  - **New env var this session:** none — session 7 was code organization only, no env var changes.
  - Session 4's Notes page still has an unconfirmed real authenticated live round-trip (see docs/sessions/04-notes.md) — low priority, still not affected by any bug found so far, but worth closing out opportunistically.
  - Session 5's AI generation and session 6's scheduling/calendar flows **were both** fully verified live end-to-end against the real account — see docs/sessions/05-ai-generation.md and docs/sessions/06-scheduling-calendar.md. Session 6 also verified the actual `scheduler.ts` function logic against real production data (not just the UI): a real post was scheduled, then found "due" and correctly flipped to `published` when the function ran. The one thing not observed live is the hourly cron *trigger* itself firing unattended — not practical to wait out in-session; it runs automatically going forward.
  - Session 8 should set `status: 'failed'` + `error_message` from the scheduler service on a real publish failure once LinkedIn is wired up — the `failed` state is already fully supported in the Marketing/Calendar UI, it just has no code path producing it yet.
