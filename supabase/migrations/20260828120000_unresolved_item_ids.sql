-- Bug fix (2026-08-18): give every crew unresolved item a stable identity.
--
-- Backstory. experiment_crew_provenance.unresolved has never had per-item
-- identity -- the AI Field Suggestions spec's own D2 flagged this ("items
-- have no identity beyond array position") but only fixed it for the
-- suggestions table, never for the items themselves. Two successive attempts
-- worked around the gap rather than closing it:
--   * migration 20260825150000 matched a suggestion to its checklist item by
--     the stored array index, and merely DETECTED the stale-index case;
--   * migration 20260827120000 (D13) switched to matching by FIELD NAME, on
--     the stated assumption that field name is "the stable identity".
--
-- That assumption is false: field name is NOT unique within the array. The
-- crew's four agents each append findings independently and nothing dedupes
-- across them, so a real draft routinely carries the same field several
-- times -- verified live on EXP-1373, which has 28 items across only 16
-- distinct fields (hypothesis x3, controls x3, replicate_kind x3).
--
-- Consequence, reproduced end-to-end on dev before writing this: clicking
-- Agree on the THIRD hypothesis item wrote the field correctly and
-- decremented the count correctly, but cleared the FIRST hypothesis item --
-- the one the scientist did not click. The item they did click stayed on the
-- checklist still demanding input. Field-name matching cannot distinguish
-- them, because both legitimately share a field.
--
-- Note the duplicates are not all noise and must NOT simply be deduped away:
-- the three `controls` items on EXP-1373 are three genuinely different
-- missing controls (LC-MS blank / instrument carryover / uncycled control),
-- each of which a scientist has to address separately.
--
-- So: mint a real uuid per item and match on that. This retires positional
-- and field-name matching for good.

-- 1. Backfill an id into every existing item that lacks one. gen_random_uuid()
--    is volatile, so it is evaluated per element rather than once per array.
update experiment_crew_provenance p
set unresolved = (
  select coalesce(
    jsonb_agg(
      case
        when elem ? 'id' then elem
        else elem || jsonb_build_object('id', gen_random_uuid()::text)
      end
      order by ord
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(p.unresolved) with ordinality as t(elem, ord)
)
where p.unresolved is not null
  and jsonb_array_length(p.unresolved) > 0;

-- 2. Suggestions now point at an item's identity, not its position.
--    unresolved_index is kept, unused, as the historical record of what the
--    old rows claimed -- dropping it would destroy the only evidence of which
--    item a pre-fix suggestion was generated against.
alter table experiment_ai_suggestions
  add column if not exists unresolved_item_id uuid;

comment on column experiment_ai_suggestions.unresolved_item_id is
  'The crew unresolved item this suggestion answers (its stable id). Null for gap_scan suggestions, which answer no specific checklist item.';

comment on column experiment_ai_suggestions.unresolved_index is
  'Superseded 2026-08-18 by unresolved_item_id; retained for historical rows only. Never read by apply_ai_suggestion().';

-- 3. Map still-pending suggestions onto the ids just minted, using the stored
--    index -- but ONLY where the item now at that index still carries the
--    suggestion's own field. The index is trustworthy evidence of intent only
--    while nothing has been resolved since the suggestion was generated; once
--    something has, every later item shifted and the index points at an
--    unrelated item. Requiring the field to agree is what distinguishes those
--    two cases, and it is the whole point of this migration not to hand a
--    suggestion the wrong item.
--
--    (Caught on dev by checking the result of an earlier version of this
--    migration against the database: it bound a risks_failure_modes
--    suggestion to a replicate_kind item, because one item had been resolved
--    between generation and backfill.)
--
--    A row that fails the check is deliberately left null: on Agree it then
--    writes its field but clears no checklist item, which is the safe
--    failure -- never clearing the wrong one.
update experiment_ai_suggestions s
set unresolved_item_id = (
  select ((p.unresolved -> s.unresolved_index) ->> 'id')::uuid
  from experiment_crew_provenance p
  where p.experiment_id = s.experiment_id
    and (p.unresolved -> s.unresolved_index) ->> 'field' = s.field
)
where s.unresolved_index is not null
  and s.unresolved_item_id is null
  and s.status = 'pending';

-- 4. Resolve by item identity. The index-based resolve_crew_unresolved_item()
--    is left in place: it is still the correct primitive for the manual
--    "Resolve" button acting on a freshly-rendered list, and other callers
--    depend on it.
create or replace function resolve_crew_unresolved_item_by_id(p_experiment_id text, p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_items jsonb;
  v_index int;
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

  select (ord - 1) into v_index
  from jsonb_array_elements(v_items) with ordinality as t(elem, ord)
  where elem->>'id' = p_item_id::text
  limit 1;

  if v_index is null then
    raise exception 'That checklist item has already been resolved.'
      using errcode = 'check_violation';
  end if;

  v_items := v_items - v_index;

  update experiment_crew_provenance
  set unresolved = v_items,
      unresolved_open_count = jsonb_array_length(v_items)
  where experiment_id = p_experiment_id;
end;
$$;

-- 5. apply_ai_suggestion(): match the checklist item by id. Replaces the
--    field-name lookup from 20260827120000 entirely.
create or replace function apply_ai_suggestion(p_suggestion_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_suggestion record;
  v_owner uuid;
  v_exists boolean;
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
    -- Refuse rather than guess if the item is gone: it was resolved by other
    -- means since this suggestion was generated, so there is nothing left for
    -- this suggestion to clear. Same "never invent" discipline as the rest of
    -- the feature.
    if v_suggestion.unresolved_item_id is not null then
      select exists (
        select 1
        from experiment_crew_provenance p,
             jsonb_array_elements(p.unresolved) as elem
        where p.experiment_id = v_suggestion.experiment_id
          and elem->>'id' = v_suggestion.unresolved_item_id::text
      ) into v_exists;

      if not v_exists then
        raise exception
          'This suggestion''s checklist item has already been resolved by other means.'
          using errcode = 'check_violation';
      end if;
    end if;

    -- D9 -- a locked experiment already refuses this UPDATE via
    -- enforce_experiment_lifecycle()'s locked_at check; no separate check
    -- needed here. field is guaranteed safe as a dynamic identifier by the
    -- table's own CHECK constraint (D7) -- never trust the model's output
    -- as a column name without that guarantee.
    execute format('update experiments set %I = $1 where id = $2 and owner_id = $3', v_suggestion.field)
      using v_suggestion.suggested_value, v_suggestion.experiment_id, auth.uid();

    if v_suggestion.unresolved_item_id is not null then
      perform resolve_crew_unresolved_item_by_id(v_suggestion.experiment_id, v_suggestion.unresolved_item_id);
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
