-- T2.5 — Analytical run model.
-- See Spec: ChemMemo_Feature_AnalyticalRuns_Spec.md (D1-D7).
-- Idempotent throughout, matching T2.1-T2.4's convention.

-- ============================================================
-- 1. instruments (top-level, workspace-scoped) — D1: the physical machine,
--    not the method run on it.
-- ============================================================
create table if not exists instruments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id),
  name          text not null,
  model         text,
  serial_number text,
  location      text,
  notes         text,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

-- ============================================================
-- 2. instrument_methods (child of instruments) — D2: a named, reusable
--    method; parameters holds §14's stable, per-method-not-per-run settings.
-- ============================================================
create table if not exists instrument_methods (
  id            uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references instruments(id) on delete cascade,
  workspace_id  uuid references workspaces(id),
  name          text not null,
  -- App-validated against controlled_vocabularies('method_type').
  method_type   text not null,
  parameters    jsonb not null default '{}',
  notes         text,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- 3. analysis_runs (child of samples, D3) — links sample + method + status.
--    run_parameters holds §14's per-run-varying values (injection order,
--    sequence file, blank/QC positions, plate map, replicate count), distinct
--    from instrument_methods.parameters' stable defaults.
-- ============================================================
create table if not exists analysis_runs (
  id                   uuid primary key default gen_random_uuid(),
  sample_id            uuid not null references samples(id) on delete cascade,
  workspace_id         uuid references workspaces(id),
  instrument_method_id uuid not null references instrument_methods(id),
  -- App-validated against controlled_vocabularies('analysis_status'), §23.4.
  status               text not null default 'planned',
  operator             text,
  acquired_at          timestamptz,
  run_parameters       jsonb not null default '{}',
  notes                text,
  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now()
);

