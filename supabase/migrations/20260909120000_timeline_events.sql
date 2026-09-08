-- The chronological execution log — standard §10, closing gap G3.
--
-- This is the thing a lab notebook actually is, and it was never built. In its
-- absence "what happened" scattered across four tables and a column with no
-- cutover between any of them: step_observations and step_deviations (only
-- reachable if the experiment has a protocol version, which most do not),
-- comments on three target types, sample_events, sample_measurements,
-- condition_program_cycles.observation buried three disclosures deep,
-- analysis_results.summary four deep, and experiments.observations, which the
-- AI can also overwrite. A scientist with one sentence to record had eleven
-- places to put it.
--
-- ============================================================
-- 1. The table — §10.1's eight columns, kept as eight columns.
--
--    Timestamp        -> occurred_at
--    Person           -> actor_id
--    Event type       -> event_type
--    Sample or batch  -> sample_id / batch_id / subject_label
--    What was done    -> action
--    Observation      -> observation
--    Deviation        -> deviation_note
--    Next action      -> next_action
--
--    subject_label exists because a scientist says "the Zn batch" long before
--    that resolves to a uuid, and §4 forbids silently renaming what someone
--    actually wrote. The utterance is kept next to the resolved id, not
--    instead of it.
-- ============================================================
create table if not exists timeline_events (
  id                 uuid primary key default gen_random_uuid(),
  experiment_id      text not null references experiments(id) on delete cascade,
  workspace_id       uuid references workspaces(id),

  -- occurred_at is backdatable: you write up the 09:00 filtration at 14:00.
  -- recorded_at is when the database actually heard about it, is forced by a
  -- trigger below, and is never client-settable -- so a backdated entry stays
  -- honest about being backdated.
  occurred_at        timestamptz not null default now(),
  recorded_at        timestamptz not null default now(),
  actor_id           uuid references auth.users(id),

  -- §10.1's sixteen recommended types, plus one. 'observed' is the default for
  -- free text: most of what gets typed at a bench is not one of the sixteen,
  -- and forcing a classification before you can write is exactly the friction
  -- this table removes. Filing an unclassifiable sentence as 'checked' would
  -- be a false record.
  --
  -- A CHECK rather than a controlled_vocabularies seed, unlike sample_type and
  -- its siblings: the AI writes this column, and apply_ai_suggestion's rule --
  -- never let model output reach a DB identifier without a database guarantee
  -- behind it -- applies directly. There is no correction type; a correction
  -- is the same event type pointing at what it corrects (see corrects_event_id).
  event_type         text not null default 'observed' check (event_type in (
    'planned', 'prepared', 'started', 'checked', 'reconstituted', 'transferred',
    'frozen', 'thawed', 'measured', 'analyzed', 'failed', 'deviated', 'shipped',
    'received', 'disposed', 'decision', 'observed'
  )),

  batch_id           uuid references batches(id) on delete set null,
  sample_id          uuid references samples(id) on delete set null,
  experiment_step_id uuid references experiment_steps(id) on delete set null,
  file_id            uuid references experiment_files(id) on delete set null,
  subject_label      text,

  action             text,
  observation        text,
  deviation_note     text,
  next_action        text,

  -- §11.3's quality flags (gap G2). The column ships now because retrofitting
  -- an array onto an append-only table means every historical row silently
  -- lacks it; the UI that sets it comes later.
  quality_flags      text[] not null default '{}',

  -- §10.2 — corrections never overwrite. Both rows stay; the UI renders them
  -- together. Same-experiment is enforced by trigger below.
  corrects_event_id  uuid references timeline_events(id) on delete set null,

  -- Provenance of the row itself. source_type is null for a native entry
  -- someone typed; otherwise it names the table this was projected from, and
  -- source_id points back at that row.
  source_type        text check (source_type is null or source_type in (
    'step_observations', 'step_deviations', 'sample_events',
    'sample_measurements', 'condition_program_cycles', 'analysis_results'
  )),
  source_id          text,

  details            jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),

  -- A row has to say something. Without this an empty event is insertable and
  -- the log fills with blanks nobody can delete.
  constraint timeline_events_has_content check (
    coalesce(btrim(action), '') <> ''
    or coalesce(btrim(observation), '') <> ''
    or coalesce(btrim(deviation_note), '') <> ''
    or coalesce(btrim(next_action), '') <> ''
  )
);

