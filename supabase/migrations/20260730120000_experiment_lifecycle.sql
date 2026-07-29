-- T1.1 — Experiment lifecycle & completion.
-- Adds the experiment status state machine, the completion lock, the §8.1
-- narrative subset assigned here by C2, and seeds the six §23 controlled
-- vocabularies (G11). See Specs/ChemMemo_Feature_ExperimentLifecycle_Spec.md
-- for the decisions (D1-D12) this migration implements.

-- ---------------------------------------------------------------------------
-- 1. Controlled vocabularies (G11) — reference data, seeded verbatim from
--    standard §23. Values are not consumed by any column until T2.2/T2.3/T2.5.
-- ---------------------------------------------------------------------------
create table controlled_vocabularies (
  vocabulary       text    not null,
  value            text    not null,
  sort_order       int     not null,
  standard_section text    not null,
  active           boolean not null default true,
  primary key (vocabulary, value)
);

alter table controlled_vocabularies enable row level security;

-- Reference data: everyone authenticated reads; no client writes.
create policy controlled_vocabularies_read on controlled_vocabularies
  for select to authenticated using (true);

insert into controlled_vocabularies (vocabulary, value, sort_order, standard_section) values
  ('sample_type', 'sample', 1, '23.1'),
  ('sample_type', 'fresh_control', 2, '23.1'),
  ('sample_type', 'heated_monomer_control', 3, '23.1'),
  ('sample_type', 'dry_monomer_control', 4, '23.1'),
  ('sample_type', 'solvent_blank', 5, '23.1'),
  ('sample_type', 'process_blank', 6, '23.1'),
  ('sample_type', 'positive_control', 7, '23.1'),
  ('sample_type', 'negative_control', 8, '23.1'),
  ('sample_type', 'reference_standard', 9, '23.1'),
  ('sample_type', 'pooled_qc', 10, '23.1'),
  ('sample_type', 'instrument_blank', 11, '23.1'),

  ('reaction_mode', 'dry_down', 1, '23.2'),
  ('reaction_mode', 'wet_dry_cycling', 2, '23.2'),
  ('reaction_mode', 'solution_incubation', 3, '23.2'),
  ('reaction_mode', 'lyophilization', 4, '23.2'),
  ('reaction_mode', 'centrivap_drying', 5, '23.2'),
  ('reaction_mode', 'irradiation_dry', 6, '23.2'),
  ('reaction_mode', 'irradiation_solution', 7, '23.2'),
  ('reaction_mode', 'plasma_treatment', 8, '23.2'),
  ('reaction_mode', 'hydrolysis', 9, '23.2'),
  ('reaction_mode', 'functional_assay', 10, '23.2'),

  ('sample_status', 'planned', 1, '23.3'),
  ('sample_status', 'labeled', 2, '23.3'),
  ('sample_status', 'prepared', 3, '23.3'),
  ('sample_status', 'running', 4, '23.3'),
  ('sample_status', 'completed', 5, '23.3'),
  ('sample_status', 'stored', 6, '23.3'),
  ('sample_status', 'partially_consumed', 7, '23.3'),
  ('sample_status', 'consumed', 8, '23.3'),
  ('sample_status', 'failed', 9, '23.3'),
  ('sample_status', 'cancelled', 10, '23.3'),
  ('sample_status', 'lost', 11, '23.3'),
  ('sample_status', 'disposed', 12, '23.3'),

  ('analysis_status', 'planned', 1, '23.4'),
  ('analysis_status', 'queued', 2, '23.4'),
  ('analysis_status', 'running', 3, '23.4'),
  ('analysis_status', 'acquired', 4, '23.4'),
  ('analysis_status', 'processing', 5, '23.4'),
  ('analysis_status', 'interpreted', 6, '23.4'),
  ('analysis_status', 'completed', 7, '23.4'),
  ('analysis_status', 'failed', 8, '23.4'),
  ('analysis_status', 'reanalysis_required', 9, '23.4'),

  ('solubility_status', 'fully_dissolved', 1, '23.5'),
  ('solubility_status', 'dissolved_after_vortex', 2, '23.5'),
  ('solubility_status', 'dissolved_after_sonication', 3, '23.5'),
  ('solubility_status', 'dissolved_after_heat', 4, '23.5'),
  ('solubility_status', 'partially_dissolved', 5, '23.5'),
  ('solubility_status', 'mostly_insoluble', 6, '23.5'),
  ('solubility_status', 'precipitated_after_dilution', 7, '23.5'),
  ('solubility_status', 'unknown', 8, '23.5'),

  ('result_confidence', 'confirmed', 1, '23.6'),
  ('result_confidence', 'probable', 2, '23.6'),
  ('result_confidence', 'tentative', 3, '23.6'),
  ('result_confidence', 'preliminary', 4, '23.6'),
  ('result_confidence', 'unknown', 5, '23.6'),
  ('result_confidence', 'uninterpretable', 6, '23.6');