-- ============================================================
-- 4. analysis_files (child of analysis_runs, D4) — lightweight text
--    references, not a new upload/storage-bucket pipeline (disclosed
--    scope trim: real ingestion of raw instrument formats is later work).
-- ============================================================
create table if not exists analysis_files (
  id              uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  workspace_id    uuid references workspaces(id),
  file_role       text not null check (file_role in ('raw', 'processed', 'report')),
  filename        text,
  url             text,
  uploaded_by     uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- 5. analysis_results (child of analysis_runs, D5) — common fields +
--    a method-typed `details` jsonb (§14's interpreted-result fields per
--    technique — "method-specific extensions start as JSONB", the plan's
--    own instruction, applied directly instead of 7 separate result tables).
-- ============================================================
create table if not exists analysis_results (
  id              uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references analysis_runs(id) on delete cascade,
  workspace_id    uuid references workspaces(id),
  -- App-validated against controlled_vocabularies('result_confidence'), §23.6.
  result_confidence text,
  summary         text,
  details         jsonb not null default '{}',
  quality_notes   text,
  interpreted_by  uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

-- ============================================================
-- 6. peak_assignments (child of analysis_results, D6) — the one genuinely
--    tabular per-method exception (LC-MS features are naturally
--    multi-row per result, unlike every other method's single details blob).
-- ============================================================
create table if not exists peak_assignments (
  id                  uuid primary key default gen_random_uuid(),
  analysis_result_id  uuid not null references analysis_results(id) on delete cascade,
  workspace_id        uuid references workspaces(id),
  expected_mz         numeric,
  observed_mz         numeric,
  ion_mode            text check (ion_mode is null or ion_mode in ('positive', 'negative')),
  adduct              text,
  charge              int,
  ppm_error           numeric,
  retention_time_min  numeric,
  ms_level            int,
  intensity           numeric,
  formula_candidate   text,
  assignment          text,
  -- App-validated against controlled_vocabularies('assignment_confidence'),
  -- §14.1 — a distinct, per-peak vocabulary from analysis_results'
  -- record-level result_confidence (same size, different meaning).
  confidence          text,
  linked_file_id       uuid references analysis_files(id),
  notes               text,
  created_at          timestamptz not null default now()
);

-- ============================================================
-- 7. controlled_vocabularies — method_type (8th) and assignment_confidence
--    (9th) vocabularies. analysis_status/result_confidence (§23.4/§23.6)
--    were already seeded in T1.1 and stay unconsumed until this migration.
-- ============================================================
insert into controlled_vocabularies (vocabulary, value, sort_order, standard_section) values
  ('method_type', 'lc_ms', 1, '14.1'),
  ('method_type', 'nmr', 2, '14.2'),
  ('method_type', 'ftir', 3, '14.3'),
  ('method_type', 'microscopy', 4, '14.4'),
  ('method_type', 'plate_reader', 5, '14.5'),
  ('method_type', 'lumisizer', 6, '14.6'),
  ('method_type', 'hplc', 7, '14.7'),
  ('method_type', 'gc_ms', 8, '14.7'),
  ('method_type', 'cd', 9, '14.7'),
  ('method_type', 'epr', 10, '14.7'),
  ('method_type', 'tga', 11, '14.7'),
  ('assignment_confidence', 'confirmed', 1, '14.1'),
  ('assignment_confidence', 'probable', 2, '14.1'),
  ('assignment_confidence', 'tentative', 3, '14.1'),
  ('assignment_confidence', 'formula_only', 4, '14.1'),
  ('assignment_confidence', 'unknown_feature', 5, '14.1'),
  ('assignment_confidence', 'artifact_suspected', 6, '14.1')
on conflict (vocabulary, value) do nothing;

-- ============================================================
-- 8. Triggers (T2.1's D6 convention) — auto-populate workspace_id from the
--    immediate parent.
-- ============================================================
create or replace function set_workspace_from_instrument_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from instruments where id = new.instrument_id;
  end if;
  return new;
end;
$$;

create or replace function set_workspace_from_sample_id_analysis() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from samples where id = new.sample_id;
  end if;
  return new;
end;
$$;

create or replace function set_workspace_from_analysis_run_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from analysis_runs where id = new.analysis_run_id;
  end if;
  return new;
end;
$$;

create or replace function set_workspace_from_analysis_result_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from analysis_results where id = new.analysis_result_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspace_instrument_methods on instrument_methods;
create trigger trg_workspace_instrument_methods before insert on instrument_methods
  for each row execute function set_workspace_from_instrument_id();

drop trigger if exists trg_workspace_analysis_runs on analysis_runs;
create trigger trg_workspace_analysis_runs before insert on analysis_runs
  for each row execute function set_workspace_from_sample_id_analysis();

drop trigger if exists trg_workspace_analysis_files on analysis_files;
create trigger trg_workspace_analysis_files before insert on analysis_files
  for each row execute function set_workspace_from_analysis_run_id();

drop trigger if exists trg_workspace_analysis_results on analysis_results;
create trigger trg_workspace_analysis_results before insert on analysis_results
  for each row execute function set_workspace_from_analysis_run_id();

drop trigger if exists trg_workspace_peak_assignments on peak_assignments;
create trigger trg_workspace_peak_assignments before insert on peak_assignments
  for each row execute function set_workspace_from_analysis_result_id();

-- ============================================================
-- 9. RLS — read via is_workspace_member, write via is_workspace_writer.
--    No backfill: every T2.5 table is genuinely new.
-- ============================================================
alter table instruments enable row level security;
drop policy if exists instruments_read on instruments;
create policy instruments_read on instruments for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists instruments_write on instruments;
create policy instruments_write on instruments for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table instrument_methods enable row level security;
drop policy if exists instrument_methods_read on instrument_methods;
create policy instrument_methods_read on instrument_methods for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists instrument_methods_write on instrument_methods;
create policy instrument_methods_write on instrument_methods for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table analysis_runs enable row level security;
drop policy if exists analysis_runs_read on analysis_runs;
create policy analysis_runs_read on analysis_runs for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists analysis_runs_write on analysis_runs;
create policy analysis_runs_write on analysis_runs for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table analysis_files enable row level security;
drop policy if exists analysis_files_read on analysis_files;
create policy analysis_files_read on analysis_files for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists analysis_files_write on analysis_files;
create policy analysis_files_write on analysis_files for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table analysis_results enable row level security;
drop policy if exists analysis_results_read on analysis_results;
create policy analysis_results_read on analysis_results for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists analysis_results_write on analysis_results;
create policy analysis_results_write on analysis_results for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));

alter table peak_assignments enable row level security;
drop policy if exists peak_assignments_read on peak_assignments;
create policy peak_assignments_read on peak_assignments for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists peak_assignments_write on peak_assignments;
create policy peak_assignments_write on peak_assignments for all to authenticated
  using (is_workspace_writer(workspace_id, auth.uid())) with check (is_workspace_writer(workspace_id, auth.uid()));
