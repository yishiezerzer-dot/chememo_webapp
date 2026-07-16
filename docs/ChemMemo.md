---
type: project
project_id: CM
title: ChemMemo AI Lab Notebook
status: active
priority: high
next_action: Audit sprints S1–S5 all shipped to dev (2026-07-16, [[ChemMemo_Audit_Roadmap]]). S1 mobile nav + global search; S2 embedding sync on save + EXP-ID DB sequence (migration on chememo-dev only, seeded EXP-013); S3 dynamic sidebar project filters + URL parity; S4 toasts + error/loading boundaries; S5 retrieval eval set (npm run eval:retrieval — 100% recall on dev). **The ONLY remaining item is Sprint S6 (prod promotion), deliberately deferred to the end by the user — needs explicit go-ahead: apply all migrations to prod `chememo`, set prod Railway env (AI_PROVIDER/Gemini key/Auth URLs), run backfill on prod.** Manual check still owed: create an experiment on dev and confirm a fresh experiment_embeddings row (S2 acceptance). AI is LIVE on dev via Gemini (switchable via AI_PROVIDER). (Reminder: chememo-dev auto-pauses after ~8 days idle — restore_project first.)
---

# 🧪 ChemMemo — AI Lab Notebook

> An online, AI-assisted lab notebook for prebiotic chemistry in the MFP (Frenkel-Pinter) lab.
> Structured experiment records + linked analytical files + natural-language querying (RAG) over past experiments.
> **Goal beyond the course grade: something the whole lab actually uses every day.**

This is the **hub note**. Start here each session.

## 📄 Project notes
- [[ChemMemo_Characterization]] — what the app *is*: vision, MVP, good-to-haves, future, UX.
- [[ChemMemo_Implementation_Plan]] — the detailed, phase-by-phase build plan + **progress log** (where we left off).
- [[ChemMemo_Audit_Roadmap]] — comprehensive audit of the built app (UI/UX, architecture, bugs) + prioritized roadmap (P0–P3) + sprint blueprint. **👉 See §0.1 "Sprint progress board" for what's done vs. what's left at a glance** (kept current after every finished item).