-- ---------------------------------------------------------------------------
-- 2. Status type and columns
-- ---------------------------------------------------------------------------
create type experiment_status as enum (
  'draft', 'planned', 'in_progress', 'paused',
  'completed', 'reviewed', 'archived', 'failed', 'cancelled'
);

alter table experiments
  -- Lifecycle. Nullable on purpose (D2): existing rows keep null = "not recorded".
  add column status         experiment_status,
  add column locked_at      timestamptz,
  add column completed_by   uuid references auth.users(id),
  add column reviewed_by    uuid references auth.users(id),

  -- §3.2 / §3.5 planned-actual pairs. `planned_` prefix = planned, bare = actual (D9).
  add column planned_start_at timestamptz,
  add column started_at       timestamptz,
  add column planned_end_at   timestamptz,
  add column completed_at     timestamptz,
  add column reviewed_at      timestamptz,

  -- §8.1 narrative sections assigned here by C2 (D7).
  add column scientific_question text,
  add column rationale           text,
  add column hypothesis          text,
  add column primary_outcome     text,
  add column secondary_outcomes  text,
  add column data_analysis_plan  text,
  add column risks_failure_modes text,
  add column conclusion          text,
  add column next_steps          text,

  -- §8.6, with its own earlier lock (D6).
  add column acceptance_criteria           text,
  add column acceptance_criteria_locked_at timestamptz,

  -- §6.2 vial-label prefix; batch is segment 2 of the T2.3 sample code (C3 / D8).
  add column short_code text generated always as (
    case when id ~ '^EXP-\d+$'
         then 'E' || lpad(substring(id from 5), 3, '0')
         else id end
  ) stored;

create index experiments_status_idx on experiments(status);

-- ---------------------------------------------------------------------------
-- 3. Lock events (D5)
-- ---------------------------------------------------------------------------
create table experiment_lock_events (
  id            uuid primary key default gen_random_uuid(),
  experiment_id text not null references experiments(id) on delete cascade,
  event         text not null check (event in ('lock', 'reopen')),
  reason        text not null,
  actor_id      uuid references auth.users(id),
  created_at    timestamptz not null default now()
);

create index experiment_lock_events_exp_idx
  on experiment_lock_events (experiment_id, created_at desc);

alter table experiment_lock_events enable row level security;

create policy experiment_lock_events_read on experiment_lock_events
  for select to authenticated using (true);

-- Written by the reopen/complete actions, running as the experiment's owner.
create policy experiment_lock_events_insert on experiment_lock_events
  for insert to authenticated with check (
    actor_id = auth.uid()
    and exists (
      select 1 from experiments e
      where e.id = experiment_id and e.owner_id = auth.uid()
    )
  );

-- No update or delete policy: the log is append-only (§10.2).

-- ---------------------------------------------------------------------------
-- 4. The lifecycle trigger (D4, D6)
-- ---------------------------------------------------------------------------
create or replace function enforce_experiment_lifecycle()
returns trigger
language plpgsql
as $$
declare
  locked_states constant experiment_status[] :=
    array['completed', 'reviewed', 'archived', 'failed', 'cancelled']::experiment_status[];
  scientific_changed boolean;
  allowed boolean;
