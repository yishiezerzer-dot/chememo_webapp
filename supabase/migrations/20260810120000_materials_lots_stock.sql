-- T2.2 — Materials, lots & stock solutions.
-- See Spec: ChemMemo_Feature_MaterialsLotsStock_Spec.md (D1-D7).
-- Idempotent throughout (create table if not exists / add column if not
-- exists / drop policy if exists), matching the T2.1 migration's own
-- convention for anything that could run against already-migrated data.

-- ============================================================
-- 1. materials (top-level, workspace-scoped) — D1: canonical chemical
--    identity, true regardless of which lot you're holding.
-- ============================================================
create table if not exists materials (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references workspaces(id),
  preferred_name    text not null,
  short_code        text,
  stereochemistry   text,
  formula           text,
  molecular_weight  numeric,
  exact_mass        numeric,
  safety_notes      text,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- 2. material_identifiers (child of materials) — D2: kind/value table so
--    an arbitrary number of aliases (§6.4) can sit alongside the
--    structural identifiers, not just one column each.
-- ============================================================
create table if not exists material_identifiers (
  id              uuid primary key default gen_random_uuid(),
  material_id     uuid not null references materials(id) on delete cascade,
  workspace_id    uuid references workspaces(id),
  identifier_type text not null check (identifier_type in ('cas','pubchem_cid','inchikey','smiles','internal_code','alias')),
  value           text not null,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now()
);

-- At most one structural identifier of each kind per material; aliases stay
-- unbounded (a material can have many historical names).
create unique index if not exists material_identifiers_structural_uidx
  on material_identifiers (material_id, identifier_type)
  where identifier_type <> 'alias';

-- ============================================================
-- 3. storage_locations (top-level, workspace-scoped) — D6: self-serve,
--    lab-specific, no seed data makes sense.
-- ============================================================
create table if not exists storage_locations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id),
  name         text not null,
  conditions   text,
  notes        text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 4. material_lots (child of materials) — D1: everything that varies per
