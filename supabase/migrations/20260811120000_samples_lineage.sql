-- T2.3 — Samples & lineage.
-- See Spec: ChemMemo_Feature_SamplesLineage_Spec.md (D1-D8).
-- Idempotent throughout, matching T2.1/T2.2's convention.

-- ============================================================
-- 1. batches (child of experiments) — D1: every experiment auto-creates an
--    implicit B1 batch (decision C3); a second/third batch is a genuine
--    repeat preparation, never a new experiment.
-- ============================================================
create table if not exists batches (
  id            uuid primary key default gen_random_uuid(),
  experiment_id text not null references experiments(id) on delete cascade,
  workspace_id  uuid references workspaces(id),
  label         text not null,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (experiment_id, label)
);

-- ============================================================
-- 2. samples (child of batches) — D2: FK to a batch, never an experiment
--    directly. origin_type/origin_id mirrors experiment_inputs'
--    source_type/source_id polymorphic pattern (T2.2).
-- ============================================================
create table if not exists samples (
  id            uuid primary key default gen_random_uuid(),
  batch_id      uuid not null references batches(id) on delete cascade,
  workspace_id  uuid references workspaces(id),
  vial_label    text not null,
  legacy_code   text,
  -- App-validated against controlled_vocabularies('sample_type'/'reaction_mode'/
  -- 'sample_status') — matching T2.2's material_role precedent, not a DB
  -- check constraint (can't reference a mutable seed table without a trigger).
  sample_type   text,
  reaction_mode text,
  status        text not null default 'planned',
  origin_type   text check (origin_type is null or origin_type in ('lot','stock')),
  origin_id     uuid,
  replicate     int not null default 1,
  notes         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint samples_origin_consistent check ((origin_type is null) = (origin_id is null))
);

-- ============================================================
-- 3. sample_aliases (child of samples) — D8: a flat alias list, no kind
--    discriminator needed (unlike material_identifiers).
-- ============================================================
create table if not exists sample_aliases (
  id         uuid primary key default gen_random_uuid(),
  sample_id  uuid not null references samples(id) on delete cascade,
  workspace_id uuid references workspaces(id),
  alias      text not null,
  note       text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4. sample_relationships (typed edge, D4) — same shape as T1.7's
--    experiment_relationships, since this is sample-to-sample.
-- ============================================================
create table if not exists sample_relationships (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid references workspaces(id),
  source_sample_id   uuid not null references samples(id) on delete cascade,
  target_sample_id   uuid not null references samples(id) on delete cascade,
  relationship_type  text not null check (relationship_type in (
    'produced_from','consumed_by','split_into','combined_from',
    'diluted_from','dried_from','transferred_from','analyzed_in'
  )),
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  constraint sample_relationships_no_self check (source_sample_id <> target_sample_id),
  unique (source_sample_id, target_sample_id, relationship_type)
);

-- ============================================================
-- 5. sample_locations (D6) — current-location snapshot, one row per
--    sample, kept live by transfer sample_events (section 6).
-- ============================================================
create table if not exists sample_locations (
  sample_id     uuid primary key references samples(id) on delete cascade,
  workspace_id  uuid references workspaces(id),
  -- Plain prose string per §17.1's own example ("HUJI > MFP Lab > -80
  -- Freezer 1 > ..."), not six normalized hierarchy tables — no acceptance
  -- criterion asks for querying by individual hierarchy level.
  location_path text,
  -- App-validated against controlled_vocabularies('storage_status'), §17.3.
  status        text,
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- 6. sample_events (D5) — append-only. G7's chain-of-custody transfer
--    event lives here as one event_type among several (reconstitution,
--    dilution, aliquot, status_change, measured, note), rather than a
--    dedicated custody table the plan never named.
-- ============================================================
create table if not exists sample_events (
  id           uuid primary key default gen_random_uuid(),
  sample_id    uuid not null references samples(id) on delete cascade,
  workspace_id uuid references workspaces(id),
  event_type   text not null check (event_type in (
    'transfer','status_change','aliquoted','measured','note',
    'reconstitution','dilution'
  )),
  occurred_at  timestamptz not null default now(),
  performed_by uuid references auth.users(id),
  -- transfer: {from_location_path, to_location_path, reason,
  --   transport_temperature, courier, tracking_number,
  --   condition_on_receipt, quantity_received, status}
  -- reconstitution: per §13.1's field list; dilution: per §13.3's.
  details      jsonb not null default '{}',
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 7. sample_measurements (D7) — reuses the Quantity/quantity_kinds map
--    pattern (T1.4/T1.5/T2.2), not bespoke numeric columns.
-- ============================================================
create table if not exists sample_measurements (
  id           uuid primary key default gen_random_uuid(),
  sample_id    uuid not null references samples(id) on delete cascade,
  workspace_id uuid references workspaces(id),
  quantities   jsonb not null default '{}',
  measured_at  timestamptz not null default now(),
  measured_by  uuid references auth.users(id),
  notes        text,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 8. quantity_kinds — new rows for sample_measurements (D7), reusing the
--    mass/volume families T2.2 already added to convert.ts.
-- ============================================================
insert into quantity_kinds (key, label, category, canonical_unit_code, compatible_units, standard_field_name, sort_order) values
  ('sample_weight', 'Sample weight', 'physical', 'g', array['g','mg','kg','ug'], 'sample_weight_g', 15),
  ('sample_volume', 'Sample volume', 'physical', 'mL', array['mL','uL','L'], 'sample_volume_mL', 16)
on conflict (key) do nothing;

-- ============================================================
-- 9. controlled_vocabularies — storage_status (10th vocabulary, §17.3).
-- ============================================================
insert into controlled_vocabularies (vocabulary, value, sort_order, standard_section) values
  ('storage_status', 'in_storage', 1, '17.3'),
  ('storage_status', 'checked_out', 2, '17.3'),
  ('storage_status', 'in_instrument_queue', 3, '17.3'),
  ('storage_status', 'with_collaborator', 4, '17.3'),
  ('storage_status', 'in_transit', 5, '17.3'),
  ('storage_status', 'consumed', 6, '17.3'),
  ('storage_status', 'disposed', 7, '17.3'),
  ('storage_status', 'lost', 8, '17.3'),
  ('storage_status', 'location_unknown', 9, '17.3')
on conflict (vocabulary, value) do nothing;

-- ============================================================
-- 10. Batch auto-creation (D1) — AFTER INSERT on experiments, so the
--     implicit B1 always exists regardless of which app code path created
--     the experiment.
-- ============================================================
create or replace function create_implicit_batch() returns trigger language plpgsql as $$
begin
  insert into batches (experiment_id, label, workspace_id) values (new.id, 'B1', new.workspace_id);
  return new;
end;
$$;

drop trigger if exists trg_create_implicit_batch on experiments;
create trigger trg_create_implicit_batch after insert on experiments
  for each row execute function create_implicit_batch();

-- ============================================================
-- 11. Triggers (T2.1's D6 convention) — auto-populate workspace_id from
--     the immediate parent.
-- ============================================================
create or replace function set_workspace_from_batch_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from batches where id = new.batch_id;
  end if;
  return new;
end;
$$;

create or replace function set_workspace_from_sample_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from samples where id = new.sample_id;
  end if;
  return new;
end;
$$;

-- sample_relationships: also reject linking two samples from different
-- workspaces, mirroring T1.7/T2.1/T2.2's cross-workspace guards.
create or replace function set_workspace_from_sample_relationship() returns trigger language plpgsql as $$
declare
  source_ws uuid;
  target_ws uuid;
begin
  select workspace_id into source_ws from samples where id = new.source_sample_id;
  select workspace_id into target_ws from samples where id = new.target_sample_id;
  if source_ws is distinct from target_ws then
    raise exception 'Cannot relate samples from different workspaces.';
  end if;
  new.workspace_id := source_ws;
  return new;
end;
$$;

-- sample_events (D6): a transfer event keeps sample_locations live.
create or replace function apply_sample_transfer_event() returns trigger language plpgsql as $$
begin
  if new.event_type = 'transfer' then
    insert into sample_locations (sample_id, workspace_id, location_path, status, updated_at)
    values (
      new.sample_id,
      new.workspace_id,
      new.details->>'to_location_path',
      coalesce(new.details->>'status', null),
      new.occurred_at
    )
    on conflict (sample_id) do update set
      workspace_id = excluded.workspace_id,
      location_path = excluded.location_path,
      status = coalesce(excluded.status, sample_locations.status),
      updated_at = excluded.updated_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspace_samples on samples;
create trigger trg_workspace_samples before insert on samples
  for each row execute function set_workspace_from_batch_id();

drop trigger if exists trg_workspace_sample_aliases on sample_aliases;
create trigger trg_workspace_sample_aliases before insert on sample_aliases
  for each row execute function set_workspace_from_sample_id();

drop trigger if exists trg_workspace_sample_relationships on sample_relationships;
create trigger trg_workspace_sample_relationships before insert on sample_relationships
  for each row execute function set_workspace_from_sample_relationship();

drop trigger if exists trg_workspace_sample_events on sample_events;
create trigger trg_workspace_sample_events before insert on sample_events
  for each row execute function set_workspace_from_sample_id();

drop trigger if exists trg_apply_sample_transfer on sample_events;
create trigger trg_apply_sample_transfer after insert on sample_events
  for each row execute function apply_sample_transfer_event();

drop trigger if exists trg_workspace_sample_measurements on sample_measurements;
create trigger trg_workspace_sample_measurements before insert on sample_measurements
  for each row execute function set_workspace_from_sample_id();

-- ============================================================
-- 12. RLS — read via is_workspace_member, write via is_workspace_writer
--     (T2.1's security-definer functions). No backfill: every T2.3 table
--     is genuinely new, and the implicit-batch trigger only fires on
--     future experiment inserts (D3 — sample_matrix/existing experiments
--     are untouched, no batch is backfilled onto them).
-- ============================================================
alter table batches enable row level security;
drop policy if exists batches_read on batches;
create policy batches_read on batches for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists batches_write on batches;
create policy batches_write on batches for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table samples enable row level security;
drop policy if exists samples_read on samples;
create policy samples_read on samples for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists samples_write on samples;
create policy samples_write on samples for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table sample_aliases enable row level security;
drop policy if exists sample_aliases_read on sample_aliases;
create policy sample_aliases_read on sample_aliases for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists sample_aliases_write on sample_aliases;
create policy sample_aliases_write on sample_aliases for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table sample_relationships enable row level security;
drop policy if exists sample_relationships_read on sample_relationships;
create policy sample_relationships_read on sample_relationships for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists sample_relationships_write on sample_relationships;
create policy sample_relationships_write on sample_relationships for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table sample_locations enable row level security;
drop policy if exists sample_locations_read on sample_locations;
create policy sample_locations_read on sample_locations for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists sample_locations_write on sample_locations;
create policy sample_locations_write on sample_locations for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table sample_events enable row level security;
drop policy if exists sample_events_read on sample_events;
create policy sample_events_read on sample_events for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
-- Append-only (matches T1.5's step_observations/step_deviations): insert
-- only, no update/delete policy at all.
drop policy if exists sample_events_insert on sample_events;
create policy sample_events_insert on sample_events for insert to authenticated
  with check (is_workspace_writer(workspace_id, auth.uid()));

alter table sample_measurements enable row level security;
drop policy if exists sample_measurements_read on sample_measurements;
create policy sample_measurements_read on sample_measurements for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists sample_measurements_insert on sample_measurements;
create policy sample_measurements_insert on sample_measurements for insert to authenticated
  with check (is_workspace_writer(workspace_id, auth.uid()));