begin
  -- short_code is excluded too: it's a GENERATED ALWAYS ... STORED column,
  -- and Postgres shows generated columns as not-yet-recomputed in NEW inside
  -- a BEFORE trigger (they're only materialized after the trigger returns),
  -- while OLD already has the real value -- so without this exclusion every
  -- update to an already-locked record would spuriously look like a
  -- scientific change and get rejected, breaking review/reopen/archive.
  scientific_changed :=
    (to_jsonb(new) - 'status' - 'locked_at' - 'updated_at' - 'reviewed_at' - 'reviewed_by' - 'short_code')
    is distinct from
    (to_jsonb(old) - 'status' - 'locked_at' - 'updated_at' - 'reviewed_at' - 'reviewed_by' - 'short_code');

  -- (a) A locked record accepts no scientific change, including soft delete.
  if old.locked_at is not null and scientific_changed then
    raise exception
      'Experiment % is locked (status %). Reopen it with a documented reason before editing.',
      old.id, old.status
      using errcode = 'check_violation';
  end if;

  -- (a2) D12 — archive, don't delete. A record is soft-deletable only while it
  --      is still a draft. Anything that reached `planned` is part of the
  --      scientific record, and a legacy null-status row is a real historical
  --      record, so both are archive-only.
  if new.deleted_at is not null and old.deleted_at is null
     and old.status is distinct from 'draft' then
    raise exception
      'Experiment % has left draft and cannot be deleted. Close it out and archive it instead.',
      old.id
      using errcode = 'check_violation';
  end if;

  -- (b) Legal transitions. A null old.status is a first classification: anything goes.
  if new.status is distinct from old.status and old.status is not null then
    allowed := case old.status
      when 'draft'       then new.status in ('planned', 'in_progress', 'cancelled')
      when 'planned'     then new.status in ('draft', 'in_progress', 'cancelled')
      when 'in_progress' then new.status in ('paused', 'completed', 'failed')
      when 'paused'      then new.status in ('in_progress', 'failed', 'cancelled')
      when 'completed'   then new.status in ('reviewed', 'archived', 'in_progress')
      when 'reviewed'    then new.status in ('archived', 'in_progress')
      when 'archived'    then new.status = 'in_progress'
      -- D12: archive is reachable from every terminal state, so a closed-out
      -- record always records *how* it ended rather than just disappearing.
      when 'failed'      then new.status in ('archived', 'in_progress')
      when 'cancelled'   then new.status in ('archived', 'in_progress', 'draft')
    end;
    if not coalesce(allowed, false) then
      raise exception 'Invalid status transition % to % for experiment %.',
        old.status, new.status, old.id
        using errcode = 'check_violation';
    end if;
  end if;

  -- (c) Leaving a locked state must clear the lock.
  if old.locked_at is not null
     and new.status <> all(locked_states)
     and new.locked_at is not null then
    raise exception 'Reopening experiment % must clear locked_at.', old.id
      using errcode = 'check_violation';
  end if;

  -- (d) §8.6 — acceptance criteria are required to start, and lock on starting.
  if new.status = 'in_progress' and old.status is distinct from 'in_progress'
     and new.acceptance_criteria_locked_at is null then
    if coalesce(btrim(new.acceptance_criteria), '') = '' then
      raise exception
        'Acceptance criteria must be written before an experiment starts (standard section 8.6).'
        using errcode = 'check_violation';
    end if;
    new.acceptance_criteria_locked_at := now();
  end if;

  -- Once locked they never change again, reopen included.
  if old.acceptance_criteria_locked_at is not null
     and new.acceptance_criteria is distinct from old.acceptance_criteria then
    raise exception
      'Acceptance criteria were locked at % and cannot be edited (standard section 8.6).',
      old.acceptance_criteria_locked_at
      using errcode = 'check_violation';
  end if;

  -- (e) §15.2 — a conclusion is required to complete.
  if new.status = 'completed' and old.status is distinct from 'completed'
     and coalesce(btrim(new.conclusion), '') = '' then
    raise exception
      'A conclusion is required before completing an experiment (standard section 15.2).'
      using errcode = 'check_violation';
  end if;

  -- (f) Stamp actuals on entry. coalesce() so an explicitly supplied
  --     backdated value (a record written up after the fact) is preserved.
  if new.status = 'in_progress' and old.status is distinct from 'in_progress' then
    new.started_at := coalesce(new.started_at, now());
  end if;

  if new.status = any(locked_states)
     and (old.status is null or old.status <> all(locked_states)) then
    new.locked_at := coalesce(new.locked_at, now());
    if new.status = 'completed' then
      new.completed_at := coalesce(new.completed_at, now());
      new.completed_by := coalesce(new.completed_by, auth.uid());
    end if;
  end if;

  if new.status = 'reviewed' and old.status is distinct from 'reviewed' then
    new.reviewed_at := coalesce(new.reviewed_at, now());
    new.reviewed_by := coalesce(new.reviewed_by, auth.uid());
  end if;

  return new;
end;
$$;

create trigger experiments_enforce_lifecycle
  before update on experiments
  for each row execute function enforce_experiment_lifecycle();

-- ---------------------------------------------------------------------------
-- 5. reopen_experiment(id, reason) — D5. Wraps the reopen update and the
--    lock-event insert in one transaction (a single SQL function call is
--    atomic), so a reason row can never be written without the matching
--    unlock or vice versa. `security invoker` so RLS still applies: the
--    UPDATE only affects a row the caller owns, and the INSERT still
--    requires actor_id = auth.uid() via experiment_lock_events_insert.
-- ---------------------------------------------------------------------------
create or replace function reopen_experiment(p_id text, p_reason text)
returns void
language plpgsql
security invoker
as $$
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required to reopen an experiment.'
      using errcode = 'check_violation';
  end if;

  update experiments
  set status = 'in_progress', locked_at = null
  where id = p_id;

  if not found then
    raise exception 'Experiment % not found or not permitted.', p_id
      using errcode = 'check_violation';
  end if;

  insert into experiment_lock_events (experiment_id, event, reason, actor_id)
  values (p_id, 'reopen', p_reason, auth.uid());
end;
$$;

grant execute on function reopen_experiment(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. archive_experiment(id, ended_as?) — D12's close-out action. A record not
--    yet terminal needs two status moves (e.g. in_progress -> failed ->
--    archived); wrapped in one function for the same atomicity reason as
--    reopen_experiment (a client-side pair of .update() calls could leave the
--    record stuck mid-close-out if the second call failed). `security
--    invoker` so RLS/the lifecycle trigger still gate both writes — the
--    trigger is what actually enforces the conclusion-required and
--    legal-transition rules; this function only supplies the missing
--    intermediate status when the record isn't terminal yet.
-- ---------------------------------------------------------------------------
create or replace function archive_experiment(p_id text, p_ended_as text default null)
returns void
language plpgsql
security invoker
as $$
declare
  current_status experiment_status;
  locked_states constant experiment_status[] :=
    array['completed', 'reviewed', 'archived', 'failed', 'cancelled']::experiment_status[];
begin
  select status into current_status from experiments where id = p_id;

  if not found then
    raise exception 'Experiment % not found or not permitted.', p_id
      using errcode = 'check_violation';
  end if;

  if current_status is null or current_status <> all(locked_states) then
    if p_ended_as is null or p_ended_as not in ('completed', 'failed', 'cancelled') then
      raise exception
        'How the experiment ended (completed, failed, or cancelled) is required to close it out.'
        using errcode = 'check_violation';
    end if;
    update experiments set status = p_ended_as::experiment_status where id = p_id;
  end if;

  update experiments set status = 'archived' where id = p_id;
end;
$$;

grant execute on function archive_experiment(text, text) to authenticated;
