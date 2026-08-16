# Session 2 — Auth + Projects

**Date:** 2026-08-16
**Live URL:** https://glampro.netlify.app/

## What was built

- Supabase Auth via Google OAuth2, no custom forms:
  - `src/lib/supabase.ts` — `@supabase/supabase-js` client reading `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
  - `src/lib/auth-context.tsx` — `AuthProvider`/`useAuth`, tracks session via `getSession()` + `onAuthStateChange`, exposes `signInWithGoogle()` (`supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`) and `signOut()`.
  - `src/components/SignInScreen.tsx` — single "Sign in with Google" button, palette-matched.
  - `src/App.tsx` — `AuthGate` wraps the whole app: loading spinner → `SignInScreen` if logged out → `ProjectsProvider` + routed `AppLayout` if logged in. Nothing behind the gate is reachable unauthenticated.
  - `TopBar` avatar dropdown replaced with the real signed-in user (Google avatar/name/email) and a working Log out.
- `projects` CRUD (create, list, select-active — the exact scope asked for; no update/delete UI):
  - `src/lib/projects-context.tsx` — `ProjectsProvider`/`useProjects`. Lists the caller's projects (RLS does the owner scoping — no explicit `.eq('owner_id', ...)` needed), inserts with `owner_id: user.id`, and tracks "active project" as **client-side app state** (React context + `localStorage`, not a DB column — matches the plan's "stored in app state" wording). Auto-falls back to the first project if the stored active id no longer exists (e.g. switched accounts).
  - `src/pages/Projects.tsx` — create form (name + optional description) and a card grid of the user's projects with a "Set as active" action and an "Active" badge.
  - `TopBar` project-switcher dropdown now lists real projects and a "Manage projects" link to `/projects`.
- Added shadcn components `card`, `input`, `label` (`npx shadcn add`, same `base-nova` style as session 1).
- `.env.example` documenting the two `VITE_`-prefixed frontend vars.
- RLS: no schema changes needed — session 1's `projects` policy (`owner_id = auth.uid()`) already covered this session's needs.

## Live URL

https://glampro.netlify.app/ (custom Netlify subdomain set up by the user after session 1 — the old auto-generated `glowing-sundae-86a505.netlify.app` now 404s, this file's URL is the current one going forward)

## Env vars set in Netlify (site settings → Environment variables)

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — **new this session**. Vite only inlines `VITE_`-prefixed vars into the client bundle at build time; session 1 had only set the server-side `SUPABASE_URL`/`SUPABASE_ANON_KEY` (used by Netlify Functions), which the browser bundle can't see. Same values as the existing server-side pair.
- Set via `netlify env:set` (Netlify CLI), not the dashboard — see deviations below for why.

## Decisions / deviations from CLAUDE.md and the plan

- **Netlify CLI used directly this session.** The dashboard-based attempts to add the two `VITE_` env vars didn't take effect (rebuilds kept producing the exact same content-hashed JS bundle, proving the build never saw them). Ran `netlify login` (opens a browser tab for the user to approve — no token needed) and `netlify link`, confirmed via `netlify env:list` that only `SUPABASE_URL`/`SUPABASE_ANON_KEY` existed, then added the `VITE_` pair with `netlify env:set` and deployed directly with `netlify deploy --build --prod` a few times while iterating. The final state is in sync with the pushed `main` branch (same source); routine future sessions can go back to plain `git push`-triggered auto-deploy.
- **Two pre-existing Supabase misconfigurations, not introduced this session, caused most of the session's time:**
  1. Supabase's stored Google `external_google_secret` was a 64-character hex string — not a valid Google OAuth client secret (real ones start `GOCSPX-`). Sign-in was never going to work with whatever was there before, independent of any app code. Root-caused via the Supabase Management API (`GET /v1/projects/{ref}/config/auth`, using a Personal Access Token the user generated for this purpose) after the dashboard-UI edit the user tried didn't resolve it; fixed by pulling the real secret from the user's downloaded Google OAuth client JSON and `PATCH`ing Supabase's config directly via the same API.
  2. `uri_allow_list` had `https://localhost:5173/**` (wrong protocol — Vite dev serves plain `http`). Corrected to `http://localhost:5173/**` via the same API call. Not the cause of the live failure (the `glampro.netlify.app` entry was already correct) but would have blocked local OAuth testing in session 3+.
  - The Supabase Personal Access Token used for this debugging was revoked by the user before session close (it granted full account-level Management API access, only needed for this session). The Netlify CLI login stays linked; it's the normal path for env var / deploy work.