create index if not exists timeline_events_experiment_idx
  on timeline_events (experiment_id, occurred_at desc);
create index if not exists timeline_events_sample_idx
  on timeline_events (sample_id) where sample_id is not null;
create index if not exists timeline_events_corrects_idx
  on timeline_events (corrects_event_id) where corrects_event_id is not null;

-- Makes projection idempotent: a source row can be mirrored exactly once, so
-- the backfill below cannot double-write and a re-run is harmless.
create unique index if not exists timeline_events_source_idx
  on timeline_events (source_type, source_id) where source_type is not null;

-- ============================================================
-- 2. Triggers RLS cannot express
-- ============================================================

-- workspace_id derived from the parent experiment, never from the client.
-- Unconditional, NOT `if new.workspace_id is null`: the client can supply this
-- column on a PostgREST insert, and deriving it is the only way it can be
-- trusted. Security invoker, so the lookup runs under the caller's own RLS --
-- an experiment they cannot read yields null and the insert policy rejects it.
create or replace function set_workspace_from_timeline_experiment() returns trigger
language plpgsql as $$
begin
  select workspace_id into new.workspace_id from experiments where id = new.experiment_id;
  -- recorded_at is the tamper-evident half of the timestamp pair; whatever the
  -- client sent is discarded.
  new.recorded_at := now();
  if new.corrects_event_id is not null
     and not exists (
       select 1 from timeline_events t
       where t.id = new.corrects_event_id and t.experiment_id = new.experiment_id
     ) then
    raise exception 'A correction must belong to the same experiment as the event it corrects.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_workspace_timeline_events on timeline_events;
create trigger trg_workspace_timeline_events
  before insert on timeline_events
  for each row execute function set_workspace_from_timeline_experiment();

-- ============================================================
-- 3. RLS — append-only.
--
-- SELECT and INSERT only. No UPDATE policy and no DELETE policy, so §10.2's
-- "correct by adding an event, never delete the original" is enforced by the
-- database rather than by everyone remembering. Same shape as
-- step_observations, step_deviations and experiment_lock_events.
-- ============================================================
alter table timeline_events enable row level security;

drop policy if exists timeline_events_read on timeline_events;
create policy timeline_events_read on timeline_events for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));

drop policy if exists timeline_events_insert on timeline_events;
create policy timeline_events_insert on timeline_events for insert to authenticated
  with check (
    is_workspace_writer(workspace_id, auth.uid())
    -- Without this, any workspace writer could log a bench event under a
    -- colleague's name in a scientific record. This is the same defect
    -- 20260908120000 had to close on comments after the fact; closed up front.
    and actor_id = auth.uid()
    -- Projected rows are written by security-definer functions below, which
    -- bypass RLS. Forbidding a client from claiming a source_type is what makes
    -- "this row mirrors a real structured write" unforgeable.
    and source_type is null
  );

-- ============================================================
-- 4. Projections.
--
-- The existing write surfaces are NOT migrated and NOT retired. They carry
-- semantics the log does not model, and moving a column out of a structured
-- row destroys that row's meaning. Instead each mirrors into the log on
-- insert, so the log is complete by construction and cannot be bypassed --
-- which matters because several of these tables have `for all to authenticated`
-- write policies, so a client can write to them directly and any dual-write in
-- the service layer would miss it. Only a trigger is complete.
--
-- Copied from the pattern 20260818120000_evidence_chunks.sql already
-- establishes with ten functions of exactly this shape.
--
-- INSERT ONLY, deliberately: condition_program_cycles and analysis_results are
-- updatable, and projecting their updates would put mutable rows into an
-- append-only log.
--
-- Comments are deliberately NOT projected. A comment is a conversation *about*
-- the record, not a record of what happened at the bench; §10.1's columns do
-- not describe one, and an append-only log cannot represent "resolved". The
-- log view interleaves them client-side instead.
-- ============================================================

create or replace function project_step_observation_to_timeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare exp_id text;
begin
  select es.experiment_id into exp_id from experiment_steps es where es.id = new.experiment_step_id;
  if exp_id is null then return new; end if;
  insert into timeline_events (experiment_id, occurred_at, actor_id, event_type, observation,
                               experiment_step_id, source_type, source_id)
  values (exp_id, new.observed_at, new.observed_by, 'observed', new.note,
          new.experiment_step_id, 'step_observations', new.id::text)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_timeline_step_observation on step_observations;
create trigger trg_timeline_step_observation
  after insert on step_observations
  for each row execute function project_step_observation_to_timeline();

