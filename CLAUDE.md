# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev                  # dev server on :3000
npm run build                # production build (Next 16 / Turbopack)
npm run typecheck            # tsc --noEmit
npm run lint                 # eslint
npm test                     # vitest run — all of tests/
npm run test:e2e             # playwright
npm run test:rls             # RLS suite only (see caveat below)
npm run types:gen            # regenerate lib/database.types.ts from the linked Supabase project
npm run eval:retrieval       # retrieval precision/recall against eval/retrieval-queries.json
```

CI (`.github/workflows/ci.yml`) runs, in order: `typecheck`, `lint`, `test`, `build`, then Playwright.
Run those four locally before pushing — they are the whole gate.

Running one test:

```bash
npx vitest run tests/lib/rag.test.ts        # one file
npx vitest run -t "fuses ranked lists"      # one test by name
npx playwright test tests/e2e/search.spec.ts
npx playwright test -g "sort by id"
```

Playwright builds and starts a production server itself; set `PLAYWRIGHT_BASE_URL` to run against a
deployed environment instead. `workers: 1` is deliberate — every spec signs in as the same shared
E2E account and concurrent logins corrupt each other's sessions.

**`tests/rls/` does not run on this machine.** Each suite is `describe.skipIf(!SUPABASE_LOCAL_URL)`,
which is only set after `supabase start` — that needs Docker, which this dev box does not have. They
execute solely in CI's `rls` job. `npm test` discovers and silently skips them, so a green local run
says nothing about RLS. Changing a policy means reading the migration and trusting CI.

## Architecture

Next.js 16 App Router + React 19 + TypeScript (strict) over Supabase (Postgres + Auth + Storage +
`pgvector`). Deployed on Railway: `master` → production, `dev` → dev, each against its own Supabase
project. Full plan, audits and specs live in `docs/` (synced from the Obsidian vault — see AGENTS.md).

### Layering

`app/(app)/**/page.tsx` (Server Components) → colocated `actions.ts` (`"use server"`) →
`lib/<domain>/service.ts` (all data access and domain logic) → Supabase. `components/` holds the
client components. Domain logic does not live in actions or pages; an action's job is auth, calling a
service, `revalidatePath`, and mapping errors.

### Three Supabase clients — pick deliberately

| Client | RLS | Use |
|---|---|---|
| `lib/supabase/server.ts` | enforced | default for everything server-side |
| `lib/supabase/client.ts` | enforced | browser |
| `lib/supabase/admin.ts` | **bypassed** | trusted server writes only (AI summaries, embedding sync, job queues) |

`admin.ts` is `server-only` and bypasses every policy. Reach for it only where a table is
deliberately read-only under RLS and the write is machine-generated.

### Auth and authorization are separate concerns

`middleware.ts` → `lib/supabase/middleware.ts` refreshes the session cookie and redirects anonymous
requests to `/login` (public: `/login`, `/auth`, `/api/health`). Do not insert code between
`createServerClient` and `getUser()` there — it causes random logouts.

Every server action opens with `requireUser()` or `requireWorkspace()` from
`lib/authorization/policies.ts`. That is only the "is anyone signed in" check. **Real authorization
is Postgres RLS** (read-all, edit-own, workspace-scoped) — enforcing permissions in TypeScript
instead of a policy is the wrong layer.

Workspace scoping has two entry points with intentionally different failure modes:
`requireWorkspace()` redirects to `/workspaces/new` (write paths), while `activeWorkspaceId()`
returns `null` (read paths) meaning "do not filter" — a redirect from inside a data fetch is worse
than an unscoped-but-RLS-safe read. A stale or forged `cm_workspace` cookie falls back to the user's
first membership; it can never scope someone into another workspace.

### Errors

Throw `AppError(code, message)` from `lib/errors.ts`; actions return
`toActionResult(context, error)`. That logs the real cause server-side under a `traceId` and returns
a user-safe `ActionResult` carrying `(ref <traceId>)` so a bug report correlates to a log line.
`instrumentation.ts`'s `onRequestError` is the catch-all for anything that never went through it.

### Types come from the database

`lib/types.ts` derives its table types from the generated `lib/database.types.ts`. **After any
migration, run `npm run types:gen`** — that is what makes a renamed column a type error instead of
silent drift.

### AI layer

Four tiers, each usable without the ones above it:

1. `lib/llm.ts` — provider-agnostic chat, switched by `AI_PROVIDER` (`gemini` | `openai` |
   `anthropic`). **Inert without a key**: every entry point returns `null` and the app degrades to
   deterministic keyless search. Keep that path working — it is a supported mode, not a fallback.
2. `lib/rag.ts` — `routeQuery` turns a question into structured filters + a semantic query, runs
   deterministic Postgres filters (`lib/search.ts`) and `pgvector` nearest-neighbour
   (`match_experiments` RPC), fuses them with reciprocal-rank fusion, and returns a `[EXP-###]`-citing
   answer plus a per-record `MatchExplanation` ("why it matched"). Below `SEMANTIC_MIN_SIMILARITY`
   (default 0.5) it returns a labelled general-knowledge answer instead.
3. `lib/ai/service.ts` — rate limiting, concurrency slots, and `ai_requests` observability logging
   around every AI entry point.
4. `lib/ai/crew/` — four agents over one shared draft, fixed sequence Intake → Design → Controls →
   Critic, never parallel. The whole run holds **one** concurrency slot, not one per agent.

`PROMPT_VERSIONS` in `lib/llm.ts` is bumped by hand alongside any prompt-text edit, so feedback and
eval data stay correlatable across revisions.

### Background jobs

A DB trigger enqueues an `index_jobs` row in the same transaction as the experiment write, so the job
survives a crash between the write and the embed call. `instrumentation.ts` starts three safety-net
pollers on boot (index jobs, file jobs, evidence chunks), Node runtime only. Callers `void` the
fast-path promise so a slow embedding API never blocks a redirect.

### Migrations

Timestamped SQL in `supabase/migrations/`, applied with `supabase db push`. CI's `rls` job runs
`supabase start` against a fresh Postgres, so a SQL error in any migration fails CI — that step
doubles as migration validation.

## Gotchas

- `next.config.ts` sets `serverActions.bodySizeLimit: "12mb"`. It must stay above `MAX_UPLOAD_BYTES`
  in `lib/files/limits.ts` with multipart headroom, or uploads 413 before the app's own size message
  is ever reached.
- HSTS is deliberately absent from the security headers — Railway terminates TLS, so it belongs at
  the edge.
- E2E fixtures are cleaned up by `tests/e2e/global-teardown.ts`, gated on `E2E_CLEANUP_ENABLED` and
  hard-refusing to run against production. Leave both guards intact.
- `npm audit` and the dependency scan in CI are non-blocking on purpose: the high-severity findings
  trace to `eslint-config-next`'s own dependency tree.
