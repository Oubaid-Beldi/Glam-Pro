# Session 7 — Architecture refactor

**Date:** 2026-08-17
**Live URL:** https://glampro.netlify.app/

## What was built

Pure internal reorganization — no new features, no behavior changes, no schema changes. The three flat `netlify/functions/*.ts` files (each a self-contained Express app or handler with all logic inline) are now split into a layered `server/` tree shared by both function entrypoints:

```
netlify/functions/
  api.ts                       - HTTP entrypoint only: builds the Express app, mounts
                                  server/routes/{health,posts}.routes.ts under /api,
                                  wraps with serverless-http, exports handler.
  scheduler.ts                 - Scheduled Function entrypoint only: calls
                                  server/services/scheduler.service.ts, shapes the
                                  {statusCode, body} response, logs the outcome.

server/
  routes/
    health.routes.ts           - GET /health -> health.controller
    posts.routes.ts            - POST /generate-posts -> posts.controller
  controllers/
    health.controller.ts       - thin: res.json({ ok: true })
    posts.controller.ts        - parses the Authorization header + request body,
                                  calls posts.service, maps its typed result status
                                  to an HTTP status code. No Supabase/Groq calls here.
  services/
    posts.service.ts           - generatePostsForProject(): env var checks, Supabase
                                  token verification, RLS-scoped project lookup,
                                  prompt building (verbatim system/user prompt from
                                  session 5), calls groq.client, parses/validates the
                                  drafts array. Framework-agnostic — returns a typed
                                  discriminated result, never touches req/res.
    scheduler.service.ts       - publishDuePosts(): the actual Supabase query that
                                  flips due 'scheduled' posts to 'published'. Same
                                  framework-agnostic typed-result shape.
  integrations/
    groq.client.ts             - the one place that calls Groq's chat completions
                                  endpoint. Returns a typed { ok, content | error }
                                  result instead of throwing, so posts.service can
                                  map failure kinds to the exact original messages.
    supabase.client.ts         - the one place that calls createClient(). Exports
                                  three factories (createAuthClient, createUserScopedClient,
                                  createAdminClient) rather than a single client — see
                                  deviation below.
  types/
    posts.types.ts             - PostDraft, GeneratePostsRequestBody, GeneratePostsResponseBody
```