--    physical container (§7.1's supplier/catalog/lot-number/purity/etc).
-- ============================================================
create table if not exists material_lots (
  id                              uuid primary key default gen_random_uuid(),
  material_id                     uuid not null references materials(id) on delete cascade,
  workspace_id                    uuid references workspaces(id),
  supplier                        text,
  catalog_number                  text,
  lot_number                      text,
  purity                          numeric check (purity is null or (purity >= 0 and purity <= 100)),
  physical_form                   text,
  -- D5: only populated when purchased pre-dissolved (a commercial solution),
  -- keyed by the 'stock_concentration' quantity_kind (section 8).
  commercial_solution_quantities  jsonb not null default '{}',
  concentration_basis             text check (concentration_basis is null or concentration_basis in ('w/w','w/v','v/v','molarity')),
  density                         numeric,
  density_temperature             numeric,
  water_content_or_hydrate_form   text,
  storage_location_id             uuid references storage_locations(id),
  date_opened                     date,
  expiration_or_retest_date       date,
  created_by                      uuid references auth.users(id),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

-- ============================================================
-- 5. stock_solutions (child of material_lots) — D3: the outcome of a
--    preparation. §7.2's 24 fields, minus the multi-attempt solubility log
--    (section 6) and minus the verification checklist (kept as two
--    columns here rather than its own table, same shape as T1.1's
--    acceptance_criteria_locked_at).
-- ============================================================
create table if not exists stock_solutions (
  id                          uuid primary key default gen_random_uuid(),
  material_lot_id             uuid not null references material_lots(id) on delete cascade,
  workspace_id                uuid references workspaces(id),
  -- D5: keyed by 'stock_concentration'/'stock_volume' (section 8).
  target_quantities           jsonb not null default '{}',
  actual_quantities           jsonb not null default '{}',
  solvent                     text,
  solvent_grade               text,
  ph_target                   numeric,
  ph_measured                 numeric,
  acid_or_base_added          text,
  acid_or_base_quantities     jsonb not null default '{}',
  filtration_or_centrifugation text,
  color_and_appearance        text,
  -- D3a: {formula, inputs: {...}, calculated_mass_g, notes} — reproducible,
  -- not just a stored result.
  calculation                 jsonb not null default '{}',
  -- App-validated against controlled_vocabularies('solubility_status'),
  -- matching T1.5's deviation_category precedent (text column, not a DB
  -- FK/check — a check constraint can't reference a mutable seed table's
  -- live rows without a trigger, so validation happens at the app layer
  -- against the same rows step_deviations.category already reads).
  solubility_status           text,
  verified_at                 timestamptz,
  verified_by                 uuid references auth.users(id),
  prepared_at                 timestamptz,
  prepared_by                 uuid references auth.users(id),
  storage_location_id         uuid references storage_locations(id),
  storage_temperature         numeric,
  freeze_thaw_count           int not null default 0,
  expiration_or_review_date   date,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- ============================================================
-- 6. stock_solubility_attempts (child of stock_solutions) — D3: the
--    append-only log §7.4 actually describes (multiple attempts before a
--    stock is called e.g. "0.1 M"). No update/delete policy, same
--    append-only shape as T1.5's step_observations/step_deviations.
-- ============================================================
create table if not exists stock_solubility_attempts (
  id                 uuid primary key default gen_random_uuid(),
  stock_solution_id  uuid not null references stock_solutions(id) on delete cascade,
  workspace_id       uuid references workspaces(id),
  attempt_number     int not null,
  target_quantities  jsonb not null default '{}',
  solvent            text,
  -- App-validated against controlled_vocabularies('solubility_status') —
  -- an attempt's own outcome, distinct from the stock's final status.
  outcome            text not null,
  notes              text,
  attempted_at       timestamptz not null default now(),
  attempted_by       uuid references auth.users(id),
  unique (stock_solution_id, attempt_number)
);

-- ============================================================
-- 7. experiment_inputs (child of experiments) — D4: polymorphic reference
--    to an exact lot or stock, reusing T1.9's target_type/target_id
--    pattern exactly.
-- ============================================================
create table if not exists experiment_inputs (
  id             uuid primary key default gen_random_uuid(),
  experiment_id  text not null references experiments(id) on delete cascade,
  workspace_id   uuid references workspaces(id),
  source_type    text not null check (source_type in ('lot','stock')),
  source_id      uuid not null,
  -- App-validated against controlled_vocabularies('material_role').
  role           text not null,
  -- D5: keyed by 'input_amount_mass' or 'input_amount_volume', plus 'purity'.
  quantities     jsonb not null default '{}',
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 8. experiment_outputs (child of experiments) — D4: what the experiment
--    produced. Unlike inputs, an output need not already be a registered
--    material (it may be new), so the reference is optional with a
--    free-text fallback rather than a required lot/stock FK.
-- ============================================================
create table if not exists experiment_outputs (
  id             uuid primary key default gen_random_uuid(),
  experiment_id  text not null references experiments(id) on delete cascade,
  workspace_id   uuid references workspaces(id),
  material_id    uuid references materials(id),
  material_name  text,
  -- App-validated against controlled_vocabularies('output_role').
  role           text not null default 'product',
  quantities     jsonb not null default '{}',
  notes          text,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  constraint experiment_outputs_has_identity check (material_id is not null or material_name is not null)
);

-- ============================================================
-- 9. quantity_kinds — new rows for T2.2's structured values (D5).
-- ============================================================
insert into quantity_kinds (key, label, category, canonical_unit_code, compatible_units, standard_field_name, sort_order) values
  ('stock_concentration', 'Stock concentration', 'concentration', 'mM', array['mM','uM','M'], 'stock_concentration_mM', 10),
  ('stock_volume', 'Stock volume', 'physical', 'mL', array['mL','uL','L'], 'stock_volume_mL', 11),
  ('input_amount_mass', 'Input amount (mass)', 'physical', 'g', array['g','mg','kg','ug'], 'input_amount_g', 12),
  ('input_amount_volume', 'Input amount (volume)', 'physical', 'mL', array['mL','uL','L'], 'input_amount_mL', 13),
  ('purity', 'Purity', 'physical', '%', array['%'], 'purity_percent', 14)
on conflict (key) do nothing;

-- ============================================================
-- 10. controlled_vocabularies — material_role (8th) and output_role (9th)
--     vocabularies (D4), per audit §7.6's role lists.
-- ============================================================
insert into controlled_vocabularies (vocabulary, value, sort_order, standard_section) values
  ('material_role', 'reactant', 1, '7.6'),
  ('material_role', 'catalyst', 2, '7.6'),
  ('material_role', 'solvent', 3, '7.6'),
  ('material_role', 'buffer', 4, '7.6'),
  ('material_role', 'quench', 5, '7.6'),
  ('material_role', 'standard', 6, '7.6'),
  ('material_role', 'control', 7, '7.6'),
  ('material_role', 'substrate', 8, '7.6'),
  ('material_role', 'product', 9, '7.6'),
  ('output_role', 'product', 1, '7.6'),
  ('output_role', 'byproduct', 2, '7.6'),
  ('output_role', 'waste', 3, '7.6'),
  ('output_role', 'unreacted_material', 4, '7.6')
on conflict (vocabulary, value) do nothing;

-- ============================================================
-- 11. Triggers (T2.1's D6 convention) — auto-populate workspace_id on
--     insert from the immediate parent.
-- ============================================================
create or replace function set_workspace_from_material_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from materials where id = new.material_id;
  end if;
  return new;
end;
$$;

create or replace function set_workspace_from_material_lot_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from material_lots where id = new.material_lot_id;
  end if;
  return new;
end;
$$;

create or replace function set_workspace_from_stock_solution_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from stock_solutions where id = new.stock_solution_id;
  end if;
  return new;
end;
$$;

-- experiment_inputs: also reject a lot/stock from a different workspace
-- than the experiment consuming it (same guard as T2.1's
-- set_workspace_from_relationship()/set_workspace_from_series_member()).
create or replace function set_workspace_from_experiment_input() returns trigger language plpgsql as $$
declare
  exp_ws uuid;
  source_ws uuid;
begin
  select workspace_id into exp_ws from experiments where id = new.experiment_id;
  if new.source_type = 'lot' then
    select workspace_id into source_ws from material_lots where id = new.source_id;
  else
    select workspace_id into source_ws from stock_solutions where id = new.source_id;
  end if;
  if source_ws is distinct from exp_ws then
    raise exception 'Cannot use a lot/stock from a different workspace as an experiment input.';
  end if;
  new.workspace_id := exp_ws;
  return new;
end;
$$;

-- experiment_outputs: only needs the experiment's own workspace — an
-- output's optional material_id, if set, is a registry reference (not a
-- consumed lot/stock), so there's no cross-workspace consumption to guard.
create or replace function set_workspace_from_experiment_output() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from experiments where id = new.experiment_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspace_material_identifiers on material_identifiers;
create trigger trg_workspace_material_identifiers before insert on material_identifiers
  for each row execute function set_workspace_from_material_id();

drop trigger if exists trg_workspace_material_lots on material_lots;
create trigger trg_workspace_material_lots before insert on material_lots
  for each row execute function set_workspace_from_material_id();

drop trigger if exists trg_workspace_stock_solutions on stock_solutions;
create trigger trg_workspace_stock_solutions before insert on stock_solutions
  for each row execute function set_workspace_from_material_lot_id();

drop trigger if exists trg_workspace_stock_solubility_attempts on stock_solubility_attempts;
create trigger trg_workspace_stock_solubility_attempts before insert on stock_solubility_attempts
  for each row execute function set_workspace_from_stock_solution_id();

drop trigger if exists trg_workspace_experiment_inputs on experiment_inputs;
create trigger trg_workspace_experiment_inputs before insert on experiment_inputs
  for each row execute function set_workspace_from_experiment_input();

drop trigger if exists trg_workspace_experiment_outputs on experiment_outputs;
create trigger trg_workspace_experiment_outputs before insert on experiment_outputs
  for each row execute function set_workspace_from_experiment_output();

-- ============================================================
-- 12. RLS — read via is_workspace_member, write via is_workspace_writer
--     (both security-definer functions already defined in T2.1's
--     migration). No backfill needed: every T2.2 table is genuinely new,
--     with zero pre-existing rows.
-- ============================================================
alter table materials enable row level security;
drop policy if exists materials_read on materials;
create policy materials_read on materials for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists materials_write on materials;
create policy materials_write on materials for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table material_identifiers enable row level security;
drop policy if exists material_identifiers_read on material_identifiers;
create policy material_identifiers_read on material_identifiers for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists material_identifiers_write on material_identifiers;
create policy material_identifiers_write on material_identifiers for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table storage_locations enable row level security;
drop policy if exists storage_locations_read on storage_locations;
create policy storage_locations_read on storage_locations for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists storage_locations_write on storage_locations;
create policy storage_locations_write on storage_locations for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table material_lots enable row level security;
drop policy if exists material_lots_read on material_lots;
create policy material_lots_read on material_lots for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists material_lots_write on material_lots;
create policy material_lots_write on material_lots for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table stock_solutions enable row level security;
drop policy if exists stock_solutions_read on stock_solutions;
create policy stock_solutions_read on stock_solutions for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists stock_solutions_write on stock_solutions;
create policy stock_solutions_write on stock_solutions for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table stock_solubility_attempts enable row level security;
drop policy if exists stock_solubility_attempts_read on stock_solubility_attempts;
create policy stock_solubility_attempts_read on stock_solubility_attempts for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
-- Append-only (D3): insert only, no update/delete policy at all — same
-- shape as T1.5's step_observations/step_deviations.
drop policy if exists stock_solubility_attempts_insert on stock_solubility_attempts;
create policy stock_solubility_attempts_insert on stock_solubility_attempts for insert to authenticated
  with check (is_workspace_writer(workspace_id, auth.uid()));

alter table experiment_inputs enable row level security;
drop policy if exists experiment_inputs_read on experiment_inputs;
create policy experiment_inputs_read on experiment_inputs for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists experiment_inputs_write on experiment_inputs;
create policy experiment_inputs_write on experiment_inputs for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table experiment_outputs enable row level security;
drop policy if exists experiment_outputs_read on experiment_outputs;
create policy experiment_outputs_read on experiment_outputs for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists experiment_outputs_write on experiment_outputs;
create policy experiment_outputs_write on experiment_outputs for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));
