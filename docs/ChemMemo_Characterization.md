---
type: vision
project: ChemMemo
title: ChemMemo — Characterization (Vision & MVP)
status: reference
aliases:
  - ChemMemo Characterization
  - ChemMemo Vision
tags:
  - chememo
  - chememo/vision
created: 2026-07-01
updated: 2026-07-21
---

# ChemMemo — Characterization

Back to hub: [[ChemMemo]] · Build plan: [[ChemMemo_Implementation_Plan]]

This note defines **what ChemMemo should be** — the vision, the MVP, the good-to-haves, and the design principles. It is the "north star". The [[ChemMemo_Implementation_Plan]] is *how* we get there.

---

## 1. One-sentence definition
ChemMemo is an authenticated web app where MFP-lab researchers record experiments in a **structured, searchable** form, attach/link their analytical files, and **ask natural-language questions** across all past experiments to get **grounded, cited** answers and summaries.

## 2. Who it's for
- MSc/PhD students & researchers in the MFP lab (prebiotic chemistry, wet–dry cycling, depsipeptides, LC-MS/MS, microscopy assembly).
- The person **entering** an experiment consistently, and later the person **retrieving** it in plain language.
- Someone assembling a report / SI / manuscript who needs related experiments fast.
- (Course) an evaluator who can see a full AI pipeline: auth → DB → retrieval → LLM → traceable output.

## 3. The core problem it kills
Information is scattered across paper notebooks, Excel, LC-MS folders, microscopy images, and memory. Questions like *"which Zn + histidine experiments did we already run?"*, *"which samples showed droplets?"*, *"which used pH > 8?"*, *"where did m/z 297 show up?"* are slow or impossible to answer. ChemMemo makes them one query.

## 4. Design principles (what makes it *actually used*, not just graded)
1. **Fast, forgiving entry.** Entering an experiment must be quicker than the old way, or nobody switches. → LLM-assisted "paste your messy notes, we pre-fill the form" (good-to-have that drives adoption).
2. **Never fabricate chemistry.** The AI retrieves and summarizes *only* what's stored; every answer cites `EXP-###` IDs; if nothing matches, it says so.
3. **Right tool per question.** Exact/parametric questions (pH, compound, method, m/z) → **deterministic DB filters** (always correct). Fuzzy/free-text questions ("looked cloudy", "droplets") → **semantic search**. A router decides.
4. **Trustworthy record.** Timestamps, owner, soft-delete, and (ideally) edit history — it's a lab notebook, not a scratchpad.
5. **Lab-shared by default.** Everyone can read the lab's experiments; you can only edit your own. Sharing is the point.
6. **Low friction to reach.** Browser URL + login. No install. Works from a lab bench laptop.

## 5. MVP — the course minimum (must-have to "ship")
This is the gradeable, demonstrable core. Maps to the concept PDF §10.

- [x] **Auth**: sign up / sign in; gated app; session persists on refresh.
- [x] **Supabase DB** connected with the core schema + row-level security.
- [x] **Add experiment** via the structured form → saved to Postgres (typed fields).
- [x] **Experiments table**: view / search / sort / filter all accessible experiments.
- [x] **Experiment detail** page: full record + linked files.
- [x] **Ask AI (NL query)**: at least the exact-match + semantic paths working on the 7 example questions.
- [x] **Grounded answer** with inline `[EXP-###]` citations + a Sources list.
- [x] **Single-experiment AI summary**, grounded in that record.
- [x] **Deployed** to a public URL (Railway) for the demo. → https://chememowebapp-production.up.railway.app

> MVP retrieval can start simple (structured filters + basic semantic search). Sophistication is layered on after.
>
> **✅ MVP fully shipped — checkboxes above were never updated during the build; verified against the live app and ticked 2026-07-21.**

## 6. Good-to-have (post-MVP, still within reach for a strong project)
- [x] **LLM-assisted entry** — paste raw notes → auto-fill structured fields (biggest adoption lever). *(Phase 9, `paste-notes.tsx`)*
- [x] **File uploads** to Supabase Storage (images, spectra screenshots) + external links for big folders. *(Phase 4)*
- [x] **Compound/metal autocomplete** from existing entries + light alias normalization. *(#20, commit `ac83f1e`)*
- [x] **Group summaries** — summarize a filtered set of experiments, not just one. *(#21, commit `ac83f1e`)*
- [x] **Projects / groups** UI with per-project views — now **user-managed**, not just the original 4 hardcoded categories. *(Sprint S3 + [[ChemMemo_Feature_ProjectManagement_Spec]], shipped 2026-07-21)*
- [x] **Retrieval eval set** — `npm run eval:retrieval`, 100% recall on dev. *(Sprint S5)*
- [ ] **CSV/Excel import & export** of experiments — **only export shipped** (#22, "Export CSV" button). **Import was never built.** This is the one real gap found in this pass — not blocking (lab members can still log experiments via the form or AI paste-notes), but worth knowing if bulk-importing existing lab records is ever wanted.
- [x] **Edit history / audit trail**. *(#24, `experiment_revisions` table + trigger)*
- [x] Dark/light theme + reduced-motion (already in the mockup — carry over). *(Phase 1)*

## 7. Future expansion (explicitly out of scope for the course)
- Wet–dry cycling **analyzer** module: read attached Excel/LC-MS files and auto-plot trends.
- **LC-MS/MS peak-assignment** assistance (formulas, adducts, charge states, isotopes, fragments).
- **Microscopy image classification** (droplets, crystals, aggregates, fibers, no-assembly).
- **Manuscript/SI** support: auto figure captions, report-ready tables.
- Full **admin/roles/permissions**, multiple labs, project-level access control.

## 8. UX / screens (already designed in the mockup — port these)
The `chemmemo-design/` prototype defines the whole flow. Reuse its look and interactions:
1. **Auth** — login/signup toggle.
2. **Dashboard** — stat counters, project chips, recent experiments, activity feed.
3. **Experiments table** — live search, sortable headers, filter chips (project / pH / method).
4. **New Experiment** — sectioned form, tag inputs (compounds & metals), method multi-select, file rows, live summary preview.
5. **Ask AI (RAG)** — NL box + example chips, grounded answer with `[EXP-###]` citations + Sources.
6. **Experiment detail** — full record, m/z chips, linked files with type icons, AI summary panel.

## 9. Definition of done (for the lab, not just the grade)
ChemMemo is "done enough to adopt" when a lab member can, unassisted: create an account, log an experiment in under ~2 minutes, find any past experiment by plain-language question with correct cited results, and open its files. Everything else is enhancement.

---
See the phased build (with verify steps and progress log) in [[ChemMemo_Implementation_Plan]].