create or replace function project_step_deviation_to_timeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare exp_id text;
begin
  select es.experiment_id into exp_id from experiment_steps es where es.id = new.experiment_step_id;
  if exp_id is null then return new; end if;
  insert into timeline_events (experiment_id, occurred_at, actor_id, event_type,
                               action, deviation_note, next_action,
                               experiment_step_id, source_type, source_id, details)
  values (exp_id, new.reported_at, new.reported_by, 'deviated',
          new.what_happened, new.category, new.corrective_action,
          new.experiment_step_id, 'step_deviations', new.id::text,
          jsonb_build_object('likely_impact', new.likely_impact,
                             'how_discovered', new.how_discovered))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_timeline_step_deviation on step_deviations;
create trigger trg_timeline_step_deviation
  after insert on step_deviations
  for each row execute function project_step_deviation_to_timeline();

create or replace function project_sample_event_to_timeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare exp_id text; b_id uuid;
begin
  select b.experiment_id, b.id into exp_id, b_id
    from samples s join batches b on b.id = s.batch_id where s.id = new.sample_id;
  if exp_id is null then return new; end if;
  insert into timeline_events (experiment_id, occurred_at, actor_id, event_type, action,
                               sample_id, batch_id, source_type, source_id, details)
  values (exp_id, new.occurred_at, new.performed_by,
          case new.event_type
            when 'transfer'       then 'transferred'
            when 'reconstitution' then 'reconstituted'
            when 'measured'       then 'measured'
            when 'aliquoted'      then 'prepared'
            when 'dilution'       then 'prepared'
            when 'status_change'  then 'decision'
            else 'observed'
          end,
          new.event_type,
          new.sample_id, b_id, 'sample_events', new.id::text,
          -- The recorded vocabulary is never lost, even where it maps onto a
          -- different §10.1 type.
          jsonb_build_object('source_event_type', new.event_type) || new.details)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_timeline_sample_event on sample_events;
create trigger trg_timeline_sample_event
  after insert on sample_events
  for each row execute function project_sample_event_to_timeline();

create or replace function project_sample_measurement_to_timeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare exp_id text; b_id uuid;
begin
  select b.experiment_id, b.id into exp_id, b_id
    from samples s join batches b on b.id = s.batch_id where s.id = new.sample_id;
  if exp_id is null then return new; end if;
  insert into timeline_events (experiment_id, occurred_at, actor_id, event_type,
                               action, observation, sample_id, batch_id,
                               source_type, source_id, details)
  values (exp_id, new.measured_at, new.measured_by, 'measured',
          'Measurement recorded', nullif(btrim(coalesce(new.notes, '')), ''),
          new.sample_id, b_id, 'sample_measurements', new.id::text,
          jsonb_build_object('quantities', new.quantities))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_timeline_sample_measurement on sample_measurements;
create trigger trg_timeline_sample_measurement
  after insert on sample_measurements
  for each row execute function project_sample_measurement_to_timeline();

create or replace function project_condition_cycle_to_timeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare exp_id text; b_id uuid;
begin
  if coalesce(btrim(new.observation), '') = '' then return new; end if;
  select b.experiment_id, b.id into exp_id, b_id
    from batch_condition_programs p join batches b on b.id = p.batch_id
    where p.id = new.batch_condition_program_id;
  if exp_id is null then return new; end if;
  insert into timeline_events (experiment_id, occurred_at, actor_id, event_type,
                               action, observation, batch_id,
                               source_type, source_id, details)
  values (exp_id, coalesce(new.wet_start_at, new.created_at), new.created_by, 'checked',
          'Cycle ' || new.cycle_index, new.observation, b_id,
          'condition_program_cycles', new.id::text,
          jsonb_build_object('cycle_index', new.cycle_index))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_timeline_condition_cycle on condition_program_cycles;
create trigger trg_timeline_condition_cycle
  after insert on condition_program_cycles
  for each row execute function project_condition_cycle_to_timeline();

