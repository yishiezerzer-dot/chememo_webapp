-- T3.8 — Crew-authored draft experiments. Gives T3.7's planning crew a
-- write path: a scientist-initiated "Create draft experiment" click turns a
-- CrewDraft into a real experiment at status = 'draft', with its raw source
-- and open questions attached via a provenance row. See
-- ChemMemo_Feature_CrewAuthoredDrafts_Spec.md (revalidated 2026-08-10) for
-- the full design; key corrections from the original 2026-07-29 draft:
-- RLS follows T2.1's workspace-scoped pattern (shipped after this spec was
-- written), not the pre-T2.1 experiment_revisions shape it originally cited.

-- D8 — one table for both the §19.1 raw-source/unresolved/normalization
-- record and the T3.4 telemetry (crew version, prompt versions, model).
-- raw_source is not null: a crew-created record without its source note is
-- not §19.1-compliant, and the constraint makes that unrepresentable.
-- on delete cascade: deleting a rejected draft (D2, T1.1 D12) takes the
-- provenance with it and leaves nothing behind.
create table experiment_crew_provenance (
  experiment_id         text primary key references experiments(id) on delete cascade,
  workspace_id          uuid references workspaces(id),
  raw_source            text not null,
  unresolved            jsonb not null,
  unresolved_open_count int  not null,
  normalization         jsonb not null,
  crew_version          text not null,
  prompt_versions       jsonb not null,
  model                 text not null,
  created_by            uuid references auth.users(id),
  created_at            timestamptz not null default now()
);

-- T2.1's generic workspace-population trigger, already applied to
-- experiment_revisions/experiment_lock_events/ai_summaries etc. — same
-- pattern, not a new mechanism.
create trigger trg_workspace_experiment_crew_provenance
  before insert on experiment_crew_provenance
  for each row execute function set_workspace_from_experiment_id();

alter table experiment_crew_provenance enable row level security;

-- Lab-shared read within the workspace, matching every other provenance-style
-- table post-T2.1 (experiment_revisions, experiment_lock_events).
create policy experiment_crew_provenance_read on experiment_crew_provenance
  for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));

-- D6 — created by the requesting user, under their own session; no service
-- role anywhere in this path. Insert only, matching D5/D8's "no client
-- updates" — the ONLY path that can ever change unresolved_open_count is
-- resolve_crew_unresolved_item() below (security definer), so raw_source,
-- crew_version, prompt_versions, and model stay genuinely immutable from any
-- client-reachable path, not just by convention.
create policy experiment_crew_provenance_insert on experiment_crew_provenance
  for insert to authenticated
  with check (created_by = auth.uid() and is_workspace_writer(workspace_id, auth.uid()));

-- D4 — a crew-authored draft cannot advance while its §19.1 unresolved block
-- still has open items. This modifies the shipped enforce_experiment_lifecycle
-- trigger (migration 20260730120000) — full body reproduced with branch (g)
-- added, since a plpgsql function can only be replaced whole. Branches (a)-(f)
-- are unchanged from the original.
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

  -- (g) T3.8 — a crew-authored draft may not advance while its §19.1
  --     unresolved block still has open items. Hand-authored experiments have
  --     no provenance row, so this branch never fires for them.
  if new.status is distinct from old.status
     and old.status = 'draft'
     and exists (
       select 1 from experiment_crew_provenance p
       where p.experiment_id = old.id and p.unresolved_open_count > 0
     ) then
    raise exception
      'Experiment % has unresolved items from its AI-generated plan. Resolve them before starting.',
      old.id
      using errcode = 'check_violation';
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

-- The trigger itself (experiments_enforce_lifecycle) already points at this
-- function by name — create or replace above is enough, no re-creation needed.

-- Resolving an unresolved item is the ONLY way unresolved/unresolved_open_count
-- ever change after creation (D4, D8) — security definer so it can update
-- despite no client-facing UPDATE policy on the table; auth.uid() is checked
-- explicitly so it still only works for the experiment's owner.
create or replace function resolve_crew_unresolved_item(p_experiment_id text, p_item_index int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_items jsonb;
begin
  select owner_id into v_owner from experiments where id = p_experiment_id;
  if v_owner is distinct from auth.uid() then
    raise exception 'Only the experiment owner may resolve this item.'
      using errcode = 'insufficient_privilege';
  end if;

  select unresolved into v_items from experiment_crew_provenance where experiment_id = p_experiment_id;
  if v_items is null then
    raise exception 'No crew provenance found for experiment %.', p_experiment_id
      using errcode = 'check_violation';
  end if;

  v_items := v_items - p_item_index;

  update experiment_crew_provenance
  set unresolved = v_items,
      unresolved_open_count = jsonb_array_length(v_items)
  where experiment_id = p_experiment_id;
end;
$$;
