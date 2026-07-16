---
type: note
project: CM
title: ChemMemo — Implementation Plan
---

# ChemMemo — Implementation Plan

Hub: [[ChemMemo]] · Vision: [[ChemMemo_Characterization]]

> **How to use this note across sessions:**
> 1. Read the **Progress log** first — it says exactly where we left off.
> 2. Work the current phase's checklist; tick boxes as you finish.
> 3. Before ending a session, update **Progress log** (status table + a dated line) and `next_action` in [[ChemMemo]].
> Each step has a **verify** — don't tick the box until the verify passes.

---

## 🔑 API-key policy (IMPORTANT — decided 2026-07-01)
**No AI API keys are added until the very end.** We build a fully working, keyless lab notebook first (auth, database, structured entry, file linking, exact/filter search, deploy). All AI-feature *code* (embeddings, RAG, summaries, LLM-assisted entry) is written **inert** — it does not run until keys exist. Adding the Anthropic + OpenAI keys and switching the AI on is the **last phase (Phase 10)**. This lets everything get built now without buying a key yet.

## Stack at a glance
- **Frontend:** Next.js (App Router) + React + TypeScript, Tailwind CSS. Port the `chemmemo-design/` mockup.
- **Backend:** Supabase — Postgres + Auth + Storage + `pgvector`.
- **AI (activated Phase 10):** **switchable provider** via `AI_PROVIDER` env (gemini | openai | anthropic — all three code paths kept). **Currently active: Gemini** (`gemini-flash-latest` chat + `gemini-embedding-001` @ 1536 dims), one free key. Switch fast by setting `AI_PROVIDER` + the matching key (`claude-sonnet-5` / `text-embedding-3-small` remain wired). Embeddings always 1536 dims so the `vector(1536)` schema never changes.
- **Retrieval:** hybrid — deterministic SQL filters (keyless) + pgvector semantic search (needs key). The keyless filter path works with no AI at all.
- **Deploy:** Railway (frontend) + Supabase (managed backend). Secrets in Railway env + `.env.local` (never committed).
- **Tooling confirmed present (2026-07-01):** node 24, npm 11, git 2.52, gh 2.95, supabase 2.108. Railway CLI 5.23.3 installed + authenticated (2026-07-02), `use-railway` skill installed. Supabase MCP + Context7 + chrome-devtools + github MCP connected.

---

## Progress log

**Status table** (update each session):

| Phase | Title | Status |
|---|---|---|
| 0 | Foundations & accounts (no AI keys) | ✅ done (2026-07-02) |
| 1 | Auth + app shell | ✅ done (2026-07-02) |
| 2 | Data model & DB (schema + RLS) | ✅ done on dev (2026-07-02) · prod schema deferred |
| 3 | Experiment CRUD UI | ✅ done on dev (2026-07-05) |
| 4 | File handling | ✅ done on dev (2026-07-05) |
| 5 | Keyless search + deploy the MVP | ✅ done on dev (2026-07-05) — keyless MVP shipped |
| 6 | Embeddings pipeline 🔑 *(code only; runs in P10)* | ✅ code done on dev (2026-07-13) |
| 7 | Ask AI — hybrid RAG 🔑 *(code only; runs in P10)* | ✅ code done on dev (2026-07-14) |
| 8 | AI summaries 🔑 *(code only; runs in P10)* | ✅ code done on dev (2026-07-14) |
| 9 | LLM-assisted entry 🔑 *(code only; runs in P10)* | ✅ code done on dev (2026-07-14) |
| 10 | **Add AI API keys → activate & verify AI (LAST)** | 🟡 activated on dev via **Gemini** (2026-07-15); eval set + prod promotion pending |

Legend: ⬜ not started · 🟡 in progress · ✅ done · 🔑 key-gated (build now, activate in Phase 10)

