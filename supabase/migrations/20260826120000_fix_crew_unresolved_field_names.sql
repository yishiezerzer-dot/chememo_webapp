-- Bug fix (2026-08-17): commitCrewDraft() renamed the crew's own PlanFields
-- names to the real experiments column names ("primary_outcomes" ->
-- "primary_outcome", "risks" -> "risks_failure_modes") only when building
-- the ExperimentInput row -- it never applied the same rename to the
-- unresolved checklist items themselves. Every existing crew-authored draft
-- with one of these two unresolved items therefore has a `field` value the
-- AI_SUGGESTIBLE_FIELDS allowlist (DB-named) never matches, so "Resolve with
-- AI" silently never rendered for them. The application code is fixed
-- separately (lib/ai/crew/commit.ts) for every future draft; this backfills
-- already-stored rows so existing drafts are fixed too, without requiring
-- the scientist to redo anything.
update experiment_crew_provenance
set unresolved = (
  select jsonb_agg(
    case
      when elem->>'field' = 'primary_outcomes' then jsonb_set(elem, '{field}', '"primary_outcome"'::jsonb)
      when elem->>'field' = 'risks' then jsonb_set(elem, '{field}', '"risks_failure_modes"'::jsonb)
      else elem
    end
  )
  from jsonb_array_elements(unresolved) as elem
)
where unresolved @> '[{"field":"primary_outcomes"}]'::jsonb
   or unresolved @> '[{"field":"risks"}]'::jsonb;
