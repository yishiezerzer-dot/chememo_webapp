-- Repair for 20260828120000's backfill, which ran on chememo-dev before the
-- field-agreement check was added to it.
--
-- That backfill mapped a pending suggestion onto whichever item sat at its
-- stored unresolved_index, without checking the item still carried the
-- suggestion's field. Where anything had been resolved between the
-- suggestion's generation and the migration, every later item had shifted,
-- so the index pointed at an unrelated item -- on dev it bound a
-- risks_failure_modes suggestion to a replicate_kind item. Accepting that
-- would write the right column but clear the WRONG checklist item, which is
-- precisely the defect 20260828120000 exists to remove.
--
-- The source migration now carries the check, so an environment that has not
-- run it yet (prod) never produces these rows and this repair is a no-op
-- there. Idempotent and safe to re-run.
--
-- Unbinding rather than re-mapping is deliberate: once the index is known to
-- be stale there is no evidence left of which item the suggestion was
-- actually generated for, and guessing is the thing being fixed. An unbound
-- suggestion still writes its field on Agree; it just clears no checklist
-- item, leaving the scientist to tick the right one.
update experiment_ai_suggestions s
set unresolved_item_id = null
where s.status = 'pending'
  and s.unresolved_item_id is not null
  and not exists (
    select 1
    from experiment_crew_provenance p,
         jsonb_array_elements(p.unresolved) as elem
    where p.experiment_id = s.experiment_id
      and elem->>'id' = s.unresolved_item_id::text
      and elem->>'field' = s.field
  );
