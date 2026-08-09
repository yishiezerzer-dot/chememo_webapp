-- T3.1 — Chunked, versioned evidence index.
-- See Spec: ChemMemo_Feature_ChunkedEvidenceIndex_Spec.md (D1-D6).
-- Idempotent throughout, matching this session's established convention.
--
-- D1: one evidence_chunks table doubles as its own job queue (unlike T2.7's
-- file_versions/file_jobs split, needed only because a file version could
-- require multiple concurrent job types — a chunk only ever needs one job:
-- embed this content).

create table if not exists evidence_chunks (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid references workspaces(id),
  source_type          text not null check (source_type in (
    'experiment', 'step_observation', 'step_deviation', 'protocol_version', 'protocol_step',
    'sample_event', 'sample_measurement', 'analysis_result', 'comment', 'condition_cycle'
  )),
  source_id            text not null,
  section_type         text not null check (section_type in (
    'observations', 'deviation', 'procedure', 'protocol_step', 'analytical_result', 'discussion'
  )),
  content              text not null,
  content_hash         text not null,
  metadata             jsonb not null default '{}',
  embedding            vector(1536),
  embedding_model      text,
  embedding_dimensions int,
  embedding_version    int not null default 1,
  status               text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts             int not null default 0,
  last_error           text,
  next_attempt_at      timestamptz not null default now(),
  indexed_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists evidence_chunks_pending_idx on evidence_chunks (next_attempt_at) where status = 'pending';
create index if not exists evidence_chunks_source_idx on evidence_chunks (source_type, source_id);
create index if not exists evidence_chunks_hnsw on evidence_chunks using hnsw (embedding vector_cosine_ops);

alter table evidence_chunks enable row level security;
drop policy if exists evidence_chunks_read on evidence_chunks;
create policy evidence_chunks_read on evidence_chunks for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));
-- No authenticated write policy — every write goes through the
-- security-definer upsert function below (matches enqueue_index_job()'s
-- precedent: a trigger writing across tables needs elevated privilege).

