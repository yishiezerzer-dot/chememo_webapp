---
type: note
project: CM
title: ChemMemo — Characterization
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

- [ ] **Auth**: sign up / sign in; gated app; session persists on refresh.
- [ ] **Supabase DB** connected with the core schema + row-level security.
- [ ] **Add experiment** via the structured form → saved to Postgres (typed fields).
- [ ] **Experiments table**: view / search / sort / filter all accessible experiments.
- [ ] **Experiment detail** page: full record + linked files.
- [ ] **Ask AI (NL query)**: at least the exact-match + semantic paths working on the 7 example questions.
- [ ] **Grounded answer** with inline `[EXP-###]` citations + a Sources list.
- [ ] **Single-experiment AI summary**, grounded in that record.
- [ ] **Deployed** to a public URL (Railway) for the demo.

> MVP retrieval can start simple (structured filters + basic semantic search). Sophistication is layered on after.

## 6. Good-to-have (post-MVP, still within reach for a strong project)
- [ ] **LLM-assisted entry** — paste raw notes → auto-fill structured fields (biggest adoption lever).
- [ ] **File uploads** to Supabase Storage (images, spectra screenshots) + external links for big folders.
- [ ] **Compound/metal autocomplete** from existing entries + light alias normalization (ZnCl₂ ≈ zinc chloride ≈ Zn).
- [ ] **Group summaries** — summarize a filtered set of experiments, not just one.
- [ ] **Projects / groups** UI (wet–dry, depsipeptides, LC-MS/MS, microscopy) with per-project views.
- [ ] **Retrieval eval set** — a handful of Q→expected-records pairs to measure/score retrieval accuracy (great course story + guards against regressions).
- [ ] **CSV/Excel import & export** of experiments.
- [ ] **Edit history / audit trail**.
- [ ] Dark/light theme + reduced-motion (already in the mockup — carry over).

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
