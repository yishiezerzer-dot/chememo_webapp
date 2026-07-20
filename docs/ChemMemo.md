---
type: project
project_id: CM
title: ChemMemo AI Lab Notebook
status: active
priority: high
next_action: ">>> NEXT SESSION = THE LAST PHASE: Sprint S6 (production promotion). The ENTIRE audit (P0–P3 + advanced) is shipped + verified on `dev` as of 2026-07-20 — S6 is the only thing left to fully ship ChemMemo. Follow the step-by-step runbook: [[ChemMemo_Audit_Roadmap]] → §5 'Sprint S6 — Production promotion runbook'. Critical facts: prod Supabase `chememo` (ref iazuubcyxneavrahjgww) is **INACTIVE — restore it first**; apply ALL 8 migrations incl. the two new dev-only ones (20260716120000_experiment_id_sequence, 20260720120000_experiment_revisions); decide with Yishi whether prod keeps the 12 demo experiments or starts clean (recommend keep projects, drop demo experiments); set prod Railway env (AI_PROVIDER=gemini + Gemini key + prod Supabase keys); set prod Auth Site/Redirect URLs; merge dev→master to deploy prod; backfill embeddings on prod for pre-existing rows. Each live-prod step trips the auto-mode approval gate (expected). Secrets only in .env.local + Railway, never committed. Also owed (quick dev checks): create an experiment on dev → confirm a fresh experiment_embeddings row (S2) and that the History panel populates (#24)."
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
- **Phase:** Phases 0–10 ✅ + **full audit backlog (P0–P3 + advanced) shipped & verified on `dev`** 🟢 — mobile nav, search, embedding sync, atomic IDs, sidebar filters, toasts/boundaries, retrieval eval, activity feed, CSV export, autocomplete, group summary, **streaming Ask**, **edit history**. **⏭️ Only Sprint S6 (production promotion) remains** — see the §5 runbook in [[ChemMemo_Audit_Roadmap]]. Prod `chememo` is currently INACTIVE (restore first).
- **Last session:** 2026-07-20 — **Features #23 + #24 shipped — audit backlog complete except S6.** #23 Ask POST/streaming (`POST /api/ask` streams the answer, query off the URL; `ask-client.tsx` shell, commit `836707d`); #24 edit history (`experiment_revisions` table + AFTER UPDATE trigger on chememo-dev, "History" panel on detail page, commit `99e1e2a`). **🎯 Only Sprint S6 (production promotion) remains before ChemMemo is fully shipped.**
- **Prev:** 2026-07-16 — **Features #20 + #21 shipped** (`ac83f1e`). #20 compound/metal autocomplete (native `<datalist>` from `listVocab()`, new+edit forms); #21 group summary ("Summarise these N" button on multi-result grounded asks, cited, on-demand). Remaining before S6: P3 #23 Ask streaming, #24 edit-history (needs migration).
- **Prev:** 2026-07-16 — **Features #11 + #22 shipped** (`0e44aff`). #11 dashboard "Recent activity" feed (last 8 by `updated_at`, relative time, linked); #22 "Export CSV" of the filtered experiments table (hand-rolled, no new dep). Remaining before S6: P3 #20 autocomplete, #21 group summary, #23 Ask streaming, #24 edit history.
- **Prev:** 2026-07-16 — **P2 cluster closed.** #16 README; #14 fonts→`next/font`; #13 rename `anthropic.ts`→`llm.ts`. **#15 (remove Tailwind) reverted** — it churned the lockfile and broke Railway `npm ci`; Tailwind kept as unused-but-harmless (revert `574525e`). P2 done (#13/14/16/17/18), #15 won't-do. Remaining before S6: P1 #11 activity feed; P3 #20–24.
- **Prev:** 2026-07-16 — **Pre-prod backlog batch #12/#17/#18 shipped** (`1ef18f3`, deploy SUCCESS). #17 free-text `.or()` escaping (`ilikeCond` in `lib/search.ts`); #18 invalidate cached AI summary on experiment edit; #12 real "Logged this month" dashboard stat (was fake "100% Cited"). Decision: finish ALL remaining audit items before production. Left before S6: P1 #11 activity feed; P2 #13–16 (rename anthropic→llm, next/font, Tailwind, README); P3 #20–24. See §0.1 board.
- **Prev:** 2026-07-16 — **Audit Sprints S1–S5 all shipped to dev.** S1 mobile nav + global search (`d159b6c`); S2 embedding auto-sync on save + atomic EXP-ID DB sequence (migration on chememo-dev only, seeded EXP-013, `a65bcbb`); S3 dynamic sidebar project filters + URL parity; S4 toasts (`toast-provider.tsx`) + `error.tsx`/`loading.tsx`/`ask/loading.tsx` boundaries + `ActionResult` on file actions; S5 retrieval eval (`npm run eval:retrieval` — **100% recall on all 10 queries, mean precision 56% on dev**). S3–S5 commit `910b2e4`, deploy SUCCESS, routes 307. **The only remaining audit item is Sprint S6 (prod promotion) — deferred to the end by the user, needs explicit go-ahead.** Manual check still owed: create an experiment on dev and confirm a fresh `experiment_embeddings` row appears (S2 acceptance).
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
