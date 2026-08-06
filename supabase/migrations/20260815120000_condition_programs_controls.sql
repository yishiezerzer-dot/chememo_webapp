-- T2.6 — Prebiotic condition programs & controls.
-- See Spec: ChemMemo_Feature_ConditionProgramsControls_Spec.md (D1-D6).
-- Idempotent throughout, matching T2.1-T2.5's convention.

-- ============================================================
-- 1. condition_program_templates (top-level, workspace-scoped) — D1: a
--    reusable, editable definition a researcher builds once and applies to
--    many batches. quantities holds wet_temperature/dry_temperature/
--    wet_duration/dry_duration/starting_volume/rehydration_volume as a
--    Quantity map (T1.4's one-extensible-map convention), not a column pair
--    per field, since a batch instance may re-key with the same shape.
-- ============================================================
create table if not exists condition_program_templates (
  id                        uuid primary key default gen_random_uuid(),
  workspace_id              uuid not null references workspaces(id),
  name                      text not null,
  cycle_count               int not null default 0,
  atmosphere                text,
  humidity_or_drying_method text,
  vessel                    text,
  agitation                 text,
  sampling_points           text,
  quantities                jsonb not null default '{}',
  notes                     text,
  created_by                uuid references auth.users(id),
  created_at                timestamptz not null default now()
);

-- ============================================================
-- 2. batch_condition_programs (child of batches, D1) — a frozen instance:
--    applying a template copies its values in; editing the template
--    afterward never retroactively changes an applied instance (mirrors
--    T1.5's protocol/protocol_version freeze-on-first-use rationale — same
--    risk, rewriting a historical record's stated conditions).
-- ============================================================
create table if not exists batch_condition_programs (
  id                        uuid primary key default gen_random_uuid(),
  batch_id                  uuid not null references batches(id) on delete cascade,
  workspace_id              uuid references workspaces(id),
  template_id               uuid references condition_program_templates(id),
  name                      text not null,
  cycle_count               int not null default 0,
  atmosphere                text,
  humidity_or_drying_method text,
  vessel                    text,
  agitation                 text,
  sampling_points           text,
  quantities                jsonb not null default '{}',
  notes                     text,
  created_by                uuid references auth.users(id),
  created_at                timestamptz not null default now(),
  unique (batch_id)
);

-- ============================================================
-- 3. condition_program_cycles (child of batch_condition_programs, D2) —
--    one row per actual cycle, modeling the Standard's §9.3 worked table
--    (Cycle | Dry start | Dry end | Wet volume | Wet duration | Aliquot
--    removed | Observation | Deviation). quantities holds cycle_wet_volume/
--    aliquot_volume. deviation is a documented-shape jsonb, not a new
--    deviation entity — matches sample_events.details/analysis_results.details
--    (gap G1 explicitly scopes "per-cycle deviations inside T2.6" this way).
-- ============================================================
create table if not exists condition_program_cycles (
  id                          uuid primary key default gen_random_uuid(),
  batch_condition_program_id uuid not null references batch_condition_programs(id) on delete cascade,
  workspace_id                uuid references workspaces(id),
  cycle_index                 int not null,
  wet_start_at                timestamptz,
  wet_end_at                  timestamptz,
  dry_start_at                timestamptz,
  dry_end_at                  timestamptz,
  quantities                  jsonb not null default '{}',
  observation                 text,
  deviation                   jsonb not null default '{}',
  created_by                  uuid references auth.users(id),
  created_at                  timestamptz not null default now(),
  unique (batch_condition_program_id, cycle_index)
);

-- ============================================================
-- 4. environmental_conditions (child of batches, D3) — one row per batch,
--    same grain as the cycle program (C3's binding "per-batch" scope).
--    Core §9.4/§9.5 fields as real columns; pressure/ionic_strength/
--    water_activity kept as plain text/numeric (no established unit-family
--    conversion exists for pressure in lib/quantities/convert.ts and the
--    audit doesn't ask for one — inventing one would be scope creep).
--    custom_fields implements the audit's explicit "keep custom fields
--    available because this research area evolves" instruction.
-- ============================================================
create table if not exists environmental_conditions (
  id                   uuid primary key default gen_random_uuid(),
  batch_id             uuid not null references batches(id) on delete cascade,
  workspace_id         uuid references workspaces(id),
  atmosphere_gas       text,
  pressure             text,
  light_uv_exposure    text,
  light_uv_wavelength  numeric,
  mineral_surface_type text,
  ionic_strength       text,
  buffer_identity      text,
  water_activity       numeric,
  heating_method       text,
  freeze_thaw_cycles   int,
  vessel_material      text,
  initial_ph           numeric,
  final_ph             numeric,
  anaerobic            boolean,
  quantities           jsonb not null default '{}',
  custom_fields        jsonb not null default '{}',
  notes                text,
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  unique (batch_id)
);

-- ============================================================
-- 5. controls (child of experiments, D4) — an explicit entity, not a naming
--    convention. Linking a control experiment to the experiment(s) it
--    validates reuses T1.7's existing experiment_relationships 'control_for'
--    type directly; no new relationship table is added here.
-- ============================================================
create table if not exists controls (
  id            uuid primary key default gen_random_uuid(),
  experiment_id text not null references experiments(id) on delete cascade,
  workspace_id  uuid references workspaces(id),
  -- App-validated against controlled_vocabularies('control_type'), matching
  -- T2.2's material_role precedent, not a DB check constraint.
  control_type  text not null,
  description   text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

-- ============================================================
-- 6. controlled_vocabularies — control_type (11th vocabulary), audit §8.5's
--    7 values verbatim.
-- ============================================================
insert into controlled_vocabularies (vocabulary, value, sort_order, standard_section) values
  ('control_type', 'blank', 1, '8.5'),
  ('control_type', 'no_catalyst', 2, '8.5'),
  ('control_type', 'no_heat', 3, '8.5'),
  ('control_type', 'single_component', 4, '8.5'),
  ('control_type', 'positive', 5, '8.5'),
  ('control_type', 'technical_replicate', 6, '8.5'),
  ('control_type', 'independent_replicate', 7, '8.5')
on conflict (vocabulary, value) do nothing;

-- ============================================================
-- 7. quantity_kinds — 9 new kinds (sort_order 17-25). Each semantically
--    distinct field gets its own kind row even where the unit family is
--    shared (temperature/duration/volume/molar_concentration already exist),
--    because validateQuantityUnits keys strictly by kind.key (lib/schemas.ts)
--    and a single row needs both a wet_* and dry_* value simultaneously.
-- ============================================================
insert into quantity_kinds (key, label, category, canonical_unit_code, compatible_units, standard_field_name, sort_order) values
  ('wet_temperature', 'Wet-phase temperature', 'physical', 'Cel', array['Cel','degF','K'], 'wet_temperature_C', 17),
  ('dry_temperature', 'Dry-phase temperature', 'physical', 'Cel', array['Cel','degF','K'], 'dry_temperature_C', 18),
  ('wet_duration', 'Wet-phase duration', 'physical', 'h', array['h','min','d'], 'wet_duration_h', 19),
  ('dry_duration', 'Dry-phase duration', 'physical', 'h', array['h','min','d'], 'dry_duration_h', 20),
  ('starting_volume', 'Starting volume', 'physical', 'mL', array['mL','uL','L'], 'starting_volume_mL', 21),
  ('rehydration_volume', 'Rehydration volume', 'physical', 'mL', array['mL','uL','L'], 'rehydration_volume_mL', 22),
  ('cycle_wet_volume', 'Cycle wet volume', 'physical', 'mL', array['mL','uL','L'], 'cycle_wet_volume_mL', 23),
  ('aliquot_volume', 'Aliquot volume removed', 'physical', 'mL', array['mL','uL','L'], 'aliquot_volume_mL', 24),
  ('buffer_concentration', 'Buffer concentration', 'concentration', 'mM', array['mM','uM','M'], 'buffer_concentration_mM', 25)
on conflict (key) do nothing;

-- ============================================================
-- 8. Triggers — workspace inheritance. set_workspace_from_batch_id() and
--    set_workspace_from_experiment_id() already exist (T2.3/T2.1), reused
--    directly. Only condition_program_cycles needs a new function.
-- ============================================================
create or replace function set_workspace_from_batch_condition_program_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from batch_condition_programs where id = new.batch_condition_program_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspace_batch_condition_programs on batch_condition_programs;
create trigger trg_workspace_batch_condition_programs before insert on batch_condition_programs
  for each row execute function set_workspace_from_batch_id();

drop trigger if exists trg_workspace_condition_program_cycles on condition_program_cycles;
create trigger trg_workspace_condition_program_cycles before insert on condition_program_cycles
  for each row execute function set_workspace_from_batch_condition_program_id();

drop trigger if exists trg_workspace_environmental_conditions on environmental_conditions;
create trigger trg_workspace_environmental_conditions before insert on environmental_conditions
  for each row execute function set_workspace_from_batch_id();

drop trigger if exists trg_workspace_controls on controls;
create trigger trg_workspace_controls before insert on controls
  for each row execute function set_workspace_from_experiment_id();

-- ============================================================
-- 9. RLS — read via is_workspace_member, write via is_workspace_writer.
--    No backfill: every T2.6 table is genuinely new.
-- ============================================================
alter table condition_program_templates enable row level security;
drop policy if exists condition_program_templates_read on condition_program_templates;
create policy condition_program_templates_read on condition_program_templates for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists condition_program_templates_write on condition_program_templates;
create policy condition_program_templates_write on condition_program_templates for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table batch_condition_programs enable row level security;
drop policy if exists batch_condition_programs_read on batch_condition_programs;
create policy batch_condition_programs_read on batch_condition_programs for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists batch_condition_programs_write on batch_condition_programs;
create policy batch_condition_programs_write on batch_condition_programs for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table condition_program_cycles enable row level security;
drop policy if exists condition_program_cycles_read on condition_program_cycles;
create policy condition_program_cycles_read on condition_program_cycles for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists condition_program_cycles_write on condition_program_cycles;
create policy condition_program_cycles_write on condition_program_cycles for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table environmental_conditions enable row level security;
drop policy if exists environmental_conditions_read on environmental_conditions;
create policy environmental_conditions_read on environmental_conditions for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists environmental_conditions_write on environmental_conditions;
create policy environmental_conditions_write on environmental_conditions for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table controls enable row level security;
drop policy if exists controls_read on controls;
create policy controls_read on controls for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists controls_write on controls;
create policy controls_write on controls for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));
