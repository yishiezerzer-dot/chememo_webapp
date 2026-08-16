-- AI Field Suggestions & AI-Assisted Resolve. See
-- ChemMemo_Feature_AIFieldSuggestions_Spec.md for the full design. Two entry
-- points share one table: a general "what's missing" scan on any experiment
-- (source = 'gap_scan'), and a targeted "Resolve with AI" next to a crew
-- unresolved item (source = 'crew_resolve', linked via unresolved_index).

-- D2 — a proper row-per-suggestion table, not another JSONB array like
-- experiment_crew_provenance.unresolved (which has no per-item identity, no
-- concurrency guard, and no audit trail — a flaw not worth repeating here).
-- D8 — v1 allowlist is narrative fields only, enforced by this CHECK
-- constraint as the single source of truth (also relied on by
-- apply_ai_suggestion() below before it builds a dynamic UPDATE).
create table experiment_ai_suggestions (
  id                uuid primary key default gen_random_uuid(),
  experiment_id     text not null references experiments(id) on delete cascade,
  workspace_id      uuid references workspaces(id),
  field             text not null check (field in (
    'scientific_question', 'hypothesis', 'rationale', 'primary_outcome',
    'secondary_outcomes', 'data_analysis_plan', 'risks_failure_modes',
    'conclusion', 'next_steps', 'observations'
  )),
  suggested_value   text not null,
  rationale         text not null,
  source            text not null check (source in ('gap_scan', 'crew_resolve')),
  unresolved_index  int,                    -- set only when source = 'crew_resolve'
  status            text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  model             text not null,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  resolved_by       uuid references auth.users(id)
);

create index experiment_ai_suggestions_experiment_idx on experiment_ai_suggestions (experiment_id);

-- T2.1's generic workspace-population trigger, already applied to
-- experiment_crew_provenance/experiment_revisions/etc. — same mechanism,
-- not a new one.
create trigger trg_workspace_experiment_ai_suggestions
  before insert on experiment_ai_suggestions
  for each row execute function set_workspace_from_experiment_id();

alter table experiment_ai_suggestions enable row level security;

-- Lab-shared read within the workspace, matching experiment_crew_provenance.
create policy experiment_ai_suggestions_read on experiment_ai_suggestions
  for select to authenticated
  using (is_workspace_member(workspace_id, auth.uid()));

-- D4 — owner-only, not merely workspace-writer: this targets scientific-
-- record content on a specific experiment, not workspace administration.
create policy experiment_ai_suggestions_insert on experiment_ai_suggestions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid())
  );

-- D3 — no client update/delete policy at all. apply_ai_suggestion() is the
-- ONLY path that can ever change status, matching
-- resolve_crew_unresolved_item()'s "one function, no client write policy"
-- convention exactly.
create or replace function apply_ai_suggestion(p_suggestion_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suggestion record;
  v_owner uuid;
begin
  select * into v_suggestion from experiment_ai_suggestions where id = p_suggestion_id;
  if v_suggestion is null then
    raise exception 'No suggestion found for id %.', p_suggestion_id
      using errcode = 'check_violation';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'Suggestion % has already been resolved.', p_suggestion_id
      using errcode = 'check_violation';
  end if;

  select owner_id into v_owner from experiments where id = v_suggestion.experiment_id;
  if v_owner is distinct from auth.uid() then
    raise exception 'Only the experiment owner may act on this suggestion.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_accept then
    -- D9 — a locked experiment (completed/reviewed/archived/failed/
    -- cancelled) already refuses this UPDATE via enforce_experiment_
    -- lifecycle()'s locked_at check; no separate lock check needed here.
    -- field is guaranteed safe as a dynamic identifier by the table's own
    -- CHECK constraint above (D7) — never trust the model's output as a
    -- column name without that guarantee.
    execute format('update experiments set %I = $1 where id = $2 and owner_id = $3', v_suggestion.field)
      using v_suggestion.suggested_value, v_suggestion.experiment_id, auth.uid();

    -- D3 — a suggestion generated to answer a specific crew unresolved item
    -- also clears that item, reusing resolve_crew_unresolved_item()'s own
    -- positional-removal logic rather than duplicating it.
    if v_suggestion.unresolved_index is not null then
      perform resolve_crew_unresolved_item(v_suggestion.experiment_id, v_suggestion.unresolved_index);
    end if;

    update experiment_ai_suggestions
    set status = 'accepted', resolved_at = now(), resolved_by = auth.uid()
    where id = p_suggestion_id;
  else
    update experiment_ai_suggestions
    set status = 'dismissed', resolved_at = now(), resolved_by = auth.uid()
    where id = p_suggestion_id;
  end if;
end;
$$;
