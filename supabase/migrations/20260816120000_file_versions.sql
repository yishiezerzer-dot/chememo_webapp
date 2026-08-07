-- T2.7 — File versions, checksums, previews, metadata extraction (data-model
-- + status-tracking scope; drag-drop/real-progress/inline-preview UI and
-- their new dependencies are an explicit, disclosed follow-up item).
-- See Spec: ChemMemo_Feature_FileVersionsPreviews_Spec.md (D1-D6).
-- Idempotent throughout, matching T2.1-T2.6's convention. Unlike T2.1-T2.6,
-- this item DOES backfill: experiment_files is not a new table.

-- ============================================================
-- 1. file_versions (child of experiment_files, D1) — each physical upload.
--    experiment_files stays the logical file identity (mirrors T1.5's
--    protocols/protocol_versions split). Only kind='upload' rows get
--    versions; kind='link' rows have no bytes to version.
-- ============================================================
create table if not exists file_versions (
  id                  uuid primary key default gen_random_uuid(),
  experiment_file_id  uuid not null references experiment_files(id) on delete cascade,
  workspace_id        uuid references workspaces(id),
  version_number      int not null,
  storage_path        text not null,
  original_filename   text,
  mime_type           text,
  byte_size           bigint,
  sha256              text,
  -- D4: 'not_applicable' covers job types with no implemented processor yet
  -- (thumbnail; text_extract for anything but CSV) as well as kind='link'.
  processing_state    text not null default 'pending' check (processing_state in ('pending', 'processing', 'done', 'failed', 'not_applicable')),
  uploaded_by         uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  unique (experiment_file_id, version_number)
);

-- ============================================================
-- 2. experiment_files gains D3's classification/lineage columns, D1's
--    current-version pointer, and D5's analysis-run tag. storage_path/
--    sha256/byte_size/mime_type stay on experiment_files too, as a
--    denormalized cache of the CURRENT version (D2) — so every existing
--    read path (signedUrlsFor, file-list.tsx) keeps working unchanged;
--    file_versions is the source of truth for history.
-- ============================================================
alter table experiment_files
  add column if not exists current_version_id uuid references file_versions(id),
  add column if not exists file_role text check (file_role is null or file_role in ('raw', 'processed', 'report')),
  add column if not exists source_instrument text,
  add column if not exists acquisition_timestamp timestamptz,
  add column if not exists parsed_metadata jsonb not null default '{}',
  add column if not exists retention_state text not null default 'active' check (retention_state in ('active', 'archived')),
  add column if not exists analysis_run_id uuid references analysis_runs(id);

-- ============================================================
-- 3. file_jobs (child of file_versions, D4) — a durable queue, reusing
--    T0.5's index_jobs PATTERN (status enum, attempts/next_attempt_at
--    backoff, a trigger-based enqueue, a setInterval poller) but a new
--    table, since index_jobs is keyed 1:1 by experiment_id for a single
--    job type and can't hold multiple concurrent job types per file.
--    No authenticated RLS policies — "operational bookkeeping only, no
--    user-authored content," identical rationale to index_jobs. The
--    user-visible signal is file_versions.processing_state, which IS
--    normally readable (see RLS below).
-- ============================================================
create table if not exists file_jobs (
  id              uuid primary key default gen_random_uuid(),
  file_version_id uuid not null references file_versions(id) on delete cascade,
  job_type        text not null check (job_type in ('text_extract', 'thumbnail')),
  status          text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed', 'not_applicable')),
  attempts        int not null default 0,
  last_error      text,
  result          jsonb not null default '{}',
  next_attempt_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists file_jobs_pending_idx on file_jobs (next_attempt_at) where status = 'pending';

alter table file_jobs enable row level security;
-- No policies for `authenticated` — matches index_jobs' precedent exactly.

-- ============================================================
-- 4. Enqueue trigger (D4) — by mime_type. Only CSV has a real extractor
--    implemented this pass (a plain UTF-8 decode, no new dependency);
--    XLSX/PDF text_extract and all thumbnail jobs resolve 'not_applicable'
--    once picked up by the poller, per Yishi's explicit answer: prove the
--    queue end-to-end now, a future worker just adds the real processor.
-- ============================================================
create or replace function enqueue_file_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.mime_type in ('text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf') then
    insert into file_jobs (file_version_id, job_type, status, next_attempt_at) values (new.id, 'text_extract', 'pending', now());
  end if;
  if new.mime_type in ('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/tiff', 'application/pdf') then
    insert into file_jobs (file_version_id, job_type, status, next_attempt_at) values (new.id, 'thumbnail', 'pending', now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_file_jobs on file_versions;
create trigger trg_enqueue_file_jobs after insert on file_versions
  for each row execute function enqueue_file_jobs();

-- ============================================================
-- 5. Workspace-inheritance trigger (T2.1's D6 convention).
-- ============================================================
create or replace function set_workspace_from_experiment_file_id() returns trigger language plpgsql as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id from experiment_files where id = new.experiment_file_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspace_file_versions on file_versions;
create trigger trg_workspace_file_versions before insert on file_versions
  for each row execute function set_workspace_from_experiment_file_id();

-- ============================================================
-- 6. RLS on file_versions — read via is_workspace_member; write mirrors
--    experiment_files_write's owner-only check exactly (a version can
--    only be added/removed by the parent experiment's owner).
-- ============================================================
alter table file_versions enable row level security;
drop policy if exists file_versions_read on file_versions;
create policy file_versions_read on file_versions for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
drop policy if exists file_versions_write on file_versions;
create policy file_versions_write on file_versions for all to authenticated
  using (
    is_workspace_member(workspace_id, auth.uid())
    and exists (
      select 1 from experiment_files f join experiments e on e.id = f.experiment_id
      where f.id = experiment_file_id and e.owner_id = auth.uid()
    )
  )
  with check (
    is_workspace_writer(workspace_id, auth.uid())
    and exists (
      select 1 from experiment_files f join experiments e on e.id = f.experiment_id
      where f.id = experiment_file_id and e.owner_id = auth.uid()
    )
  );

-- ============================================================
-- 7. Backfill (D1's rollout note) — experiment_files is NOT new, so every
--    existing upload gets exactly one synthetic version 1, copying its
--    current physical data, then current_version_id is set to point at
--    it. Fires the enqueue trigger like any other insert, so existing CSV
--    files genuinely get text-extracted too, not just new ones.
-- ============================================================
insert into file_versions (experiment_file_id, workspace_id, version_number, storage_path, original_filename, mime_type, byte_size, sha256, uploaded_by, created_at)
select f.id, f.workspace_id, 1, f.storage_path, f.label, f.mime_type, f.byte_size, f.sha256, f.uploaded_by, f.created_at
from experiment_files f
where f.kind = 'upload' and f.storage_path is not null
  and not exists (select 1 from file_versions v where v.experiment_file_id = f.id);

update experiment_files f
set current_version_id = v.id
from file_versions v
where v.experiment_file_id = f.id and v.version_number = 1 and f.current_version_id is null;
