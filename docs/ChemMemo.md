---
type: hub
project: ChemMemo
title: ChemMemo — Project Hub
status: shipped — live in production
priority: low
aliases:
  - ChemMemo
  - ChemMemo Hub
  - ChemMemo AI Lab Notebook
tags:
  - chememo
  - chememo/hub
  - moc
next_action: "T0.1–T0.4 shipped on dev 2026-07-23 — see [[ChemMemo_Product_Evolution_Plan]] Tier 0 (incl. a tunables callout for T0.3's rate/concurrency numbers) and [[ChemMemo_Implementation_Plan]] session history. T0.2 closed a real stored-XSS hole in file links; T0.4 closed a provenance risk (general-knowledge answers could look like lab conclusions). NOT yet promoted to master/prod. Next: T0.5 (durable indexing job queue) — this one is ⚠ spec-first (small), needs a short brainstorm on the worker mechanism given Railway's single-service model, per the plan's guardrail #2. One Tier 0 item at a time; do not batch. Do NOT start Tiers 1–4 without explicit direction."
updated: 2026-07-23
---

# 🧪 ChemMemo — Project Hub

> [!success] Status: LIVE IN PRODUCTION
> **[chememowebapp-production.up.railway.app](https://chememowebapp-production.up.railway.app)** · Phases 0–10 ✅ · full internal audit backlog ✅ · Sprint S6 (prod promotion) ✅ · user-managed projects ✅
> An AI-assisted lab notebook for prebiotic chemistry in the **MFP (Frenkel-Pinter) lab** — structured experiment records + linked analytical files + natural-language RAG over past experiments. *Goal: a tool the whole lab actually uses every day.*

This is the **hub note (Map of Content)**. Start here each session.

---

## 🗺️ Map of content

### Vision & requirements
- [[ChemMemo_Characterization]] — what the app *is*: vision, MVP definition, good-to-haves, UX principles. The north star. *(reference)*

### Plans & progress
- [[ChemMemo_Implementation_Plan]] — the phase-by-phase build plan (Phases 0–10) **and the full dated progress log**. This is the source of record for "what happened when." *(shipped)*
- [[ChemMemo_Product_Evolution_Plan]] — **priority-ordered, agent-executable roadmap** derived from the external comprehensive audit. Tiers the audit into Tier 0 (hardening) → Tier 4 (institutional). *(not started — read its scope callout before beginning)*

### Audits
- [[ChemMemo_Audit_Roadmap]] — the **internal** audit + P0–P3 sprint roadmap of the built app. Every item is shipped; §0.1 is the at-a-glance board, §3 holds the small residual backlog. *(closed)*
- [[ChemMemo_Comprehensive_Product_Audit_2026-07-21]] — the **external** deep audit (product, UX, AI, security, data model, ELN benchmarking). The rationale behind the evolution plan. *(reference)*

### Specs (per-feature designs)
- [[ChemMemo_Feature_ProjectManagement_Spec]] — user-created/deletable projects (replaced the 4 hardcoded seed projects). *(shipped)*

> [!tip] Where to look
> - "What's the state of the app / what's left?" → **this hub** + [[ChemMemo_Audit_Roadmap]] §0.1 & §3
> - "What happened in a past session?" → [[ChemMemo_Implementation_Plan]] progress log
> - "What should we build next and how?" → [[ChemMemo_Product_Evolution_Plan]]
> - "Why build it that way?" → [[ChemMemo_Comprehensive_Product_Audit_2026-07-21]]

---

## 🧭 Current state (2026-07-22)

- ✅ **Live in production**, feature-complete for daily lab use: auth, structured experiment CRUD, file upload/link + signed URLs, hybrid keyless + AI search, grounded cited Ask (streaming), AI summaries, paste-notes extraction, edit history, CSV export, mobile nav, user-managed projects.
- ✅ **Last shipped (2026-07-21):** user-managed projects on dev + prod (`c47384d`); 4 seed projects removed from prod.
- 🟡 **Known, non-blocking residuals** (see [[ChemMemo_Audit_Roadmap]] §3): CSV *import* never built (export only); "soft-delete orphans" (storage/`experiment_files` not cleaned on experiment delete); two a11y gaps (table sort headers, auth-toggle keyboard); a couple security-hardening items (validate `addFileLink` URL schemes, rate-limit AI actions). Re-verify Ask AI/summary once Gemini `gemini-flash-latest` 503s subside (external/transient).
- 🟡 **In progress:** [[ChemMemo_Product_Evolution_Plan]] Tier 0 — T0.1 (shared Zod validation) + T0.2 (file/URL hardening, closed a real stored-XSS hole) + T0.3 (AI rate limits & telemetry, tunable numbers documented in the plan) + T0.4 (strict lab-only Ask mode, closed a provenance risk) shipped on **dev** 2026-07-23, not yet promoted to master/prod. Next: T0.5 (⚠ spec-first).

> Full dated history lives in [[ChemMemo_Implementation_Plan#Session history]] — not duplicated here.

---

## 🔧 Locked decisions (2026-07-01)

| Decision | Choice | Why |
|---|---|---|
| Framework | **Next.js + React** (App Router, TypeScript) | Port the polished mockup; real deployable multi-user tool. |
| Backend / DB / Auth | **Supabase** (Postgres + Auth + Storage + pgvector) | One platform for DB, auth, files, and vectors. |
| LLM (answers/summaries) | **Switchable** via `AI_PROVIDER` — currently **Gemini** (`gemini-flash-latest`) | Free key available; OpenAI/Anthropic paths kept. |
| Embeddings | **Gemini `gemini-embedding-001` @ 1536 dims** → pgvector | Matches `vector(1536)`; OpenAI `text-embedding-3-small` also wired. |
| Retrieval | **Hybrid**: deterministic structured filters **+** semantic search | Reliable for `pH>8`/compound queries; semantic for free-text. |
| File storage | **Upload small, link big** | Images/spectra → Supabase Storage; big LC-MS folders → OneDrive/Drive links. |
| Deploy | **Railway** (app) + Supabase (backend); `master`→prod, `dev`→dev | Simple Next.js deploys, public demo URLs. |
| Multi-user | **Lab-shared** (read-all, edit-own) via RLS | Matches "the whole lab uses it." *(The evolution plan revisits this with workspaces.)* |

---

## 🔑 Environments & secrets checklist

> [!danger] Never commit real keys to git or this vault. Secrets live only in `.env.local` (gitignored) and Railway env.

- [x] **Prod** Supabase `chememo` (ref `iazuubcyxneavrahjgww`, eu-central-1) — live DB, all migrations applied, `projects` seed kept, demo experiments dropped. Keys in Railway prod env only.
- [x] **Dev** Supabase `chememo-dev` (ref `khkpqnpmhravdpbogqai`, eu-central-1). Keys in Railway dev env. *(Re-fetch: `supabase projects api-keys --project-ref khkpqnpmhravdpbogqai`.)*
- [x] **Railway** project `chememo_webapp` — prod: https://chememowebapp-production.up.railway.app · dev: https://chememowebapp-dev.up.railway.app · GitHub auto-deploy `master`→prod, `dev`→dev.
- [x] **GitHub** private repo — https://github.com/yishiezerzer-dot/chememo_webapp
- [x] **AI provider** — Gemini key in Railway prod + dev env (activated Phase 10). Switch providers via `AI_PROVIDER` + matching key.

> [!warning] Railway deploy gotcha (learned 2026-07-21)
> `railway service source connect` is **not** reliably environment-scoped despite `--environment`; it can reset the branch mapping for *both* environments at once. Verify dev↔`dev` and prod↔`master` mappings in the Railway **dashboard**, not via that CLI command. To deploy a branch to one environment without touching the other, use `railway up`.

---

## 🗂️ Vault structure

This project folder (`ChemMemo/`) inside the `Claude_code_projects` Obsidian vault is organized as:

```
ChemMemo/
├── ChemMemo.md                      ← this hub (entry point / MOC)
├── Vision/                          ← what the app should be
│   └── ChemMemo_Characterization.md
├── Plans/                           ← build plans + progress
│   ├── ChemMemo_Implementation_Plan.md
│   └── ChemMemo_Product_Evolution_Plan.md
├── Audits/                          ← reviews & roadmaps
│   ├── ChemMemo_Audit_Roadmap.md
│   └── ChemMemo_Comprehensive_Product_Audit_2026-07-21.md
└── Specs/                           ← per-feature design specs
    └── ChemMemo_Feature_ProjectManagement_Spec.md
```

> [!note] Conventions for new notes
> - **Filenames keep the `ChemMemo_` prefix** — wikilinks resolve by filename vault-wide, so files can move between folders without breaking links, and the prefix disambiguates in global search / graph view.
> - **Frontmatter** every note with: `type` (`hub`/`vision`/`plan`/`audit`/`spec`), `project: ChemMemo`, `title`, `status`, `tags` (`chememo` + `chememo/<type>`), and `created`/`updated` dates.
> - **New per-feature designs** → `Specs/` as `ChemMemo_Feature_<Name>_Spec.md`, linked from the Map of Content above.
> - After finishing a work item, tick it in the relevant plan/audit **and** append a dated line to [[ChemMemo_Implementation_Plan#Session history]].

---

## 📎 Source material
- Original concept PDF: `AI course final project/ChemMemo_AI_Lab_Notebook_Project_Updated.pdf`
- Original clickable mockup (vanilla HTML/CSS/JS, 6 screens): `AI course final project/chemmemo-design/`
- Repo docs mirror: `chememo_webapp/docs/` (point-in-time snapshots of some of these notes)