-- ============================================================
-- D4 — the shared upsert: hash-check-and-skip so an unrelated column
-- update with unchanged narrative content doesn't force a redundant
-- re-embed. security definer since it writes into a different table than
-- whichever one's trigger called it (same rationale as enqueue_index_job()).
-- ============================================================
create or replace function upsert_evidence_chunk(
  p_workspace_id uuid,
  p_source_type text,
  p_source_id text,
  p_section_type text,
  p_content text,
  p_metadata jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := md5(p_content);
  v_existing_hash text;
begin
  select content_hash into v_existing_hash from evidence_chunks
    where source_type = p_source_type and source_id = p_source_id;

  if v_existing_hash is null then
    insert into evidence_chunks (workspace_id, source_type, source_id, section_type, content, content_hash, metadata, status, next_attempt_at)
    values (p_workspace_id, p_source_type, p_source_id, p_section_type, p_content, v_hash, p_metadata, 'pending', now());
  elsif v_existing_hash <> v_hash then
    update evidence_chunks
    set content = p_content, metadata = p_metadata, workspace_id = p_workspace_id,
        content_hash = v_hash, status = 'pending', attempts = 0, last_error = null,
        next_attempt_at = now(), updated_at = now()
    where source_type = p_source_type and source_id = p_source_id;
  end if;
  -- hash unchanged -> do nothing, skip the redundant embed call.
end;
$$;

-- ============================================================
-- D2 — ten trigger functions, one per chunkable source. Each resolves its
-- own parent-experiment id (or, for the two protocol-level sources, a
-- protocol_version_id — protocols are reusable across experiments, so
-- there is no single parent to bake in at write time; retrieval resolves
-- "which experiments use this protocol version" live instead). Every
-- trigger fires on insert OR update (even for append-only-by-convention
-- tables) so the one-time backfill below can use a uniform
-- self-assignment-update technique across all ten tables.
-- ============================================================

create or replace function enqueue_evidence_chunk_experiment() returns trigger language plpgsql as $$
declare
  v_content text := 'Experiment ' || new.id || ': ' || new.name;
begin
  if new.date is not null then v_content := v_content || E'\nDate: ' || new.date; end if;
  if new.researcher is not null then v_content := v_content || E'\nResearcher: ' || new.researcher; end if;
  if new.project is not null then v_content := v_content || E'\nProject: ' || new.project; end if;
  if new.observations is not null and new.observations <> '' then v_content := v_content || E'\nObservations: ' || new.observations; end if;
  if new.notes is not null and new.notes <> '' then v_content := v_content || E'\nNotes: ' || new.notes; end if;
  perform upsert_evidence_chunk(new.workspace_id, 'experiment', new.id, 'observations', v_content,
    jsonb_build_object('experiment_id', new.id, 'date', new.date, 'researcher', new.researcher, 'project', new.project));
  return new;
end;
$$;
drop trigger if exists trg_evidence_chunk_experiment on experiments;
create trigger trg_evidence_chunk_experiment after insert or update on experiments
  for each row execute function enqueue_evidence_chunk_experiment();

create or replace function enqueue_evidence_chunk_step_observation() returns trigger language plpgsql as $$
declare
  v_experiment_id text;
begin
  select experiment_id into v_experiment_id from experiment_steps where id = new.experiment_step_id;
  perform upsert_evidence_chunk(new.workspace_id, 'step_observation', new.id::text, 'observations',
    'Experiment ' || coalesce(v_experiment_id, '?') || ' — step observation: ' || new.note,
    jsonb_build_object('experiment_id', v_experiment_id));
  return new;
end;
$$;
drop trigger if exists trg_evidence_chunk_step_observation on step_observations;
create trigger trg_evidence_chunk_step_observation after insert or update on step_observations
  for each row execute function enqueue_evidence_chunk_step_observation();

create or replace function enqueue_evidence_chunk_step_deviation() returns trigger language plpgsql as $$
declare
  v_experiment_id text;
  v_content text;
begin
  select experiment_id into v_experiment_id from experiment_steps where id = new.experiment_step_id;
  v_content := 'Experiment ' || coalesce(v_experiment_id, '?') || ' — deviation (' || new.category || '): ' || new.what_happened;
  if new.how_discovered is not null then v_content := v_content || E'\nHow discovered: ' || new.how_discovered; end if;
  if new.likely_impact is not null then v_content := v_content || E'\nLikely impact: ' || new.likely_impact; end if;
  if new.corrective_action is not null then v_content := v_content || E'\nCorrective action: ' || new.corrective_action; end if;
  if new.preventive_action is not null then v_content := v_content || E'\nPreventive action: ' || new.preventive_action; end if;
  perform upsert_evidence_chunk(new.workspace_id, 'step_deviation', new.id::text, 'deviation', v_content,
    jsonb_build_object('experiment_id', v_experiment_id));
  return new;
end;
$$;
drop trigger if exists trg_evidence_chunk_step_deviation on step_deviations;
create trigger trg_evidence_chunk_step_deviation after insert or update on step_deviations
  for each row execute function enqueue_evidence_chunk_step_deviation();

create or replace function enqueue_evidence_chunk_protocol_version() returns trigger language plpgsql as $$
declare
  v_content text := 'Protocol version ' || new.id::text;
begin
  if new.purpose is not null then v_content := v_content || E'\nPurpose: ' || new.purpose; end if;
  if new.scope is not null then v_content := v_content || E'\nScope: ' || new.scope; end if;
  if new.required_materials is not null then v_content := v_content || E'\nRequired materials: ' || new.required_materials; end if;
  if new.equipment is not null then v_content := v_content || E'\nEquipment: ' || new.equipment; end if;
  if new.safety_notes is not null then v_content := v_content || E'\nSafety notes: ' || new.safety_notes; end if;
  if new.qc_checks is not null then v_content := v_content || E'\nQC checks: ' || new.qc_checks; end if;
  perform upsert_evidence_chunk(new.workspace_id, 'protocol_version', new.id::text, 'procedure', v_content,
    jsonb_build_object('protocol_version_id', new.id));
  return new;
end;
$$;
drop trigger if exists trg_evidence_chunk_protocol_version on protocol_versions;
create trigger trg_evidence_chunk_protocol_version after insert or update on protocol_versions
  for each row execute function enqueue_evidence_chunk_protocol_version();

create or replace function enqueue_evidence_chunk_protocol_step() returns trigger language plpgsql as $$
begin
  perform upsert_evidence_chunk(new.workspace_id, 'protocol_step', new.id::text, 'protocol_step',
    'Step ' || new.step_number || ': ' || new.instruction,
    jsonb_build_object('protocol_version_id', new.protocol_version_id));
  return new;
end;
$$;
drop trigger if exists trg_evidence_chunk_protocol_step on protocol_steps;
create trigger trg_evidence_chunk_protocol_step after insert or update on protocol_steps
  for each row execute function enqueue_evidence_chunk_protocol_step();

create or replace function enqueue_evidence_chunk_sample_event() returns trigger language plpgsql as $$
declare
  v_experiment_id text;
begin
  select b.experiment_id into v_experiment_id
    from samples s join batches b on b.id = s.batch_id
    where s.id = new.sample_id;
  perform upsert_evidence_chunk(new.workspace_id, 'sample_event', new.id::text, 'observations',
    'Experiment ' || coalesce(v_experiment_id, '?') || ' — sample ' || new.event_type || ' event: ' || new.details::text,
    jsonb_build_object('experiment_id', v_experiment_id));
  return new;
end;
$$;
drop trigger if exists trg_evidence_chunk_sample_event on sample_events;
create trigger trg_evidence_chunk_sample_event after insert or update on sample_events
  for each row execute function enqueue_evidence_chunk_sample_event();

create or replace function enqueue_evidence_chunk_sample_measurement() returns trigger language plpgsql as $$
declare
  v_experiment_id text;
  v_content text;
begin
  select b.experiment_id into v_experiment_id
    from samples s join batches b on b.id = s.batch_id
    where s.id = new.sample_id;
  v_content := 'Experiment ' || coalesce(v_experiment_id, '?') || ' — sample measurement: ' || new.quantities::text;
  if new.notes is not null then v_content := v_content || E'\nNotes: ' || new.notes; end if;
  perform upsert_evidence_chunk(new.workspace_id, 'sample_measurement', new.id::text, 'observations', v_content,
    jsonb_build_object('experiment_id', v_experiment_id));
  return new;
end;
$$;
drop trigger if exists trg_evidence_chunk_sample_measurement on sample_measurements;
create trigger trg_evidence_chunk_sample_measurement after insert or update on sample_measurements
  for each row execute function enqueue_evidence_chunk_sample_measurement();

create or replace function enqueue_evidence_chunk_analysis_result() returns trigger language plpgsql as $$
declare
  v_experiment_id text;
  v_content text;
begin
  select b.experiment_id into v_experiment_id
    from analysis_runs ar join samples s on s.id = ar.sample_id join batches b on b.id = s.batch_id
    where ar.id = new.analysis_run_id;
  v_content := 'Experiment ' || coalesce(v_experiment_id, '?') || ' — analysis result';
  if new.summary is not null then v_content := v_content || E'\nSummary: ' || new.summary; end if;
  if new.details is not null and new.details <> '{}'::jsonb then v_content := v_content || E'\nDetails: ' || new.details::text; end if;
  if new.quality_notes is not null then v_content := v_content || E'\nQuality notes: ' || new.quality_notes; end if;
  perform upsert_evidence_chunk(new.workspace_id, 'analysis_result', new.id::text, 'analytical_result', v_content,
    jsonb_build_object('experiment_id', v_experiment_id));
  return new;
end;
$$;
drop trigger if exists trg_evidence_chunk_analysis_result on analysis_results;
create trigger trg_evidence_chunk_analysis_result after insert or update on analysis_results
  for each row execute function enqueue_evidence_chunk_analysis_result();

create or replace function enqueue_evidence_chunk_comment() returns trigger language plpgsql as $$
declare
  v_experiment_id text;
begin
  if new.target_type = 'experiment' then
    v_experiment_id := new.target_id;
  elsif new.target_type = 'experiment_step' then
    select experiment_id into v_experiment_id from experiment_steps where id::text = new.target_id;
  elsif new.target_type = 'experiment_file' then
    select experiment_id into v_experiment_id from experiment_files where id::text = new.target_id;
  end if;
  perform upsert_evidence_chunk(new.workspace_id, 'comment', new.id::text, 'discussion',
    'Experiment ' || coalesce(v_experiment_id, '?') || ' — comment: ' || new.body,
    jsonb_build_object('experiment_id', v_experiment_id));
  return new;
end;
$$;
drop trigger if exists trg_evidence_chunk_comment on comments;
create trigger trg_evidence_chunk_comment after insert or update on comments
  for each row execute function enqueue_evidence_chunk_comment();

create or replace function enqueue_evidence_chunk_condition_cycle() returns trigger language plpgsql as $$
declare
  v_experiment_id text;
  v_content text;
begin
  select b.experiment_id into v_experiment_id
    from batch_condition_programs bcp join batches b on b.id = bcp.batch_id
    where bcp.id = new.batch_condition_program_id;
  v_content := 'Experiment ' || coalesce(v_experiment_id, '?') || ' — condition cycle ' || new.cycle_index;
  if new.observation is not null then v_content := v_content || E'\nObservation: ' || new.observation; end if;
  if new.deviation is not null and new.deviation <> '{}'::jsonb then v_content := v_content || E'\nDeviation: ' || new.deviation::text; end if;
  perform upsert_evidence_chunk(new.workspace_id, 'condition_cycle', new.id::text, 'observations', v_content,
    jsonb_build_object('experiment_id', v_experiment_id));
  return new;
end;
$$;
drop trigger if exists trg_evidence_chunk_condition_cycle on condition_program_cycles;
create trigger trg_evidence_chunk_condition_cycle after insert or update on condition_program_cycles
  for each row execute function enqueue_evidence_chunk_condition_cycle();

-- ============================================================
-- D5 — chunk-level match RPC, same convention as match_experiments
-- (security invoker so the caller's own RLS on evidence_chunks applies).
-- ============================================================
create or replace function match_evidence_chunks(query_embedding vector(1536), match_count int default 20)
returns table (id uuid, source_type text, source_id text, section_type text, metadata jsonb, similarity float)
language sql stable
security invoker
as $$
  select ec.id, ec.source_type, ec.source_id, ec.section_type, ec.metadata,
         1 - (ec.embedding <=> query_embedding) as similarity
  from evidence_chunks ec
  where ec.embedding is not null and ec.status = 'done'
  order by ec.embedding <=> query_embedding
  limit match_count;
$$;

-- ============================================================
-- D5 — retire the old per-experiment embedding system's writes. Tables and
-- historical data stay in place (not dropped); just stop enqueueing new
-- index_jobs rows now that evidence_chunks takes over retrieval.
-- ============================================================
drop trigger if exists experiments_enqueue_index_job on experiments;

-- ============================================================
-- One-time backfill (Rollout) — every trigger above fires on insert OR
-- update, so a harmless self-assignment update re-runs each one for every
-- existing row, chunking historical data too, not just future edits.
-- ============================================================
update experiments set id = id;
update step_observations set id = id;
update step_deviations set id = id;
update protocol_versions set id = id;
update protocol_steps set id = id;
update sample_events set id = id;
update sample_measurements set id = id;
update analysis_results set id = id;
update comments set id = id;
update condition_program_cycles set id = id;
