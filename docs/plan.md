
# GLAM PRO — 1-Week Build Plan

### Internal management + AI marketing assistant (task list, notes, AI-generated posts, scheduler, calendar)

**Constraints this plan is built around:** solo, 7 sessions, working with Claude Code. This plan cuts scope hard, ships something live every session, and clearly marks what's core vs. stretch vs. cut.

---

## 1. Tech stack (and why)

| Layer             | Choice                                                                                                        | Why                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend          | React + Vite + TypeScript + Tailwind CSS                                                                      | Fastest to scaffold, huge Claude Code familiarity, no framework ceremony                                                                                                                                                                                                                                                                                                                                  |
| UI components     | shadcn/ui + lucide-react icons                                                                                | Accessible, unstyled-but-pretty primitives (button, dialog, calendar, tabs, badge) — you assemble instead of building from scratch                                                                                                                                                                                                                                                                       |
| Backend logic     | Express.js route handlers, wrapped with`serverless-http` and deployed **as Netlify Functions**        | See note below — this is the one deviation from your original "Node/Express" pick, and it's the thing that makes "deploy on Netlify" actually true                                                                                                                                                                                                                                                       |
| Database + Auth   | Supabase (Postgres + Auth + Row Level Security), login via**OAuth2** (Google)                           | Free forever tier, instant schema via SQL editor. OAuth2-only means one "Sign in with Google" button — no password reset, email verification, or login/signup forms to build                                                                                                                                                                                                                             |
| AI generation     | **Groq API** (Llama 3.3 70B or 3.1 8B, OpenAI-compatible SDK)                                           | Verified free tier as of Aug 2026: ~30 requests/min, ~1,000 requests/day, no charge, no card required for the free tier. Plenty for a demo/dev app generating a handful of post drafts per day. Google Gemini's free tier is a reasonable backup if you ever hit a Groq snag, but Groq's plain REST call is the simplest to wire into a serverless function with zero surprises.                          |
| Scheduler         | Netlify**Scheduled Functions** (cron, e.g. hourly)                                                      | Free on all plans, no separate cron service needed, polls Supabase for posts due to publish                                                                                                                                                                                                                                                                                                               |
| Social publishing | LinkedIn API —**"Share on LinkedIn" product** (`w_member_social` scope)                              | Self-serve: add the product in the LinkedIn Developer Portal, no lengthy formal review documented for basic member posting (unlike some of LinkedIn's other products, e.g. Community Management API, which do require review). Still budgeted as a**Day 7 stretch goal** below — LinkedIn app setup (redirect URIs, verification) is the one step with real timeline risk you don't fully control. |
| Instagram         | **Cut entirely**                                                                                        | Your brief explicitly marks it optional — zero minutes budgeted this week                                                                                                                                                                                                                                                                                                                                |
| Hosting           | **Netlify only** — one site serving the static frontend, the API functions, and the scheduled function | Matches "deploy per feature on Netlify" literally: one deploy target, one pipeline, no second service to babysit                                                                                                                                                                                                                                                                                          |
| CI/CD             | GitHub → Netlify auto-deploy on push to`main`                                                              | Every day's commit becomes a live deploy automatically — no manual deploy step to remember                                                                                                                                                                                                                                                                                                               |

### Why not a real Node/Express server on a second host (e.g. Render)?

You picked Node/Express, and the code you write can absolutely stay Express-shaped (routes, middleware, req/res) — Claude Code will write it that way. The only change is *how it ships*: wrapped with `serverless-http` and deployed as a Netlify Function instead of a standalone server. I checked Render's current free tier (a natural second host for Express) and it explicitly warns it's not meant for production, spins down after 15 minutes of inactivity, and caps you at 750 instance-hours/month — for a marketing scheduler that needs to reliably wake up and publish posts on time, that's a bad fit and adds a second deploy pipeline you don't need to manage. Netlify Functions + Scheduled Functions solve the same problem inside the one platform you already need for the frontend.

---

## 2. UI style & design system

*Note: I don't have this session's design-pattern database available to pull a matched palette record from, so the recommendation below is general SaaS-dashboard best practice plus your brand colors — not a database lookup. It's still a solid, safe choice.*

**Style:** clean modern SaaS dashboard — minimal, card-based, generous whitespace, a fixed dark sidebar. Think Linear/Notion, not glassmorphism or anything animation-heavy.

**Palette** (built from your logo's navy + cyan):

| Token               | Hex         | Use                                              |
| ------------------- | ----------- | ------------------------------------------------ |
| Primary / Navy      | `#0B2340` | Sidebar, headers, primary buttons                |
| Accent / Teal       | `#3EC6E0` | CTAs, active nav item, links, "scheduled" status |
| Background          | `#F7F9FB` | App background                                   |
| Surface             | `#FFFFFF` | Cards, panels                                    |
| Border              | `#E4E9EF` | Dividers, card outlines                          |
| Text primary        | `#101828` | Body/headings                                    |
| Text secondary      | `#667085` | Meta text, labels                                |
| Success (published) | `#22C55E` |                                                  |
| Warning (pending)   | `#F59E0B` |                                                  |
| Error (failed)      | `#EF4444` |                                                  |
| Info (scheduled)    | `#3EC6E0` | reuse accent                                     |

Keep all four post statuses (scheduled / published / pending / failed) as colored badges — this maps directly to the brief's calendar requirement.

**Typography:** one family only — **Inter** (headings Semibold/Bold, body Regular). One font, zero pairing decisions, still looks professional. Base size 16px, line-height 1.5.

**Layout:** fixed left sidebar (Dashboard · Projects · Tasks · Notes · Marketing · Calendar), top bar with a project switcher + avatar. Rounded-xl (12px) cards, soft shadows, 8px spacing scale (dashboard = dense, not spacious).

**Components:** shadcn/ui primitives (button, dialog, dropdown-menu, tabs, badge, calendar) — don't hand-build these from scratch. Icons from `lucide-react`; never emoji as icons.

---

## 3. Minimal data model (Supabase / Postgres)

```sql
-- profiles: mirrors auth.users, created via Supabase trigger
profiles (id uuid pk, email text, name text)

projects (id uuid pk, owner_id uuid fk->profiles, name text, description text, created_at timestamptz)

tasks (id uuid pk, project_id uuid fk->projects, title text,
       status text check in ('todo','doing','done'),
       priority text check in ('low','medium','high'),
       assignee text, due_date date, created_at timestamptz)

notes (id uuid pk, project_id uuid fk->projects, title text, content text, created_at timestamptz)

posts (id uuid pk, project_id uuid fk->projects,
       objective text,
       ai_variants jsonb,              -- the 1–3 AI drafts before editing
       content text,                   -- final validated content
       platform text default 'linkedin',
       status text check in ('draft','scheduled','published','failed'),
       scheduled_at timestamptz,
       published_at timestamptz,
       error_message text,
       created_at timestamptz)
```

Row Level Security: every table scoped by `owner_id`/`project_id` → `auth.uid()`. Simple, one policy pattern reused everywhere.

---

## 4. Day-by-day plan (deploy every day)

Each day ends with a push to `main` → live on Netlify. You always have a working demo, even if it's smaller than the full brief.

### Day 1 — Foundation & live pipeline

**Goal:** an empty-but-*live* app, so every later day is purely additive.

- `npm create vite` (React+TS) + Tailwind + shadcn/ui init
- Create Supabase project, run the schema above, grab API keys
- Connect GitHub repo → Netlify, set env vars, confirm auto-deploy works
- Add one test Express route wrapped via `serverless-http`, deployed as a Netlify Function, confirm it responds on the live URL
- Sidebar + topbar shell using the palette above
- **Deploy:** empty shell, live URL, working nav

> **Claude Code prompt to start with:** "Scaffold a Vite + React + TypeScript + Tailwind app with shadcn/ui installed. Add a fixed left sidebar (Dashboard, Projects, Tasks, Notes, Marketing, Calendar) and a top bar, using this palette: [paste palette table]. Then create a `netlify/functions/api.ts` that wraps an Express app with `serverless-http` and exposes `GET /api/health` returning `{ok:true}`. Add a `netlify.toml` that redirects `/api/*` to the function."

### Day 2 — Auth + Projects

- Supabase Auth via **OAuth2** (Google sign-in) wired to React — one "Sign in with Google" button + logout, no custom login/signup forms
- `projects` CRUD: create, list, select active project (stored in app state)
- **Deploy**

### Day 3 — Tasks

- `tasks` CRUD scoped to the selected project
- Status + priority as colored badges, simple filterable list (skip drag-and-drop Kanban for now)
- **Deploy**

### Day 4 — Notes / Ideas

- `notes` CRUD scoped to the selected project (title + content, organized under the project like the brief asks)
- **Deploy**

### Day 5 — AI post generation

- Netlify Function calling Groq: input `{project, objective}` → returns 1–3 draft posts
- UI: objective form → show drafts → inline edit → "Validate" saves as a `draft` post row
- **Deploy**

> **Claude Code prompt:** "Add a Netlify Function `netlify/functions/generate-posts.ts` that calls the Groq API (model `llama-3.3-70b-versatile`) with a prompt built from a project name and content objective, asking for 1–3 short LinkedIn post variants as JSON. Add a form + results UI in React that lets me pick, edit, and save one as a draft post in Supabase."

### Day 6 — Scheduling + Calendar

- Add platform/scheduled_at/status fields to the post flow; date-time picker
- Calendar or filtered-list view showing scheduled / published / pending / failed — this directly satisfies the brief's "visualiser les publications" requirement
- Netlify Scheduled Function (`@hourly`) that queries Supabase for posts due now
  - If LinkedIn isn't wired yet (see Day 7), have it just flip status to `published` as a placeholder so the full pipeline is demoable end-to-end
- **Deploy**

### Day 7 — LinkedIn auto-publish (stretch) + polish

- **Primary path:** create the LinkedIn app in the Developer Portal, add the "Share on LinkedIn" product, implement OAuth, have the scheduled function POST to LinkedIn's UGC API for due posts
- **Fallback if setup doesn't land:** keep a manual "Mark as Published" button + a "Copy content" button next to each scheduled post — still demoable, just not automatic
- Final pass: empty states, loading spinners, spacing/contrast check
- **Deploy — final**

---

## 5. Explicitly cut or descoped (and why)

- **Instagram** — brief marks it optional; zero minutes budgeted.
- **Multi-member roles/invites** — solo build; "assignee" on a task is a free-text field, not a real multi-user permission system this week.
- **Kanban drag-and-drop** — a filterable/sortable list instead; upgrade later if you continue past the week.
- **Guaranteed real LinkedIn auto-publish** — treated as Day 7 stretch with a manual fallback, because LinkedIn app setup is the one dependency with timeline risk outside your control.

## 6. Do this *before* Day 1

Create accounts ahead of time so Day 1 isn't spent waiting on email verifications: GitHub, Netlify, Supabase, Groq (console.groq.com), and a LinkedIn Developer app with the "Share on LinkedIn" product added. Also set up the Google OAuth2 client: create OAuth credentials in Google Cloud Console, then enable the Google provider in Supabase's Authentication → Providers settings with that Client ID/Secret and the Supabase callback URL registered as an authorized redirect URI. Can be done anytime before you start.

## 7. Risks

- **LinkedIn access** — self-serve per current docs, but budget Day 7 as a stretch goal, not a guarantee.
- **Sessions can run tight** — if a session overruns scope, the rule is: skip polish, ship functional-but-plain, keep the deploy green. A working ugly feature beats a half-built pretty one.
- **Groq free tier** (~30 req/min, ~1,000 req/day) — plenty for dev/demo use; revisit if you scale past this build.

## 8. After the deadline (nice-to-haves, not this week)

Instagram support, Kanban drag-and-drop, team invites & roles, richer calendar analytics, AI-generated images for posts, dark mode.
