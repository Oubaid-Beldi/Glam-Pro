# Session 3 — Tasks

**Date:** 2026-08-16
**Live URL:** https://glampro.netlify.app/

## What was built

- `tasks` CRUD scoped to the active project (create, list, edit, delete — full CRUD, wider than session 2's projects scope since the plan explicitly calls for a filterable/sortable list here):
  - `src/lib/use-tasks.ts` — `useTasks(projectId)` hook (plain hook, not a context — unlike `projects-context.tsx`, tasks are only ever needed inside the Tasks page, so no cross-component sharing is required). Lists tasks for the given project (RLS scopes rows via the `project_id -> projects.owner_id -> auth.uid()` chain, no explicit filter needed beyond `.eq('project_id', ...)`), and exposes `createTask`/`updateTask`/`deleteTask`, each doing an optimistic local-state update from the Supabase response rather than a full refetch.
  - `src/pages/Tasks.tsx`:
    - Empty state prompting "Go to projects" (mirrors `Projects.tsx`'s empty-state pattern) when there's no active project — reusing `useProjects()`'s `activeProject`, per the session 2 handoff note.
    - New-task form: title (required), status/priority selects (defaulting to the DB's `todo`/`medium` defaults), assignee (plain text), due date (native `<input type="date">`).
    - Filter/sort toolbar: status filter, priority filter, sort by newest / due date / priority — explicitly a flat filterable/sortable list, no drag-and-drop Kanban (cut per `docs/PLAN.md` section 5).
    - Each task row shows title + status badge + priority badge + assignee + due date, with Edit (inline row turns into the same form fields, Save/Cancel) and Delete (native `window.confirm` before calling `deleteTask` — no new dialog component pulled in for one confirmation).
    - Status/priority badges use `Badge` with custom `bg-*/10 text-*` classes mapped to CLAUDE.md's palette tokens: todo → muted, doing → info (teal), done → success (green); low → muted, medium → warning (amber), high → destructive (red, reuses the badge's existing `destructive` color exactly).
  - Added the `select` shadcn component (`npx shadcn add select`, same `base-nova`/Base UI style as the rest of the project) — first use of a `Select` in this codebase; confirmed `SelectPrimitive`'s Base UI API (`onValueChange`, `SelectItem value=`) works as expected, no Radix-API assumptions bit us this time.
- No schema or RLS changes — session 1's `tasks` table and its `owner_id`-chained policy already covered everything this session needed.

## Live URL

https://glampro.netlify.app/ (unchanged from session 2)

## Env vars

No changes — same `SUPABASE_URL`/`SUPABASE_ANON_KEY` (functions) and `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (client) from sessions 1–2, nothing new needed for this feature.

## Decisions / deviations from CLAUDE.md and the plan

- **`asChild` doesn't exist on this project's `Button`.** Tried `<Button asChild><Link .../></Button>` for the empty-state CTA first (habit from Radix-era shadcn); this project's Base UI-backed `Button` has no `asChild` prop (confirmed against `node_modules/@base-ui/react/button/Button.d.ts`). Fixed by using the pattern `TopBar.tsx` already established: `<Link className={cn(buttonVariants(), ...)}>`. Noting this again (session 1 flagged the same class of Base-UI-vs-Radix API gap for `DropdownMenuTrigger`) since it's now bitten two different components — worth remembering for any future button-as-link case.
- **`use-tasks.ts` is a plain hook, not a context/provider**, unlike `projects-context.tsx`. Deliberate: tasks are only consumed by the Tasks page itself (no top-bar/global usage the way the active project is), so a page-local hook avoids an unnecessary global provider. If a future session needs task data elsewhere (e.g. a Dashboard task-count widget), promote it to a context then rather than pre-building it now.
- **Verification workaround for the auth wall:** same gap session 2 documented — this session's real login can't be driven from an automated browser either. To still get real in-browser verification (not just `tsc`/`build`) before calling this done, a temporary, never-committed debug harness was used: a throwaway `src/pages/__DebugTasks.tsx` mounted at `/__debug-tasks` (added and fully reverted within this session, confirmed via `git diff`/`git status` showing zero trace before committing) rendered the real `Tasks` page with a fake in-memory project and a `window.fetch` shim intercepting only `/rest/v1/tasks` calls (GET/POST/PATCH/DELETE against a local in-memory array), so the real component tree, real Supabase client, and real RLS-driven error path (confirmed: unpatched insert against a fake project correctly surfaced "new row violates row-level security policy for table \"tasks\"" without crashing) could all be exercised without needing Google OAuth or touching a real account's data. This is a heavier verification step than session 2's — worth reusing this pattern (or formalizing it as a real dev-only mock, if it comes up a third time) for any future page that's both behind the auth wall and has enough interactive surface (forms, filters, inline edit) to be worth more than a static screenshot.

## Verification performed

- Local: `npx tsc -b` clean, `npm run build` clean.
- Local, real browser (Playwright), via the temporary debug harness described above:
  - Empty state (no tasks) renders correctly.
  - New-task form: field validation (Add task disabled until title is non-empty), Status/Priority `Select` open/select/close correctly, submits successfully.
  - RLS rejection path (real Supabase, unpatched insert against a nonexistent project) shows the Postgres error message inline without crashing — confirms `createTask`'s error handling is correct end-to-end against the real backend, not just the mocked one.
  - Created-task row: title, status badge ("Doing", teal), priority badge ("High", red), assignee, formatted due date, Edit/Delete buttons all render correctly (screenshot-verified against CLAUDE.md's palette).
  - Edit mode: pre-fills all fields correctly, Cancel discards changes.
  - Filters: status filter correctly narrows "1 of 1 task" → "0 of 1 task" with a "No tasks match these filters" message; reset back to "All statuses" restores it.
  - Delete: native `confirm()` dialog appears with the expected message, accepting it removes the row and returns to the empty state.
  - Mobile (375px): single-column stacking, filter toolbar wraps, no horizontal scroll (`scrollWidth === clientWidth` confirmed), edit/delete icon buttons are 44px touch targets.
  - Zero console errors/warnings throughout every step above.
- Live (https://glampro.netlify.app/), user-completed sign-in then handed control back for the assistant to drive: the user signed in with Google live in the browser (same auth-wall limitation as session 2 — the assistant doesn't touch real Google credentials), then the assistant took over and verified the actual deployed Tasks page against the real account: navigated to `/tasks` under the real active project ("Project 2"), created a real task via the live form (title "Verify live deploy", default `todo`/`medium`), confirmed it appeared with correctly colored badges and the full app shell (navy sidebar, teal active nav state, real avatar) matching the palette, then deleted it via the confirm-dialog flow to leave the account clean. Zero console errors throughout. This closes the verification gap session 2 flagged — full create→display→delete round-trip confirmed live, not just locally against the mocked harness above.

## What session 4 should do first

1. Read this file and CLAUDE.md's "Current status" before anything else.
2. Build `notes` CRUD scoped to the active project (title + content) — per `docs/PLAN.md` Day 4. No schema changes needed; the `notes` table + RLS policy already exist from session 1's `supabase/schema.sql`.
3. Reuse `useProjects()`'s `activeProject` the same way Tasks does; probably fine to use a plain hook (`use-notes.ts`) rather than a context, following this session's reasoning, unless notes end up needed outside the Notes page.
4. Deploy and update this session log / CLAUDE.md status again at the end, per the standard session-close convention.
