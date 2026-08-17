-- Bug fix (2026-08-17): apply_ai_suggestion() trusted the suggestion's
-- stored unresolved_index (a snapshot from generation time) to locate the
-- checklist item to clear. If an EARLIER item in the array was resolved by
-- any means since the suggestion was generated, every later item shifts
-- position -- the previous guard (migration 20260825150000) only detected
-- this and refused with an error; it never actually recovered. Worse, the
-- CLIENT display had the same positional assumption (app/(app)/experiments/
-- [id]/page.tsx's resolveSuggestionsByIndex, now resolveSuggestionsByField),
-- so a suggestion could visibly render attached to the WRONG checklist item
-- before the guard ever fired -- reported by Yishi as "resolves with AI but
-- the thing that needs input doesn't go down."
--
-- Fixed by searching for the item's CURRENT position by field name instead
-- of trusting the stored index at all. Field name is the stable identity
-- (D12's same-day fix made every unresolved item's field DB-named and
-- canonical); array position never was. If no unresolved item with that
-- field remains, it was already resolved by other means -- refuse clearly
-- rather than guess, same "never invent" discipline as everywhere else in
-- this feature.
create or replace function apply_ai_suggestion(p_suggestion_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suggestion record;
  v_owner uuid;
  v_current_index int;
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
      select (ord - 1) into v_current_index
      from experiment_crew_provenance, jsonb_array_elements(unresolved) with ordinality as t(elem, ord)
      where experiment_id = v_suggestion.experiment_id
        and elem->>'field' = v_suggestion.field
      order by ord
      limit 1;

      if v_current_index is null then
        raise exception
          'This suggestion''s checklist item has already been resolved by other means.'
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
      perform resolve_crew_unresolved_item(v_suggestion.experiment_id, v_current_index);
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