- **Runtime-only bug `tsc`/`npm run build` couldn't catch:** `TopBar`'s account-menu used Base UI's `DropdownMenuLabel` (`Menu.GroupLabel`) as a standalone account-info header. Base UI requires `Menu.GroupLabel` to be nested inside `Menu.Group`/`Menu.RadioGroup`; used standalone it throws at render time ("Base UI error #31"), only reachable by actually opening that dropdown — which requires being signed in. Fixed by swapping to a plain `<div>` for that non-interactive info block (it isn't labeling a group of items, so the wrapper wasn't semantically needed anyway).
- **Verification gap, worth naming plainly:** the assistant cannot complete the user's real Google OAuth login inside an automated browser (no visible window in this environment, and it would mean acting on the user's Google credentials). Everything up to Google's real consent screen was verified automatically (correct `client_id`, correct Supabase callback `redirect_uri`, correct `redirectTo` for both localhost and prod); everything *behind* the login (avatar, logout, project CRUD, switcher) required the user to click through live and report back. This is how the `DropdownMenuLabel` crash above was caught — it wouldn't have been caught otherwise. Expect this pattern to repeat for any future session-2+ feature that only renders once authenticated.

## Verification performed

- Local: `npx tsc -b` clean, `npm run build` clean, after every change.
- Local: dev server, Playwright — sign-in screen renders correctly at desktop and 375px mobile width, zero console errors; clicking "Sign in with Google" correctly redirects to a real `accounts.google.com` consent screen with the correct `client_id` and `redirect_uri=https://ihgfkcnorylegchoddxx.supabase.co/auth/v1/callback`.
- Live (https://glampro.netlify.app/): same unauthenticated checks, post-deploy — clean console, correct OAuth redirect using `redirectTo=https://glampro.netlify.app`.
- Live, user completing the real Google login (required — see verification-gap note above):
  - First attempt failed after Google consent, bounced back with `?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange...` — root-caused and fixed per the two Supabase config issues above.
  - Second attempt: Google sign-in completed, but clicking the avatar crashed the page (Base UI error #31) — root-caused and fixed per the `DropdownMenuLabel` issue above.
  - Third attempt, user-confirmed: Google sign-in completes; avatar shows real name/email with working Log out; creating a project works and it appears both in the Projects page (marked "Active") and the top-bar project switcher; mobile width (drawer, no horizontal scroll, cards stacking to one column) confirmed by the user on the live site.

## What session 3 should do first

1. Read this file and CLAUDE.md's "Current status" before anything else.
2. Build `tasks` CRUD scoped to the active project — status/priority as colored badges, simple filterable list, no drag-and-drop Kanban — per `docs/PLAN.md` Day 3. No schema changes needed; the `tasks` table + RLS policy already exist from session 1's `supabase/schema.sql`.
3. Reuse `useProjects()`'s `activeProject` to scope all task queries/inserts (same pattern `projects-context.tsx` establishes). If there's no active project yet, the Tasks page should prompt the user to create/select one first, mirroring `Projects.tsx`'s empty state.
4. Deploy and update this session log / CLAUDE.md status again at the end, per the standard session-close convention. Plain `git push`-triggered auto-deploy should be sufficient again (no CLI env var surgery expected).