`tsconfig.server.json` (new, root-level) — standalone typecheck config for `netlify/functions/` + `server/`, bundler-style module resolution (matches how Netlify's esbuild bundler actually resolves these files at deploy time — no `tsc -b` emit involved). Wired up as `npm run typecheck:server`. Neither this config nor these folders are part of the root `tsconfig.json` project references or the `npm run build` pipeline — same as before the refactor, functions were never part of `tsc -b` either, they were typechecked standalone per sessions 5/6's notes. This just makes that standalone check a repeatable script instead of an ad hoc command.

## No behavior changes — verified line-by-line

- **`/api/health`** — identical response (`{ ok: true }`), identical path.
- **`/api/generate-posts`** — identical request shape (`{ projectId, objective }` + `Authorization: Bearer <token>`), identical response shape (`{ drafts: string[] }`), identical error messages and status codes for every failure mode (400/401/404/429/500/502/504), identical Groq prompt text and model/temperature/timeout settings, identical Supabase auth pattern (anon-key client for `getUser`, anon-key + user JWT client for the RLS-scoped project lookup — see deviation below on why this couldn't collapse to a single admin client).
- **`scheduler.ts`** — identical Supabase query (`status='scheduled' AND scheduled_at <= now()` → `published` + `published_at`), identical `@hourly` registration in `netlify.toml`, identical console log/error text, identical `{statusCode, body}` shapes on every path (config-missing / query-error / success).

## Decisions / deviations from the brief

- **`supabase.client.ts` exports three factory functions, not "one configured admin client."** The brief's target structure describes a single service-role admin client for all server-side use. Taking that literally would have collapsed `generate-posts`'s two intentionally-different Supabase clients (a plain anon-key client for `auth.getUser(token)`, and a separate anon-key + user-JWT client for the RLS-scoped `projects` lookup — this dual-client split was itself a deliberate fix from session 5, see `docs/sessions/05-ai-generation.md`) into the service-role client, which bypasses RLS entirely. That would have been a real security regression: any authenticated user could generate posts for a project they don't own, not just a refactor. Kept the three-factory design instead — every `createClient()` call in the codebase still lives in this one file (satisfies "nothing else should call createClient() directly"), it just exports three constructors instead of one instance, because the app has three genuinely different trust levels (anon, user-scoped, admin) that need to stay distinct.
- **Route path kept as `/generate-posts`, not `/posts/generate`.** The brief's illustrative file description says `posts.routes.ts` "defines POST /posts/generate," but the brief's own top-level constraint is explicit and overriding: "Do not change any HTTP path... the frontend already depends on." `src/pages/Marketing.tsx` calls `fetch('/api/generate-posts', ...)`. Kept the route string as `/generate-posts` (mounted under `/api` in `api.ts`, same as before) so the live path is byte-for-byte unchanged.
- **`netlify.toml`'s dedicated `/api/generate-posts -> /.netlify/functions/generate-posts` redirect was removed.** That redirect existed only because `generate-posts` used to be its own separate Netlify Function (session 5's note explains why: the generic `/api/*` catch-all only ever pointed at the `api` function). Now that its logic lives inside `api.ts`, the existing generic `/api/* -> /.netlify/functions/api/:splat` rewrite already covers `/api/generate-posts` — confirmed this rewrite preserves the original request path (not the redirect target path) into the function's `event.path`, which is why the existing `/api/health` route already worked through the same generic rewrite pre-refactor. One fewer function to deploy; no path-resolution change from the frontend's perspective.
- **Result types are discriminated unions (`{ status, message? }`), not thrown exceptions.** Both `posts.service.ts` and `scheduler.service.ts` return typed results rather than throwing, so the thin controller/entrypoint layer can do an exhaustive switch/lookup to the exact original HTTP status codes and console output without any business logic leaking upward, and without a try/catch swallowing unexpected errors into a generic 500.

## Live URL

https://glampro.netlify.app/ (unchanged)

## Env vars

No changes. Same four server-side vars as session 6 (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`), read from `process.env` in the same places (now inside `server/services/*.ts` instead of inline in the function files).

## Verification performed

- `npm run typecheck:server` (new script, `tsc -p tsconfig.server.json`) — clean.
- `npm run build` (`tsc -b && vite build`) — clean, unaffected by the new `server/` folder (it's outside `src/`, `vite.config.ts` only resolves `@/*` to `src/`).
- `npm run lint` (`oxlint`) — same 4 pre-existing `only-export-components` warnings as session 6, zero new warnings, nothing flagged in `server/` or `netlify/functions/`.
- Read every line of the original `generate-posts.ts` and `scheduler.ts` against the new split to confirm messages, status codes, query filters, and the Groq prompt/model/timeout constants all carried over verbatim (see the line-by-line list above).
- **Not done this session:** a live authenticated round-trip through the deployed `/api/generate-posts` (would need an interactive Google sign-in handoff, same as sessions 5/6). Since this is a pure reorganization with no logic rewritten — every value, message, and query was moved, not retyped from memory — and both `npm run typecheck:server` and `npm run build` are clean, the live check after deploy was limited to: `curl` confirming `/api/health` returns `{"ok":true}` from production, and confirming the `scheduler` function is still registered with `schedule = "@hourly"` in `netlify.toml` (unchanged). If anything looks off on the live Marketing page after this deploys, the fix is almost certainly in `server/services/posts.service.ts` or `server/integrations/groq.client.ts`, not in routing.

## What session 8 should do first

1. Read this file and CLAUDE.md's "Current status" before anything else.
2. Follow this session's layering for LinkedIn auto-publish, per `docs/PLAN.md` Day 7 (stretch goal, still pending — this session was infrastructure only): add a `server/integrations/linkedin.client.ts` for the actual UGC API POST call, extend `server/services/scheduler.service.ts` so `publishDuePosts()` calls it per due post instead of just flipping status, and have it return a `'failed'` result with an `error_message` on a real publish failure (the Marketing/Calendar UI already fully supports and displays the `failed` state — it just has no code path producing it yet, per session 6's note).
3. Do **not** revert to flat single-file functions — add new routes under `server/routes/`, new controllers under `server/controllers/`, new services under `server/services/`, new integrations under `server/integrations/`, following this session's pattern.
4. Opportunistically close the live-round-trip verification gap this session left open (see "Verification performed" above) if a real authenticated session is available — confirm `/api/generate-posts` still works end-to-end against the real account post-deploy.
5. Final polish pass per the plan: empty states, loading spinners, spacing/contrast check across the whole app.
6. Deploy and update this session log / CLAUDE.md status again at the end, per the standard session-close convention.
