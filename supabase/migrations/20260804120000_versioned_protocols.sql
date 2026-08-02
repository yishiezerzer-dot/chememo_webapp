-- T1.5 — Versioned protocols & experiment steps.
-- See Spec: ChemMemo_Feature_VersionedProtocols_Spec.md (D1-D11).

-- 1. Protocol identity (D1) — human-readable PROT-### ids, same scheme as
--    experiments' EXP-### (20260716120000_experiment_id_sequence.sql).
create sequence if not exists protocol_id_seq start with 1;

create or replace function next_protocol_id()
returns text
language sql
as $$
  select 'PROT-' || lpad(nextval('protocol_id_seq')::text, 3, '0');
$$;

grant execute on function next_protocol_id() to authenticated;

create table protocols (
  id          text primary key default next_protocol_id(),
  name        text not null,
  archived    boolean not null default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- 2. Protocol versions (D2) — freeze-on-first-use, same shape as
--    experiment_template_versions (20260802120000_experiment_templates.sql).
create table protocol_versions (
  id                  uuid primary key default gen_random_uuid(),
  protocol_id         text not null references protocols(id) on delete cascade,
  version             int not null,
  purpose             text,
  scope               text,
  required_materials  text,
  equipment           text,
  critical_parameters jsonb not null default '[]',
  safety_notes        text,
  qc_checks           text,
  known_failure_modes jsonb not null default '[]',
  frozen_at           timestamptz,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  unique (protocol_id, version)
);

create index protocol_versions_protocol_idx on protocol_versions (protocol_id, version desc);

-- 3. Ordered steps belonging to a protocol version (D3 — target values reuse
--    T1.4's quantity_kinds/Quantity shape instead of bespoke numeric columns).
create table protocol_steps (
  id                  uuid primary key default gen_random_uuid(),
  protocol_version_id uuid not null references protocol_versions(id) on delete cascade,
  step_number         int not null,
  instruction         text not null,
  target_ph           numeric,
  target_quantities   jsonb not null default '{}',
  target_atmosphere   text,
  required_material   text,
  safety_note         text,
  unique (protocol_version_id, step_number)
);

-- 4. experiments links to the protocol version actually used (D4). The old
--    free-text experiments.protocol_version column (added by T1.2) is left
--    completely untouched — legacy/display only, never written to again.
alter table experiments
  add column protocol_version_id uuid references protocol_versions(id);

-- 5. Freeze trigger (D2) — fires whenever an experiment's protocol_version_id
--    is set, whether at insert or via a later edit (unlike templates, a
--    protocol is typically linked to an experiment that already exists).
create or replace function freeze_protocol_version()
returns trigger
language plpgsql
as $$
begin
  update protocol_versions
  set frozen_at = now()
  where id = new.protocol_version_id and frozen_at is null;
  return new;
end;
$$;

create trigger experiments_freeze_protocol_version
  after insert or update of protocol_version_id on experiments
  for each row
  when (new.protocol_version_id is not null)
  execute function freeze_protocol_version();

-- 6. Instantiated steps for a specific experiment run (D5 — references
--    protocol_steps directly; nothing to copy since the parent version is
--    frozen the moment any experiment uses it).
create table experiment_steps (
  id                uuid primary key default gen_random_uuid(),
  experiment_id     text not null references experiments(id) on delete cascade,
  protocol_step_id  uuid not null references protocol_steps(id),
  status            text not null default 'not_started',
  actual_ph         numeric,
  actual_quantities jsonb not null default '{}',
  actual_atmosphere text,
  started_at        timestamptz,
  completed_at      timestamptz,
  completed_by      uuid references auth.users(id),
  unique (experiment_id, protocol_step_id)
);

-- 7. Step observations / deviations (D6 — append-only, no update/delete
--    policy on either table; §10.2's "correct by adding a new entry" rule).
create table step_observations (
  id                 uuid primary key default gen_random_uuid(),
  experiment_step_id uuid not null references experiment_steps(id) on delete cascade,
  observed_by        uuid references auth.users(id),
  observed_at        timestamptz not null default now(),
  note               text not null
);

create table step_deviations (
  id                        uuid primary key default gen_random_uuid(),
  experiment_step_id        uuid not null references experiment_steps(id) on delete cascade,
  category                  text not null,
  reported_by               uuid references auth.users(id),
  reported_at               timestamptz not null default now(),
  what_happened             text not null,
  how_discovered            text,
  likely_impact             text,
  sample_still_usable       boolean,
  corrective_action         text,
  preventive_action         text,
  decision_owner            uuid references auth.users(id),
  affected_samples          text,
  linked_replacement_sample text
);

-- 8. Step attachments reuse experiment_files (D8) — one nullable FK, no new table.
alter table experiment_files
  add column experiment_step_id uuid references experiment_steps(id) on delete set null;

-- 9. Deviation categories: a 7th controlled_vocabularies vocabulary (D7,
--    G11's mechanism), not a new table or enum. Matches the real schema from
--    20260730120000_experiment_lifecycle.sql (vocabulary, value, sort_order,
--    standard_section, active).
insert into controlled_vocabularies (vocabulary, value, sort_order, standard_section) values
  ('deviation_category', 'calculation_error', 1, '11.1'),
  ('deviation_category', 'wrong_concentration', 2, '11.1'),
  ('deviation_category', 'wrong_solvent', 3, '11.1'),
  ('deviation_category', 'wrong_ratio', 4, '11.1'),
  ('deviation_category', 'missed_delayed_timepoint', 5, '11.1'),
  ('deviation_category', 'temperature_deviation', 6, '11.1'),
  ('deviation_category', 'sample_loss_transfer', 7, '11.1'),
  ('deviation_category', 'evaporation', 8, '11.1'),
  ('deviation_category', 'incomplete_dissolution', 9, '11.1'),
  ('deviation_category', 'unexpected_precipitation', 10, '11.1'),
  ('deviation_category', 'centrifugation_loss', 11, '11.1'),
  ('deviation_category', 'filter_retention', 12, '11.1'),
  ('deviation_category', 'instrument_failure', 13, '11.1'),
  ('deviation_category', 'low_signal', 14, '11.1'),
  ('deviation_category', 'contamination_risk', 15, '11.1'),
  ('deviation_category', 'label_ambiguity', 16, '11.1'),
  ('deviation_category', 'vessel_failure', 17, '11.1'),
  ('deviation_category', 'sample_dropped_spilled', 18, '11.1'),
  ('deviation_category', 'shipping_loss', 19, '11.1'),
  ('deviation_category', 'storage_excursion', 20, '11.1');

-- 10. RLS (D6, D9)
alter table protocols enable row level security;
alter table protocol_versions enable row level security;
alter table protocol_steps enable row level security;
alter table experiment_steps enable row level security;
alter table step_observations enable row level security;
alter table step_deviations enable row level security;

-- protocols/protocol_versions: lab-shared, like experiment_templates (D2).
create policy protocols_read on protocols for select to authenticated using (true);
create policy protocols_write on protocols for all to authenticated using (true) with check (true);

create policy protocol_versions_read on protocol_versions for select to authenticated using (true);
create policy protocol_versions_insert on protocol_versions for insert to authenticated with check (true);
-- WITH CHECK deliberately does not also require frozen_at is null on the
-- resulting row -- the freeze trigger's own UPDATE sets frozen_at to now()
-- on exactly such a row (same bug T1.2 hit and fixed; designed around here).
create policy protocol_versions_update on protocol_versions
  for update to authenticated using (frozen_at is null) with check (true);

-- protocol_steps: writable only while the parent version is still unfrozen.
create policy protocol_steps_read on protocol_steps for select to authenticated using (true);
create policy protocol_steps_write on protocol_steps
  for all to authenticated using (
    exists (select 1 from protocol_versions pv where pv.id = protocol_version_id and pv.frozen_at is null)
  ) with check (
    exists (select 1 from protocol_versions pv where pv.id = protocol_version_id and pv.frozen_at is null)
  );

-- experiment_steps/step_observations/step_deviations: mirror experiment_files
-- (D9) -- readable whenever the parent experiment is, writable only by its owner.
create policy experiment_steps_read on experiment_steps for select to authenticated using (
  exists (select 1 from experiments e where e.id = experiment_id and e.deleted_at is null)
);
create policy experiment_steps_write on experiment_steps for all to authenticated using (
  exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid())
) with check (
  exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid())
);

create policy step_observations_read on step_observations for select to authenticated using (
  exists (
    select 1 from experiment_steps es join experiments e on e.id = es.experiment_id
    where es.id = experiment_step_id and e.deleted_at is null
  )
);
create policy step_observations_insert on step_observations for insert to authenticated with check (
  exists (
    select 1 from experiment_steps es join experiments e on e.id = es.experiment_id
    where es.id = experiment_step_id and e.owner_id = auth.uid()
  )
);

create policy step_deviations_read on step_deviations for select to authenticated using (
  exists (
    select 1 from experiment_steps es join experiments e on e.id = es.experiment_id
    where es.id = experiment_step_id and e.deleted_at is null
  )
);
create policy step_deviations_insert on step_deviations for insert to authenticated with check (
  exists (
    select 1 from experiment_steps es join experiments e on e.id = es.experiment_id
    where es.id = experiment_step_id and e.owner_id = auth.uid()
  )
);
