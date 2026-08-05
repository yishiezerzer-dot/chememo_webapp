-- T2.4 — Reaction & stoichiometry.
-- See Spec: ChemMemo_Feature_Stoichiometry_Spec.md (D1-D6).
-- Purely additive: new nullable columns on the existing T2.2
-- experiment_inputs/experiment_outputs tables, no new tables, no backfill
-- (D1 — a second parallel table would just duplicate role/amount/source-lot,
-- which already live on experiment_inputs).

alter table experiment_inputs
  add column if not exists moles numeric,
  add column if not exists equivalents numeric,
  add column if not exists is_limiting_reagent boolean not null default false,
  -- {formula, inputs: {...}, notes} — same shape as T2.2's stock_solutions.calculation,
  -- so §19.3's "show formula, inputs, assumptions, result" is satisfiable per row.
  add column if not exists calculation jsonb not null default '{}';

alter table experiment_outputs
  add column if not exists theoretical_yield_mass numeric,
  add column if not exists percent_yield numeric,
  add column if not exists calculation jsonb not null default '{}';