create or replace function project_analysis_result_to_timeline() returns trigger
language plpgsql security definer set search_path = public as $$
declare exp_id text; s_id uuid; b_id uuid;
begin
  if coalesce(btrim(new.summary), '') = '' then return new; end if;
  select b.experiment_id, s.id, b.id into exp_id, s_id, b_id
    from analysis_runs r join samples s on s.id = r.sample_id
    join batches b on b.id = s.batch_id
    where r.id = new.analysis_run_id;
  if exp_id is null then return new; end if;
  insert into timeline_events (experiment_id, occurred_at, actor_id, event_type,
                               action, observation, sample_id, batch_id,
                               source_type, source_id, details)
  values (exp_id, new.created_at, new.interpreted_by, 'analyzed',
          'Analysis result recorded', new.summary, s_id, b_id,
          'analysis_results', new.id::text,
          jsonb_build_object('result_confidence', new.result_confidence))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_timeline_analysis_result on analysis_results;
create trigger trg_timeline_analysis_result
  after insert on analysis_results
  for each row execute function project_analysis_result_to_timeline();

-- ============================================================
-- 5. Backfill.
--
-- In the same migration as the triggers, deliberately: without it the log
-- renders empty on every experiment that already exists and looks broken on
-- the day it ships. The unique index above makes this safe to re-run.
--
-- No trigger bracketing is needed -- this INSERTs into timeline_events and
-- touches `experiments` not at all, so enforce_experiment_lifecycle is not in
-- play. (CLAUDE.md's migration checklist trains you to reach for the bracket;
-- this is the case where it does not apply.)
-- ============================================================
insert into timeline_events (experiment_id, occurred_at, actor_id, event_type, observation,
                             experiment_step_id, source_type, source_id)
select es.experiment_id, o.observed_at, o.observed_by, 'observed', o.note,
       o.experiment_step_id, 'step_observations', o.id::text
from step_observations o join experiment_steps es on es.id = o.experiment_step_id
on conflict do nothing;

insert into timeline_events (experiment_id, occurred_at, actor_id, event_type,
                             action, deviation_note, next_action,
                             experiment_step_id, source_type, source_id)
select es.experiment_id, d.reported_at, d.reported_by, 'deviated',
       d.what_happened, d.category, d.corrective_action,
       d.experiment_step_id, 'step_deviations', d.id::text
from step_deviations d join experiment_steps es on es.id = d.experiment_step_id
on conflict do nothing;

insert into timeline_events (experiment_id, occurred_at, actor_id, event_type, action,
                             sample_id, batch_id, source_type, source_id)
select b.experiment_id, ev.occurred_at, ev.performed_by,
       case ev.event_type
         when 'transfer'       then 'transferred'
         when 'reconstitution' then 'reconstituted'
         when 'measured'       then 'measured'
         when 'aliquoted'      then 'prepared'
         when 'dilution'       then 'prepared'
         when 'status_change'  then 'decision'
         else 'observed'
       end,
       ev.event_type, ev.sample_id, b.id, 'sample_events', ev.id::text
from sample_events ev
  join samples s on s.id = ev.sample_id
  join batches b on b.id = s.batch_id
on conflict do nothing;

insert into timeline_events (experiment_id, occurred_at, actor_id, event_type,
                             action, observation, sample_id, batch_id, source_type, source_id)
select b.experiment_id, m.measured_at, m.measured_by, 'measured',
       'Measurement recorded', nullif(btrim(coalesce(m.notes, '')), ''),
       m.sample_id, b.id, 'sample_measurements', m.id::text
from sample_measurements m
  join samples s on s.id = m.sample_id
  join batches b on b.id = s.batch_id
on conflict do nothing;

insert into timeline_events (experiment_id, occurred_at, actor_id, event_type,
                             action, observation, batch_id, source_type, source_id)
select b.experiment_id, coalesce(c.wet_start_at, c.created_at), c.created_by, 'checked',
       'Cycle ' || c.cycle_index, c.observation, b.id,
       'condition_program_cycles', c.id::text
from condition_program_cycles c
  join batch_condition_programs p on p.id = c.batch_condition_program_id
  join batches b on b.id = p.batch_id
where coalesce(btrim(c.observation), '') <> ''
on conflict do nothing;

insert into timeline_events (experiment_id, occurred_at, actor_id, event_type,
                             action, observation, sample_id, batch_id, source_type, source_id)
select b.experiment_id, ar.created_at, ar.interpreted_by, 'analyzed',
       'Analysis result recorded', ar.summary, s.id, b.id,
       'analysis_results', ar.id::text
from analysis_results ar
  join analysis_runs r on r.id = ar.analysis_run_id
  join samples s on s.id = r.sample_id
  join batches b on b.id = s.batch_id
where coalesce(btrim(ar.summary), '') <> ''
on conflict do nothing;