## 🧭 Current status
- **Phase:** Phases 0–9 ✅ + **Phase 10 AI ACTIVATED on dev via Gemini** 🟢 — full RAG/summaries/assisted-entry live. Pending: retrieval eval set + prod promotion.
- **Last session:** 2026-07-16 — **Audit Sprints S1–S5 all shipped to dev.** S1 mobile nav + global search (`d159b6c`); S2 embedding auto-sync on save + atomic EXP-ID DB sequence (migration on chememo-dev only, seeded EXP-013, `a65bcbb`); S3 dynamic sidebar project filters + URL parity; S4 toasts (`toast-provider.tsx`) + `error.tsx`/`loading.tsx`/`ask/loading.tsx` boundaries + `ActionResult` on file actions; S5 retrieval eval (`npm run eval:retrieval` — **100% recall on all 10 queries, mean precision 56% on dev**). S3–S5 commit `910b2e4`, deploy SUCCESS, routes 307. **The only remaining audit item is Sprint S6 (prod promotion) — deferred to the end by the user, needs explicit go-ahead.** Manual check still owed: create an experiment on dev and confirm a fresh `experiment_embeddings` row appears (S2 acceptance).
- **Prev:** 2026-07-15 — **Phase 10 AI activated via a free Gemini key.** Built a switchable provider layer (`AI_PROVIDER=gemini|openai|anthropic`, all backends kept); Gemini via native REST (`gemini-flash-latest` + `gemini-embedding-001` @1536). Backfilled 12 embeddings; verified semantic search + grounded cited answers on dev (no hallucination). Key in `.env.local`+Railway dev only. Commit `67ab912`. Switch providers anytime by changing `AI_PROVIDER` + key.
- **Prev:** 2026-07-14 — **Phase 8 complete (code only, inert).** Grounded single-experiment AI summaries: `summarizeExperiment` + `generateSummary` action caching to `ai_summaries` (service-role write), `SummaryCard` on detail (Generate button only with key, else Phase-10 note). Group summary deferred. Commit `da7b1e0`.
- **Prev:** 2026-07-14 — **Phase 7 complete (code only, inert).** Hybrid RAG scaffolding: guarded Claude router + grounded generator (`lib/anthropic.ts`), `askAI` orchestrator with keyless fallback + semantic path (`lib/rag.ts`), shared `executeFilters`. Ask screen renders grounded answers (linked `[EXP-###]`) when a key exists, else unchanged keyless view. All no-op without `ANTHROPIC_API_KEY`. Commit `4c899f2`. (Phase 6 before it: embeddings plumbing + `match_experiments`, inert. Phase 5: keyless MVP shipped.)
- **Next action:** either **promote `dev`→`master`/prod** (apply all migrations incl. storage to `chememo` prod, set prod Supabase Auth Site/Redirect URLs) to make production live, **or** start the inert AI code (Phases 6–9). **Do NOT get AI API keys yet — that is Phase 10 (the very last step).**
- 👉 Full progress table lives in [[ChemMemo_Implementation_Plan#Progress log]].

## 🔧 Locked decisions (2026-07-01)
| Decision | Choice | Why |
|---|---|---|
| Framework | **Next.js + React** (App Router, TypeScript) | Port the existing polished mockup; real deployable multi-user tool; strong AI-eng course demo. |
| Backend / DB / Auth | **Supabase** (Postgres + Auth + Storage + pgvector) | One platform for DB, auth, file storage, and vectors. |
| LLM (answers/summaries) | **Claude `claude-sonnet-5`** | Quality + already in this ecosystem. |
| Embeddings | **OpenAI `text-embedding-3-small`** → pgvector | Cheap, strong, easy to store in Supabase. |
| Retrieval | **Hybrid**: deterministic structured filters **+** semantic search | Reliable for `pH>8`/compound queries; semantic only for free-text. |
| File storage | **Upload small, link big** | Images/spectra → Supabase Storage; big LC-MS folders → OneDrive/Drive links. |
| Deploy | **Railway** (frontend) + Supabase (backend) | Simple Next.js deploys via CLI/Dockerfile, public demo URL. |
| Multi-user | **Lab-shared from day 1** (read-all, edit-own) via RLS | Avoid painful auth retrofit; matches "whole lab uses it". |
| **AI API keys** | **Added LAST (Phase 10)** | Can't buy a key now — build the whole keyless notebook first; activate AI at the very end. |

## 🔑 Secrets / accounts checklist (fill in as created — never commit real keys)
- [x] Supabase project created — `chememo` (ref `iazuubcyxneavrahjgww`, eu-central-1) — URL `https://iazuubcyxneavrahjgww.supabase.co`; anon + service-role keys stored in `C:\dev\chememo_webapp\.env.local` only (never in git or this vault)
- [x] Supabase **dev** project created — `chememo-dev` (ref `khkpqnpmhravdpbogqai`, eu-central-1); keys live only in the Railway dev env (re-fetch: `supabase projects api-keys --project-ref khkpqnpmhravdpbogqai`)
- [x] Railway project `chememo_webapp` created + deployed (Supabase env vars set) — https://chememowebapp-production.up.railway.app · dev: https://chememowebapp-dev.up.railway.app · GitHub auto-deploy: `master`→production, `dev`→dev ✅
- [x] GitHub repo created — private, https://github.com/yishiezerzer-dot/chememo_webapp
- [ ] ⏳ **Anthropic API key — Phase 10 only (do not obtain yet)**
- [ ] ⏳ **OpenAI API key (embeddings) — Phase 10 only (do not obtain yet)**

## ✅ Open tasks
Task tracking lives in the phase checklists in [[ChemMemo_Implementation_Plan]]. Current focus: **Phase 0**.

## Source material
- Original concept PDF: `AI course final project/ChemMemo_AI_Lab_Notebook_Project_Updated.pdf`
- Existing clickable mockup (vanilla HTML/CSS/JS, 6 screens): `AI course final project/chemmemo-design/`