**Session history** (newest first — append a line each session):
- 2026-07-16 — **Pre-prod backlog batch #12/#17/#18 shipped on dev** (commit `1ef18f3`, model: Opus 4.8). User decided to finish ALL remaining audit items before production (no rush on prod). Started with the recommended de-risk batch: **#17** — `ilikeCond()` in `lib/search.ts` double-quotes free-text `.or()` ilike values so `%`, `,`, `(`, `)` are treated as literals, not PostgREST or()-syntax (real latent bug on the AI-router path, e.g. a term like "poly(A)" would break the filter parse; the keyless tokenizer never emits those chars so it was latent). **#18** — `updateExperiment` now drops the cached single-scope `ai_summaries` row (best-effort service-role delete) so an edited experiment shows "regenerate" instead of a stale AI summary. **#12** — dashboard's fake "100% Cited results" stat replaced with "Logged this month" (counts `experiments.created_at` in the current calendar month). Build clean; deploy SUCCESS. **Remaining before prod:** P1 #11 (activity feed); P2 #13–#16 (rename anthropic→llm, next/font, Tailwind decision, README); P3 #20–#24 (autocomplete, group summary, CSV export, Ask streaming, edit history). Then S6 (prod promotion). Owed manual check: create an experiment on dev → confirm a fresh `experiment_embeddings` row.
- 2026-07-16 — **Sprints S3–S5 (audit P1/P2) shipped on dev** (commit `910b2e4`, model: Opus 4.8). User: finish everything that doesn't need prod, leave S6 (prod promotion) for last. **S3** (dynamic sidebar + URL filter parity): `SidebarNav` now renders real `listProjects()` rows linking to `/experiments?project=<id>` (was 4 hardcoded dead links); `layout.tsx` fetches projects; `ExperimentsTable` gained `useEffect`s to re-sync `q`/`project` state from the URL on navigation (so clicking a sidebar project while already on the page re-filters). **S4** (feedback): `components/toast-provider.tsx` (React context + `useToast`, reuses the existing `.toast`/`.toast.show` CSS) wraps the app in `layout.tsx`; file `uploadFile`/`addFileLink`/`removeFile` actions now return a shared `ActionResult` (`lib/types.ts`) instead of throwing, and `FileManager`/`FileList` toast success/error (upload path is the audit's acceptance criterion); added `app/(app)/error.tsx` (retry boundary — no more blank page on a thrown Server Component error), `app/(app)/loading.tsx` (glass skeleton), `app/(app)/ask/loading.tsx` (AI spinner). Left save/AI-gen toasts alone (they redirect / already show inline state). **S5** (retrieval eval): `eval/retrieval-queries.json` (10 queries, honest expected IDs from the real 12 seeds — 6 semantic + 4 deterministic-filter) + self-contained `scripts/eval-retrieval.ts` (`npm run eval:retrieval`, mirrors the backfill's @/-free import pattern so it runs under plain node), computes precision/recall@k, **exits 1 if any query recall < 0.8**. **Verified on dev: 100% recall on all 10 queries, mean precision 56%** (semantic retrieves top-8 so precision is naturally low; recall is the gate). Build clean; deploy SUCCESS. **Only remaining audit P0 is Sprint S6 (prod promotion) — deferred to the end by the user, needs explicit go-ahead.**
- 2026-07-16 — **Sprint S2 (audit P0) shipped on dev** (commit `a65bcbb`, model: Opus 4.8). Implemented audit P0 #3 and #5. (1) **Atomic EXP-ID sequence**: migration `20260716120000_experiment_id_sequence.sql` creates `experiment_id_seq` (seeded just past the current max → START 13) + a `next_experiment_id()` SQL function granted to `authenticated`; `lib/experiment-id.ts` calls it by RPC; removed the racy read-max-plus-one generator from `new/actions.ts`. Migration **applied to chememo-dev only** (`khkpqnpmhravdpbogqai`) — verified seq start=13, unused, fn present. Prod (`iazuubcyxneavrahjgww`) deliberately untouched (that's Sprint S6). (2) **Embedding auto-sync on save**: `lib/sync-embedding.ts` (service-role) re-embeds an experiment on create/update and deletes its `experiment_embeddings` row on soft-delete; wired **fire-and-forget** (`void …catch(log)`) into `createExperiment`/`updateExperiment`/`softDeleteExperiment` so a slow embed API never blocks the redirect (Railway's persistent server finishes it in the background). No-ops without a key. Build clean; deploy SUCCESS; dev routes 307 (new modules load, no runtime crash). ⚠️ **Applying the migration was auto-mode-blocked** as a "production deploy" and required explicit user approval — same guardrail expected for Sprint S6. **Manual verification still owed**: log in on dev, create an experiment, confirm a fresh `experiment_embeddings` row appears (acceptance criterion). **Remaining P0: only Sprint S6 (prod promotion — needs go-ahead).**
- 2026-07-16 — **Sprint S1 (audit P0) shipped on dev** (commit `d159b6c`, model: Sonnet 5). Implemented audit P0 #1 and #2: **mobile navigation** (`components/mobile-nav.tsx` — hamburger toggles the previously-inert `.sidebar.open` CSS drawer, backdrop click, Escape, closes on route change) and **functional global search** (`components/global-search.tsx` — topbar input now navigates to `/experiments?q=…`, was decorative). Also wired URL-param pre-filtering: `experiments/page.tsx` reads `searchParams` (`q`, `project`) and seeds `ExperimentsTable`'s state, so filters are shareable/bookmarkable links. Build clean; route smoke-test confirmed no crashes with the new params. **Remaining P0 from the audit:** embedding-sync-on-save + EXP-ID sequence (Sprint S2 — user deferred, needs a stronger model for the RLS/concurrency subtlety) and **prod promotion** (Sprint S6 — flagged for confirmation before running, since it's a production deploy of the kind auto-mode blocked earlier this session). See [[ChemMemo_Audit_Roadmap]] §4/§5 for the full sprint sequence.
- 2026-07-15 — **Audit added to vault.** Reviewed the comprehensive audit ([[ChemMemo_Audit_Roadmap]]), verified its claims against the `dev` code (Next 16.2.10 / React 19.2.4, no error/loading/not-found routes, Tailwind imported but unused, README still boilerplate — all accurate; the `next/dist/docs` path it cites does exist), and improved it: added an **executive summary (§0)** with the top-5 priorities, flagged the already-shipped Ask loading spinner + dynamic general answers, sharpened the fragile grounded-check recommendation (→ structured output), corrected the similarity-threshold note (env-tunable `SEMANTIC_MIN_SIMILARITY`), generalized the "Sonnet" framing to any coding agent, and added Obsidian frontmatter + `[[wikilinks]]`. Linked from the hub's Project notes. **Its P0 list (embedding-sync-on-save, mobile nav, EXP-ID sequence, prod promotion) is the authoritative backlog for post-build work** — supersedes the looser "next actions" where they overlap.
- 2026-07-15 — **Ask UX + dynamic answers** (commit `a626184`). (1) **Loading state**: `components/ask-box.tsx` — client query box + example chips using `useTransition`; shows a spinning "Thinking…" card while the server does embedding+retrieval+LLM (the page was a server GET form with no feedback before). (2) **Dynamic general answers**: when a question doesn't match any experiment, the AI now still answers from general chemistry knowledge, clearly labelled "General answer — not based on your lab's experiments" (no citations/sources); grounded answers keep `[EXP-###]` + Sources. Mechanism: `semanticSearch` keeps only hits ≥ **0.5** cosine (`SEMANTIC_MIN_SIMILARITY`, tunable; probed on/off-topic = 0.59–0.70 vs 0.41–0.43), and if grounding yields the "no matching" guardrail it falls back to `generateGeneralAnswer`. `AskResult` gained `grounded:boolean`. Verified routing: droplets→grounded(0.68), France/photosynthesis→general(0.41/0.46). Also: plan backed up into the app repo at `docs/` (commit `9e801d1`). ⚠️ docs/ copy is a point-in-time snapshot — re-copy from the vault when refreshing the repo backup.
- 2026-07-15 — **Phase 10 activated via Gemini** (commit `67ab912`). Yishi provided a free **Gemini** API key; wired a **switchable provider layer** (`AI_PROVIDER=gemini|openai|anthropic`) keeping all three backends. Chat: `lib/anthropic.ts` `chatComplete` → Gemini native `generateContent` (**thinkingBudget 0** — 2.5/3.x are thinking models, else they burn the output budget on hidden reasoning and return empty), or OpenAI/Anthropic SDK. Embeddings: `lib/embeddings.ts` → Gemini `embedContent` @ `outputDimensionality 1536` (or OpenAI `dimensions 1536`) — matches `vector(1536)`, **no migration**. Key facts learned: key auth is **query-param `?key=`** (not Bearer); OpenAI-compat chat endpoint 404'd `gemini-2.5-flash` for new users → used **native REST + `gemini-flash-latest`**; free-tier rate limits are real (throttled backfill 600 ms). **Verified end-to-end on dev**: 12/12 embeddings; semantic "droplets/coacervate" → EXP-006/012/004; grounded answer cites [EXP-004/006/012], no hallucination. Key in `.env.local` (gitignored) + Railway dev env only — **not committed**. Cleaned stray test experiments (EXPF/RLS/SD/PROBE/STORTEST) → back to exactly 12 seeds + 12 embeddings. **Pending: retrieval eval set; prod promotion.**
- 2026-07-14 — **Phase 9 complete (code only, inert)** (commit `e59d221`). LLM-assisted entry: `extractExperimentFields` in `lib/anthropic.ts` (Claude parses messy notes → structured-fields JSON, only stated fields, type-coerced, methods restricted to known set; null without key). `extractFromNotes` auth-gated server action. `PasteNotes` box (disabled + Phase-10 note without key) → `NewExperimentClient` sets extracted fields as form `initial` and remounts `ExperimentForm` (keyed) pre-filled; **never auto-saves** — user reviews + clicks Save. `ExperimentForm.initial` relaxed to `Partial<Experiment>`. Build clean, no migration. **⭐ All build phases 0–9 DONE.** The whole app + every AI feature (embeddings, hybrid RAG, summaries, assisted entry) is written and inert, keyless MVP live on dev. **Next: Phase 10 — the finale: obtain Anthropic + OpenAI keys, add to `.env.local` + Railway, run embedding backfill, activate + verify all 🔑 features, eval set, final deploy. (Also still open: promote dev→prod.)**
- 2026-07-14 — **Phase 8 complete (code only, inert)** (commit `da7b1e0`). `summarizeExperiment` in `lib/anthropic.ts` (grounded, 2–3 sentences, never-invent, null without key). `generateSummary(id)` server action (`app/(app)/experiments/[id]/summary-actions.ts`): auth-gated, no-ops without key; else summarize + cache into `ai_summaries` (scope `single`, model=`claude-sonnet-5`, `source_ids=[id]`, timestamp), regenerate deletes+reinserts. Writes via new **service-role** client `lib/supabase/admin.ts` (trusted server-only; `ai_summaries` has no client-write RLS policy so admin write avoids a policy migration). `getExperimentSummary` reads latest cached row (session client, RLS read ok). `SummaryCard` on detail page: shows cached summary + model/date; Generate/Regenerate button only when `isLlmEnabled()`, else Phase-10 note. Build clean; inert (no rows, button hidden). **Group summary deferred** (good-to-have). No migration. **Next: Phase 9 (LLM-assisted entry, code only) — then Phase 10 activates all AI.**
- 2026-07-14 — **Phase 7 complete (code only, inert)** (commit `4c899f2`). `lib/anthropic.ts`: `isLlmEnabled` guard (ANTHROPIC_API_KEY), `routeQuery` (Claude → retrieval-plan JSON), `generateAnswer` (grounded, `[EXP-###]` citations, "no records" guardrail, never-invent) — model `claude-sonnet-5`, both no-op/null without key. `lib/rag.ts` `askAI`: inert → keyless (Phase 5) fallback; enabled → route + `executeFilters` (structured) + `semanticSearch` (`embedText`→`match_experiments`→hydrate) merged/deduped → `generateAnswer`. Refactored `search.ts` to export shared `executeFilters`. Ask screen now flows through `askAI`, renders grounded answer with linked `[EXP-###]` when present, else unchanged keyless view. Build clean; **keyless fallback regression-verified** (pH>8 cycling → EXP-004/009 through the shared path). No migration/DB change (uses existing `match_experiments`). Dev DB was already ACTIVE (restored 07-13). **Next: Phase 8 (AI summaries, code only) or Phase 9 (LLM-assisted entry).**
- 2026-07-13 — **Phase 6 complete (code only, inert)** (commit `2681f08`). `lib/embeddings.ts`: `buildEmbeddingInput` (deterministic), `isEmbeddingEnabled` guard, `embedText`/`embedExperiment` vs `text-embedding-3-small` — all **no-op returning null with no OPENAI_API_KEY**. `match_experiments(vector(1536), match_count)` cosine-distance fn (SECURITY INVOKER → RLS applies, non-deleted only) + hnsw index applied to `chememo-dev`; verified: fn+index exist, `match_experiments` runs and returns 0 rows (correct — 0 embeddings until Phase 10). `scripts/backfill-embeddings.ts` ready-but-not-run (inert path verified). **8/8** builder+guard tests pass (`scripts/test-embeddings.ts`, run via Node 24 type-stripping); `scripts/` excluded from app tsconfig (node-only `.ts` import extensions). ⚠️ **Op note:** free-tier `chememo-dev` **auto-paused after ~8 days idle** — had to `restore_project` (took a few min) before the migration would apply; expect this whenever returning after a gap. Prod `match_experiments` deferred to promotion. **Next: Phase 7 (Ask AI — hybrid RAG, code only).**
- 2026-07-05 — **Phase 5 complete on dev — keyless MVP** (commit `cc596fd`). `lib/search.ts`: deterministic parser → exact Postgres filters (compounds `contains`, metals/methods/mz `overlaps`, pH comparator via gt/lt/gte/lte/eq, reaction `ilike`, free-text `or` over observations/name/notes), each result cited `EXP-###`, shows an "interpreted as" panel + Sources list. **Ask screen** (`app/(app)/ask`), real **dashboard** (hero + stat counters + recent). Structured filters **verified exact** on dev: His+TGA+Zn→001/004/008, m/z 297→001/004/008/009/011, wet-dry cycling pH>8→004/009, depsi+NMR→002/006/010. Free-text is deterministic **keyword** search — honestly returns "no droplets" experiments too (negation is the Phase-7 AI job); UI labels it "text mentions …". Fixed a TS error (dynamic `q[op]()` → explicit gt/lt/gte/lte/eq switch). **This is the shippable keyless MVP (Phases 0–5): auth + typed records + CRUD + files + exact cited search, zero API cost.** ⚠️ Still on `dev` only — promotion to `master`/prod (apply all migrations incl. storage to `chememo` prod, set prod Supabase Auth URL config) is a deliberate separate step. **Next: promote to prod when ready, or build inert AI code (Phases 6–9).**
- 2026-07-05 — **Phase 4 complete on dev** (commit `c68dc0a`). Private Supabase Storage bucket `experiment-files` (10 MB) with `storage.objects` RLS keyed to the experiment id in the object path (`<experiment_id>/<file>`): read if parent experiment readable, insert/update/delete if you own it. Server actions (`app/(app)/experiments/[id]/file-actions.ts`): `uploadFile` (storage + `experiment_files` row, rolls back the object if the row insert fails), `addFileLink` (external OneDrive/Drive URL), `removeFile` (deletes object + row). Detail page resolves **signed URLs** for uploads (private bucket) so files open in a new tab and survive a fresh session; owner-only `FileManager` (upload input auto-submits; add-link form) + two-step remove; non-owners see a read-only list. **Verified 10/10** on dev. **Bug found + fixed:** first storage policies put `storage.foldername(name)` inside `select 1 from experiments e`, where unqualified `name` bound to `experiments.name` (the title) not the object path → every upload denied by RLS; rewrote as `(storage.foldername(name))[1] in (select e.id …)` (path evaluated at outer scope). Original migration file also corrected so a fresh prod apply is right. **Next: Phase 5 (keyless search + ship MVP).**
- 2026-07-05 — **Phase 3 complete on dev** (commit `7dbea3f`). Experiment CRUD wired to Supabase (`chememo-dev`): `lib/types.ts` + `lib/experiments.ts` (server data access, `deleted_at` filtered). Experiments **table** = live client search + sortable headers + project/pH filter chips over the 12 seeds. Shared **New/Edit form** (`components/experiment-form.tsx`) with compound/metal tag inputs, method multi-select, typed pH/cycles/mz; server actions in `app/(app)/new/actions.ts` insert/update with `owner_id`, new IDs continue `EXP-###`. **Detail** page: spec grid, m/z chips, linked files, owner-only Edit + two-step soft-delete (RLS-enforced). Build clean; **9/9 CRUD+RLS checks** on dev (create typed row → types preserved → pH>8 filter → edit persists → B can't edit A → soft-delete hides). *Deferred (noted good-to-haves):* compound/metal autocomplete still free-text; method-filter chip (search covers it); live form summary trimmed. **Next: Phase 4 (file handling) or Phase 5 (keyless search + ship MVP).**
- 2026-07-02 — **Phase 2 complete on dev** (commit `3fe7f48`). Schema-as-code in `supabase/migrations/`: `init_schema` (pgvector + 6 tables + `set_updated_at`/`handle_new_user` triggers + RLS), `seed_reference_and_experiments` (4 projects, EXP-001…012, 34 files from mockup `data.js`), `fix_soft_delete_rls`. Applied to **chememo-dev** via Supabase MCP. **RLS verified 10/10** with two real users (read-all; edit-own; owner-spoof blocked; B can't read/edit A's soft-deleted row; A sees own soft-deleted; profiles trigger fires). Deterministic `pH>8` filter returns EXP-004+EXP-009 (Phase-5 groundwork). **Bug found + fixed:** soft-delete was self-blocking — SELECT policy `deleted_at is null` made a just-deleted row fail row-security on its own UPDATE (`new row violates RLS`, reproduced in pure SQL); fix broadens read to `deleted_at is null OR owner_id = auth.uid()` (others still can't see deleted rows; app list queries still filter `deleted_at is null`). **Duplicate-signup UX** (Yishi's ask): Supabase hides "email exists" to prevent enumeration → returns a user with `identities: []`, no error, no session; `/login` now detects empty-identities and shows "account already exists — sign in" instead of a misleading confirm notice. ⚠️ **Prod schema deferred** — auto-mode correctly blocked applying migrations to `chememo` (prod); do it at promotion time (`master` merge) with approval. **Next: Phase 3 (Experiment CRUD UI).**
- 2026-07-02 — **Bugfix** (commit `4da2770` on `dev`): Yishi hit "confirm link didn't work / sign-out errored" on the dev site. Root cause: behind Railway's proxy `request.url` reports the container-internal host (`localhost:8080`), so absolute redirects built from it (signout → login, auth callback → dashboard) sent the browser to the user's own machine; the confirm link *did* verify the account (hence sign-in worked). Fixed both routes to use **relative `Location` headers**. ⚠️ Still pending (dashboard-only, needs Yishi): Supabase **URL Configuration** on `chememo-dev` — set Site URL to `https://chememowebapp-dev.up.railway.app` and add `https://chememowebapp-dev.up.railway.app/auth/callback` (+ `http://localhost:3000/**`) to Redirect URLs, else confirmation emails still redirect to localhost:3000. Same change needed on `chememo` (prod) with the production URL before Phase 5 ships.
- 2026-07-02 — **Phase 1 complete** (commit `bd54dc0` on `dev`). Supabase email/password auth via `@supabase/ssr`: `lib/supabase/{client,server,middleware}.ts` + root `middleware.ts` (session refresh + gating). Mockup ported: full `chemmemo.css` + bg assets carried over; `/login` (login/signup toggle, PKCE `/auth/callback`, `/auth/signout`); gated `(app)` shell — sidebar nav (Dashboard/Experiments/New/Ask AI + project links), topbar, theme toggle, user pill w/ initials + sign-out; placeholder pages for Phases 3/5. **Verified headlessly:** `npm run build` clean; test user `test.user@chememo-lab.dev` created (admin-confirmed) on `chememo-dev`, password sign-in returns valid session + metadata; `/`+`/dashboard` → 307 `/login`, `/login` → 200. Local `.env.local` now points at `chememo-dev`. *Notes:* real signups still require email confirmation (autoconfirm not enabled — Management API token unavailable from CLI keyring); Next.js warns `middleware` convention → rename to `proxy` someday; recommend a quick browser smoke-test of login/logout on the dev URL. **Next: Phase 2 (schema + RLS as supabase migrations).**
- 2026-07-02 — **Phase 0.5 complete.** `dev` branch pushed (`master`=production, `dev`=WIP); `supabase init` committed (Phase 2 schema goes in `supabase/migrations/*.sql`). Yishi deleted `platepost` (freed the 2-project limit) and installed the Railway GitHub App. Then: created Supabase project **`chememo-dev`** (ref `khkpqnpmhravdpbogqai`, eu-central-1, $0) and repointed the Railway **dev** environment's 3 Supabase vars at it (keys set directly, never written to disk/chat — re-fetch anytime with `supabase projects api-keys --project-ref khkpqnpmhravdpbogqai`). **Railway↔GitHub auto-deploy verified end-to-end:** push to `dev` auto-built + deployed (SUCCESS), push to `master` auto-deployed production (SUCCESS). Pipeline is now: commit → push → auto-deploy per branch. ⚠️ Local `.env.local` still points at the *production* Supabase — switch it to `chememo-dev` values when Phase 1 dev work starts.
- 2026-07-02 — Railway now has two environments in project `chememo_webapp`: **production** (https://chememowebapp-production.up.railway.app) and **dev** (https://chememowebapp-dev.up.railway.app), each with its own variables/deploys (dev duplicated from production, Supabase vars copied). Workflow: `railway up -e dev -s chememo_webapp` for WIP, promote with `-e production` when good. Decided **against** splitting the repo into frontend/backend folders — Supabase *is* the backend; a lone Next.js app is the professional norm for this stack. ⚠️ Both envs share the one Supabase project for now; consider a second free Supabase project for dev once real data exists.
- 2026-07-02 — **Phase 0 complete.** Supabase project `chememo` created (ref `iazuubcyxneavrahjgww`, eu-central-1, free tier). App scaffolded at `C:\dev\chememo_webapp` (create-next-app: TS, App Router, Tailwind, ESLint) — placed outside OneDrive because the course-folder path (apostrophe + Hebrew) breaks Node tooling. `output: 'standalone'` set; deps added (`@supabase/supabase-js`, `@supabase/ssr`, inert `@anthropic-ai/sdk` + `openai`); `.env.local` holds Supabase URL + anon + service_role (gitignored). GitHub: private repo `yishiezerzer-dot/chememo_webapp` (branch `master`). Railway: project `chememo_webapp` deployed with Supabase env vars → **https://chememowebapp-production.up.railway.app** (first build failed on `npm ci` lockfile drift — fixed by regenerating `package-lock.json`). Verify passed: local dev HTTP 200 + env vars load server-side; Railway URL HTTP 200. **Next: Phase 1 (Auth + app shell).**
- 2026-07-02 — Switched deploy target from Vercel to **Railway** (installed Railway CLI 5.23.3, `use-railway` skill, authenticated as Yishi Ezerzer). Updated Stack + Phases 0/5/10 accordingly; portability guardrails now list Render/Fly as fallback hosts instead of Vercel.
- 2026-07-01 — Restructured so AI API keys are the final step (Phase 10). Confirmed CLIs (node/npm/git/gh/supabase present; installed vercel). Supabase MCP connected. **Next: Phase 0.**
- 2026-07-01 — Plan authored. Decisions locked (Next.js + Supabase + Claude/OpenAI, hybrid retrieval, upload-small/link-big). No code yet.

---

## Phase 0 — Foundations & accounts
Goal: everything installed, accounts created, a blank Next.js app deploys.
- [x] Create **Supabase** project; copy Project URL, `anon` key, `service_role` key into [[ChemMemo]] secrets checklist (locally, not in git). *(→ `chememo`, ref `iazuubcyxneavrahjgww`; keys live in `C:\dev\chememo_webapp\.env.local`)*
- [x] 🔑 **AI API keys are NOT obtained now** — deferred to Phase 10. Skip Anthropic/OpenAI for the whole build until then.
- [x] Scaffold app: `npx create-next-app@latest chememo_webapp` (TypeScript, App Router, Tailwind, ESLint). *(→ `C:\dev\chememo_webapp`)*
- [x] **Portability guardrails (keep host-swap an afternoon, not a migration):** (1) set `output: 'standalone'` in `next.config.js` so a Dockerfile / `next start` on Railway (or Render/Fly as a fallback) is trivial; (2) **no host-proprietary storage or cron** — all data/auth/storage/vectors stay in Supabase; if scheduling is needed later use Supabase `pg_cron` or a GitHub Action, and keep API routes on the Node runtime. Rationale: state lives in Supabase, so only the stateless Next.js app ever moves. See [[ChemMemo]] decisions.
- [x] Add deps: `@supabase/supabase-js @supabase/ssr` now. (`@anthropic-ai/sdk openai` can be added now as deps but stay unused until Phase 10.)
- [x] Create `.env.local` with Supabase values only; add `.env*` to `.gitignore`.
- [x] Init git repo; push to GitHub; create a **Railway** project from the repo (`railway init` / `railway up` or link the GitHub repo in the Railway dashboard); add the Supabase env vars in Railway. *(→ private repo `yishiezerzer-dot/chememo_webapp`; Railway project `chememo_webapp`, live at https://chememowebapp-production.up.railway.app)*
- **Verify:** `npm run dev` shows the app locally **and** the Railway URL serves the default page. Supabase env vars load server-side.

## Phase 1 — Auth + app shell
Goal: real login gates a real app shell; the mockup's navigation works in React.
- [x] Supabase Auth: email/password (magic-link optional later).
- [x] Supabase browser + server clients (`lib/supabase/client.ts` + `lib/supabase/server.ts` via `@supabase/ssr`).
- [x] Port mockup **Auth** screen (login/signup toggle) to a real `/login` route.
- [x] Middleware / server checks: unauthenticated users are redirected to `/login`; authenticated users reach `/dashboard`.
- [x] App shell + nav (Dashboard / Experiments / New / Ask AI) ported from mockup; theme toggle carried over.
- **Verify:** sign up a test user → confirm email flow → log in → land on dashboard → refresh keeps session → log out returns to `/login`. Direct-URL to a gated page while logged out redirects.

## Phase 2 — Data model & DB (schema + RLS)
Goal: typed schema, security, seed data. **See "Data model" appendix below for exact SQL.**
- [x] Enable `pgvector` extension (so the embeddings column exists; it just won't be populated until Phase 10).
- [x] Create tables: `profiles`, `projects`, `experiments`, `experiment_files`, `experiment_embeddings`, `ai_summaries` (see appendix).
- [x] Typed/unit-aware columns (numeric pH, temp, cycles; arrays for compounds/metals/methods/mz); `owner_id`, `created_at`, `updated_at`, `deleted_at` (soft delete).
- [x] `updated_at` trigger; `profiles` auto-row trigger on new auth user.
- [x] **RLS**: authenticated users **read all** non-deleted rows (lab-shared); **insert/update/delete only own** (`owner_id = auth.uid()`). *(read policy also lets an owner see their own soft-deleted rows — required so the soft-delete UPDATE itself passes row-security.)*
- [x] Seed from the mockup `data.js` (EXP-001…EXP-012) so there's real content to test search. *(4 projects, 12 experiments, 34 files)*
- **Verify:** rows visible in Supabase Table Editor; as user A you can read B's rows but **cannot** edit them (RLS denies); soft-deleted rows hidden from normal queries.

## Phase 3 — Experiment CRUD UI (port the mockup)
Goal: create / list / view experiments against Supabase.
- [x] **Experiments table** page: fetch from Supabase; client search + sortable headers + filter chips (project / pH). *(method-filter chip deferred; search already matches method text)*
- [x] **New Experiment** form → typed insert; tag inputs (compounds/metals), method multi-select. *(live summary preview trimmed to a save panel — can revisit)*
- [x] **Experiment detail** page: full record, m/z chips, linked-file rows.
- [ ] Compound/metal **autocomplete** from existing values (good-to-have; stub now, fill later). *(still a stub — free-text tag input; deferred)*
- [x] Edit + soft-delete own experiments. *(owner-only, RLS-enforced; two-step confirm delete)*
- **Verify:** create a new experiment in the UI → it appears in the table → open detail shows all fields correctly → filter `pH > 8` returns the right rows → editing persists after refresh.

## Phase 4 — File handling (upload small, link big)
Goal: attach evidence to experiments realistically.
- [x] Supabase **Storage** bucket (`experiment-files`, private, 10 MB) with RLS aligned to experiments (path `<experiment_id>/<file>`; read if parent readable, write/delete if owner).
- [x] Upload path for images/spectra screenshots (private bucket → short-lived **signed URLs** to open; regenerated each render).
- [x] External-link rows for big LC-MS folders / Excel (OneDrive/Drive URL + label + type icon).
- [x] `experiment_files` rows tie both kinds to an experiment. *(upload rollback if row insert fails; owner-only remove deletes storage object + row)*
- **Verify:** upload a microscopy image → shows on detail page and reopens from a fresh session; add a OneDrive link → clicking opens it; access respects login.

## Phase 5 — Keyless search + deploy the MVP
Goal: a genuinely useful notebook **with zero AI keys**, shipped.
- [x] **Structured / exact search UI** ("Ask" screen, keyless mode): `lib/search.ts` parses NL-ish query → deterministic Postgres filters (compounds `contains`, metals/methods/mz `overlaps`, pH comparator, reaction `ilike`, free-text `or`). Fully cited with `EXP-###` + Sources list. Structured filters exact & verified; free-text is keyword-only and honestly labelled "text mentions …" (negation e.g. "no droplets" → Phase 7 semantic/AI).
- [x] UX polish: empty / no-filter / no-match states, interpreted-as panel, example chips, theme + responsive carried from mockup CSS. *(dedicated loading.tsx spinner not added — SSR is fast; could add later)*
- [x] Deploy to Railway (dev, auto-deploy from `dev`); smoke-test loop verified. *(prod deploy = promotion step, see below)*
- **Verify:** a fresh account can do the full keyless loop on the live URL. The lab could start using this today, no API cost. This is the shippable keyless MVP.

## Phase 6 — Embeddings pipeline 🔑 (code only; activates in Phase 10)
Goal: write the semantic-search plumbing now; it stays inert until keys exist.
- [x] Build the embedding **input string** builder (name + reaction + compounds + metals + methods + observations + notes) — `buildEmbeddingInput` in `lib/embeddings.ts`, pure + deterministic, unit-tested.
- [x] Write the embed call against OpenAI `text-embedding-3-small` behind a guard (`isEmbeddingEnabled` → `!!OPENAI_API_KEY`) that **no-ops (returns null)** when no key is set.
- [x] `match_experiments(query_embedding vector(1536), match_count)` SQL function (cosine distance `<=>`, SECURITY INVOKER so RLS applies) over non-deleted rows, + hnsw index. Applied to `chememo-dev`.
- [x] Backfill **script** ready to run (but not run): `scripts/backfill-embeddings.ts` — inert path prints a Phase-10 notice and exits.
- **Verify (deferred to Phase 10):** with a key, backfill populates vectors and `match_experiments` returns sensible neighbors for *"samples that formed droplets"*. Until then: unit-test the input-string builder and confirm the guard no-ops cleanly with no key.

## Phase 7 — Ask AI — hybrid RAG 🔑 (code only; activates in Phase 10)
Goal: write the full RAG path; the keyless filter path (Phase 5) keeps working meanwhile.
- [x] **Router**: `routeQuery` in `lib/anthropic.ts` — guarded Claude call → intent JSON `{mode, filters, semanticQuery}`; returns null (→ keyless fallback) when no key or unparseable.
- [x] **Structured path**: `executeFilters(filters)` extracted from `search.ts`, shared by keyless + AI; parameterized PostgREST operators (contains/overlaps/comparator/ilike), never string-concat SQL.
- [x] **Semantic path**: `semanticSearch` in `lib/rag.ts` — `embedText` → `match_experiments` RPC → hydrate rows in similarity order. Returns [] with no key.
- [x] Merge/dedupe retrieved records (Map by id) → `formatRecord` context with `[EXP-###]` IDs.
- [x] **Generation**: `generateAnswer` — Claude (`claude-sonnet-5`) answers **only** from provided records, inline `[EXP-###]` citations (linked in UI) + Sources. Guardrail: no records → "No matching experiments found"; never-invent system prompt. Inert (null) without key.
- **Verify (deferred to Phase 10):** the 7 example questions (PDF §7) return correct, cited answers; an unanswerable question returns the no-match message. Until then: verify the keyless fallback still answers exact-filter questions.

## Phase 8 — AI summaries 🔑 (code only; activates in Phase 10)
Goal: grounded summaries, code-complete but inert without a key.
- [x] **Single-experiment summary**: `summarizeExperiment` (grounded, never-invent); `generateSummary(id)` server action caches into `ai_summaries` (scope `single`, `source_ids=[id]`); `SummaryCard` on detail page — Generate button only when key present, else "activates in Phase 10" note.
- [ ] **Group summary** (good-to-have): summarize the current filtered set. *(deferred — good-to-have; single-experiment done)*
- [x] Cache summaries; regenerate button; note model + timestamp. *(regenerate replaces the single-scope row; card shows model + date)*
- **Verify (deferred to Phase 10):** summary of EXP-001 mentions only its real fields; regenerating after an edit updates it; no invented values.

## Phase 9 — LLM-assisted entry 🔑 (code only; activates in Phase 10)
Goal: paste messy notes → pre-filled structured form (biggest adoption lever), inert without a key.
- [x] "Paste notes" box on New Experiment → `extractExperimentFields` (Claude → structured JSON, only stated fields, coerced/validated, methods restricted to the known set). `PasteNotes` disabled + Phase-10 note when no key.
- [x] Pre-fill the form for the **user to confirm/edit** before saving — `NewExperimentClient` sets extracted fields as form `initial` and remounts the form; nothing auto-saves (user still clicks Save).
- **Verify (deferred to Phase 10):** paste a realistic note → fields populate → user edits one → saved record matches edited values.

## Phase 10 — Add AI API keys → activate & verify AI (THE LAST PHASE)
Goal: buy/add keys once, flip everything on, verify, and add the eval story.
- [x] ~~Obtain Anthropic + OpenAI keys~~ → used a **free Gemini key** instead (single key covers chat + embeddings via the switchable provider layer).
- [x] Add to `.env.local` (gitignored) **and** Railway **dev** env; guards flip on automatically (`isLlmEnabled`/`isEmbeddingEnabled` read the active provider key).
- [x] Run the **embedding backfill** — 12/12 experiments embedded on `chememo-dev` (`scripts/backfill-embeddings.ts`, throttled 600 ms for free-tier).
- [x] Activate & verify **Phase 6/7** on dev (`scripts/verify-ai.ts`): semantic query "droplets/coacervate" → EXP-006/012/004 top by cosine; grounded answer cites [EXP-004/006/012] and excludes the fiber/non-droplet records in context (no hallucination). **Phase 8/9** chat path live (same `chatComplete`).
- [ ] **Retrieval eval set**: ~10 questions with expected experiment IDs + precision/recall script. *(pending)*
- [ ] Final deploy — dev is live on Gemini; **prod promotion still pending** (apply all migrations to `chememo` prod, set its env + Auth URLs). *(pending)*
- **Verify:** every 🔑 phase's deferred verify now passes on the live URL; eval script prints scores. AI is live.

---

## MVP cut line
**Keyless MVP = Phases 0–5.** That already satisfies the course PDF §10 for everything except the AI answer/summary, and is usable by the lab immediately at zero API cost. The AI layer (Phases 6–9 code + Phase 10 activation) upgrades it to the full RAG notebook once a key is available.

## Suggested order
0 → 1 → 2 → 3 → 4 → **5 (ship keyless notebook)** → build inert AI code 6 → 7 → 8 → 9 → **10 (add keys, activate, eval) LAST**. If a key appears earlier than expected, Phase 10 can simply be pulled forward — nothing else depends on its position.

---

## Appendix A — Data model (draft SQL, refine in Phase 2)
```sql
-- extensions
create extension if not exists vector;

-- profiles: one row per auth user
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  initials text,
  created_at timestamptz default now()
);

-- projects: lab research programs (wet-dry, depsi, lcms, micro)
create table projects (
  id text primary key,            -- e.g. 'wet-dry'
  label text not null,
  color text
);

-- experiments: the core record
create table experiments (
  id text primary key,            -- e.g. 'EXP-001' (or use uuid + display code)
  name text not null,
  date date,
  researcher text,
  owner_id uuid references auth.users(id) default auth.uid(),
  project text references projects(id),
  reaction_type text,
  compounds text[] default '{}',
  metals text[] default '{}',
  ph numeric,
  concentration text,             -- free text (mixed units) for now
  temperature text,               -- free text (e.g. '60 C dry-down')
  cycles int,
  methods text[] default '{}',
  mz numeric[] default '{}',
  observations text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz          -- soft delete
);

-- linked files: uploads (storage) OR external links
create table experiment_files (
  id uuid primary key default gen_random_uuid(),
  experiment_id text references experiments(id) on delete cascade,
  kind text check (kind in ('upload','link')),
  file_type text,                 -- 'excel','folder','image','pdf','spectrum'...
  label text,
  storage_path text,              -- for uploads (Supabase Storage)
  url text,                       -- for external links (OneDrive/Drive)
  created_at timestamptz default now()
);

-- embeddings for semantic search over free text (populated in Phase 10)
create table experiment_embeddings (
  experiment_id text primary key references experiments(id) on delete cascade,
  content text,                   -- the string that was embedded
  embedding vector(1536),         -- text-embedding-3-small
  updated_at timestamptz default now()
);

-- generated summaries (grounded; populated in Phase 10)
create table ai_summaries (
  id uuid primary key default gen_random_uuid(),
  experiment_id text references experiments(id) on delete cascade,
  scope text,                     -- 'single' | 'group'
  summary text,
  model text,
  source_ids text[],              -- experiment IDs used as evidence
  created_at timestamptz default now()
);
```
RLS sketch (Phase 2 detail): enable RLS on all tables; policy `read`: `auth.role() = 'authenticated' and deleted_at is null`; policy `write`: `owner_id = auth.uid()`.

## Appendix B — Target folder structure (from PDF §12, adapted)
```
chememo_webapp/
  app/ (login, dashboard, experiments, experiments/[id], new, ask)
  components/ (ExperimentForm, ExperimentTable, SearchChat, FileRow, ...)
  lib/ (supabaseClient.ts, rag.ts, embeddings.ts, auth.ts, anthropic.ts)
  database/ (schema.sql, seed.sql, policies.sql)
  README.md
```

## Appendix C — Watch-outs
- **AI keys are Phase 10 only.** Keep all Anthropic/OpenAI calls behind a guard that no-ops (or falls back to keyless filter search) when the key env var is absent — so the app never crashes pre-key.
- **Secrets**: `service_role` and (later) API keys are server-only — never expose in client code or commit them.
- **SQL from LLM output**: always parameterize; the LLM produces *filter params*, not raw SQL.
- **Embedding dim** must match the model (1536 for `text-embedding-3-small`) or pgvector errors.
- **Cross-session**: keep this note's Progress log current — it's the single source of "where we are".
