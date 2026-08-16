# Session 1 — Foundation & live pipeline

**Date:** 2026-08-16
**Live URL:** https://glowing-sundae-86a505.netlify.app/

## What was built

- Scaffolded with `npm create vite` (React + TypeScript template), Tailwind CSS v4 (`@tailwindcss/vite`), and shadcn/ui (`npx shadcn init`) with `lucide-react` icons.
- App shell only, no CRUD, no auth:
  - Fixed left sidebar (navy `#0B2340`) with nav items Dashboard · Projects · Tasks · Notes · Marketing · Calendar, each a `react-router-dom` route rendering a placeholder "coming soon" screen.
  - Top bar with a project-switcher dropdown placeholder ("No project selected") and a user-avatar dropdown placeholder ("Not signed in").
  - Design tokens (`src/index.css`) set to the exact CLAUDE.md palette (navy/teal/bg/surface/border/text/status colors) and Inter font, mapped onto shadcn's CSS-variable theme (including custom `--success` / `--warning` / `--info` tokens shadcn doesn't define by default).
- `netlify/functions/api.ts`: Express app wrapped with `serverless-http`, exposing `GET /api/health` → `{ok:true}`.
- `netlify.toml`: redirects `/api/*` → the function, plus an SPA fallback (`/* → /index.html`) so client-side routes work on direct load/refresh.
- `supabase/schema.sql`: `profiles` / `projects` / `tasks` / `notes` / `posts` tables per CLAUDE.md's data model, RLS enabled on every table scoped to `auth.uid()` via the `owner_id` → `project_id` chain, and a trigger that auto-creates a `profiles` row on signup (`auth.users` insert). Run manually by the user in the Supabase SQL editor (see deviations below).
- GitHub repo created by the user (`Oubaid-Beldi/Glam---Pro`), connected to Netlify via the dashboard's "Import from GitHub" flow. Auto-deploy on push to `main` confirmed working.

## Live URL

https://glowing-sundae-86a505.netlify.app/

## Env vars set in Netlify (site settings → Environment variables)

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

(Values not recorded here — see Netlify site settings. `SUPABASE_ANON_KEY` currently holds Supabase's newer `sb_publishable_...` key format, which is functionally the client-safe public key CLAUDE.md's `SUPABASE_ANON_KEY` convention refers to, not the legacy JWT anon key — no naming change needed, just noting the format for whoever wires up `@supabase/supabase-js` in session 2.)

## Decisions / deviations from CLAUDE.md and the plan

- **shadcn style is `base-nova` on `@base-ui/react`, not classic Radix-based shadcn.** The `shadcn init` CLI's current default registry style uses Base UI primitives (`@base-ui/react/menu`, `@base-ui/react/button`) instead of Radix. Component APIs differ slightly from the Radix-era docs (e.g. `DropdownMenuTrigger` doesn't take an `asChild` prop — it's a real trigger element itself; use `buttonVariants()` + `cn()` to style it instead of wrapping a `<Button asChild>`). Not a deliberate choice, just what the current `shadcn` CLI ships; noting it so session 2 doesn't assume Radix APIs.
- **Font:** installed via `@fontsource-variable/inter` (self-hosted variable font, no external font CDN request) rather than a Google Fonts `<link>`, to keep the app dependency-free of runtime third-party requests.
- **No Supabase client in the frontend yet.** This session only ran the schema and set env vars; `@supabase/supabase-js` isn't installed and no `src/lib/supabase.ts` exists yet. That's session 2 work (paired with the Google OAuth2 wiring).
- **Schema execution:** I (Claude Code) don't have direct Supabase access in this environment (no management API token, no `psql`, no MCP Supabase server configured). I wrote `supabase/schema.sql` and the user pasted/ran it manually in the Supabase SQL editor, rather than me executing it. Verified afterward via an anonymous REST call (`GET /rest/v1/projects` returned `200 []`, confirming the table and RLS policy exist and correctly return zero rows for an unauthenticated caller).
- **GitHub repo creation:** no `gh` CLI available in this environment, so the user created the repo (`Oubaid-Beldi/Glam---Pro`) and gave Claude Code the SSH remote URL; Claude Code added `origin`, pushed, and it deployed via Netlify's own GitHub App integration (connected manually by the user in the Netlify dashboard, per user's preference over CLI).
- **`SUPABASE_URL` correction:** the URL the user first provided included a `/rest/v1/` suffix (the REST endpoint path); normalized to the bare project host (`https://ihgfkcnorylegchoddxx.supabase.co`) before it went into Netlify, since `@supabase/supabase-js` appends API paths itself.

## Verification performed

- Local: `npm run build` (typecheck + Vite build) clean; dev server checked in a real browser (Playwright) — sidebar/topbar render with correct palette, nav routing and active states work, both dropdown placeholders open.
- Local: Netlify function handler invoked directly (`tsx`, mock API Gateway event) — returned `200 {"ok":true}`.
- Live: browser check of the deployed shell (dashboard route and a direct-loaded deep route, `/calendar`, to confirm the SPA fallback redirect works on refresh) — matches local exactly.
- Live: `curl https://glowing-sundae-86a505.netlify.app/api/health` → `200 {"ok":true}`.
- Live: `curl https://ihgfkcnorylegchoddxx.supabase.co/rest/v1/projects?select=id&limit=1` with the anon key → `200 []`, confirming the schema is applied and RLS is active.

## What session 2 should do first

1. Read this file and CLAUDE.md's "Current status" before anything else.
2. Install `@supabase/supabase-js`, add `src/lib/supabase.ts` (client using `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — note: **frontend env vars need the `VITE_` prefix** to be exposed to client code by Vite; the current `SUPABASE_URL`/`SUPABASE_ANON_KEY` Netlify vars are server-side (function) only and won't be visible to the browser bundle as-is. Either add `VITE_`-prefixed copies in Netlify, or read them via a small `/api/config` function — decide and document whichever path is taken.
3. Wire Google OAuth2 sign-in (`supabase.auth.signInWithOAuth({ provider: 'google' })`) — reminder: Google Client ID/Secret go directly into the Supabase dashboard (Authentication → Providers), not into Netlify env vars.
4. Replace the top bar's avatar placeholder with real signed-in user state + logout.
5. Build `projects` CRUD (create/list/select-active-project, stored in app state) and replace the project-switcher placeholder with real data.
6. Deploy and update this session log / CLAUDE.md status again at the end, per the standard session-close convention.
