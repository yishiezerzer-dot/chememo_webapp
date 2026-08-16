-- apply_ai_suggestion() correctness fix: unresolved_index is a POSITION in
-- experiment_crew_provenance.unresolved, the same fragility already known
-- about that array (see the spec's D2). If another item is resolved after
-- a crew_resolve suggestion is generated, every later item shifts position
-- -- applying a stale suggestion could silently resolve the WRONG checklist
-- item. Guard by re-checking the field at that position still matches what
-- the suggestion was generated for; refuse rather than guess.
create or replace function apply_ai_suggestion(p_suggestion_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suggestion record;
  v_owner uuid;
  v_current_field text;
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
    if v_suggestion.unresolved_index is not null then
      select unresolved -> v_suggestion.unresolved_index ->> 'field'
        into v_current_field
        from experiment_crew_provenance
        where experiment_id = v_suggestion.experiment_id;

      if v_current_field is distinct from v_suggestion.field then
        raise exception
          'This suggestion no longer matches its checklist item (the list changed since it was generated). Regenerate it and try again.'
          using errcode = 'check_violation';
      end if;
    end if;

    -- D9 — a locked experiment already refuses this UPDATE via
    -- enforce_experiment_lifecycle()'s locked_at check; no separate check
    -- needed here. field is guaranteed safe as a dynamic identifier by the
    -- table's own CHECK constraint (D7) -- never trust the model's output
    -- as a column name without that guarantee.
    execute format('update experiments set %I = $1 where id = $2 and owner_id = $3', v_suggestion.field)
      using v_suggestion.suggested_value, v_suggestion.experiment_id, auth.uid();

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
