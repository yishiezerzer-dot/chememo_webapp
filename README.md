# ChemMemo — AI Lab Notebook

An online, AI-assisted lab notebook for prebiotic chemistry in the **MFP (Frenkel-Pinter) lab**. Structured experiment records + linked analytical files + natural-language querying (RAG) over past experiments.

- **Live (production):** https://chememowebapp-production.up.railway.app
- **Dev:** https://chememowebapp-dev.up.railway.app

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) · React 19 · TypeScript · Turbopack |
| Backend | Supabase — Postgres + Auth + Storage + `pgvector` |
| AI (switchable) | Gemini (default) / OpenAI / Anthropic via `AI_PROVIDER` |
| Hosting | Railway (app) + Supabase (data); GitHub auto-deploy |

Multi-user from day one: **read-all, edit-own** via Postgres RLS.

## Architecture

- **Auth & RLS** — `@supabase/ssr` cookie sessions; every table is RLS-guarded (read-all, owner-only writes). Service-role client (`lib/supabase/admin.ts`) is used only for trusted server writes (AI summaries, embedding sync).
- **Retrieval (RAG)** — `lib/rag.ts` orchestrates: an LLM router (`routeQuery`) turns a question into structured filters + a semantic query → deterministic Postgres filters (`lib/search.ts`) and/or `pgvector` nearest-neighbour (`match_experiments` RPC) → a grounded, `[EXP-###]`-citing answer, falling back to a labelled general-knowledge answer when nothing relevant matches (threshold `SEMANTIC_MIN_SIMILARITY`, default 0.5).
- **Embeddings** — `lib/embeddings.ts` (1536-dim). Kept current on every save by `lib/sync-embedding.ts`; one-off backfill via `scripts/backfill-embeddings.ts`.
- **Provider abstraction** — `lib/anthropic.ts` (chat) + `lib/embeddings.ts` dispatch on `AI_PROVIDER`; switching providers is a one-line env change.

## Local development

```bash
npm install
# create .env.local (see below), then:
npm run dev            # http://localhost:3000
```

### Environment variables (`.env.local` — never commit)

```
NEXT_PUBLIC_SUPABASE_URL=          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon key
SUPABASE_SERVICE_ROLE_KEY=         # service role — server-only, never client
AI_PROVIDER=gemini                 # gemini | openai | anthropic
GEMINI_API_KEY=                    # when AI_PROVIDER=gemini
GEMINI_CHAT_MODEL=gemini-flash-latest
GEMINI_EMBED_MODEL=gemini-embedding-001
# OPENAI_API_KEY= / ANTHROPIC_API_KEY= for the other providers
SEMANTIC_MIN_SIMILARITY=0.5        # optional; grounded/general answer cutoff
```

Without an AI key the app runs fully as a **keyless notebook** (deterministic search, no LLM) — the AI layer is inert by design.

## Scripts

```bash
npm run dev                # dev server
npm run build              # production build
npm run lint               # eslint
npm run eval:retrieval     # retrieval precision/recall vs eval/retrieval-queries.json
node --env-file=.env.local scripts/backfill-embeddings.ts   # (re)build all embeddings
```

## Database

Migrations live in `supabase/migrations/`. Apply with the Supabase CLI (`supabase db push`) or the dashboard SQL editor. Notable objects: `experiments`, `experiment_files`, `experiment_embeddings` (HNSW cosine index), `ai_summaries`, `projects`, the `match_experiments` RPC, and the `experiment_id_seq` sequence (`next_experiment_id()`).

## Deployment

Railway builds from GitHub: **`master` → production**, **`dev` → dev**. Each environment has its own Supabase project and env vars. Promoting a change: merge to the target branch, then ensure that environment's Supabase has the matching migrations and its embeddings backfilled.

## Supabase projects

- Production: `chememo` (ref `iazuubcyxneavrahjgww`, eu-central-1)
- Dev: `chememo-dev` (ref `khkpqnpmhravdpbogqai`, eu-central-1)

Full build plan, audit, and roadmap live in `docs/` (synced from the project's Obsidian vault).
