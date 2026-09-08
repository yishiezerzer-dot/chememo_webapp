-- Remove the twelve planning-narrative columns.
--
-- WHY, plainly: nine of the fourteen narrative fields were never displayed
-- anywhere in the app except the markdown export, and one
-- (data_analysis_plan) was not even in that. They sat as seventeen textareas
-- ABOVE the only required field on the creation form -- the single biggest
-- reason the owner of this notebook got lost starting an experiment in it.
--
-- They cost nothing to remove. The evidence-chunk trigger (20260818120000)
-- indexes name, date, researcher, project, observations and notes, and
-- nothing else; keyless search only ilikes observations and notes. So
-- retrieval quality is unaffected -- verified before writing this, not assumed.
--
-- THIS IS A DELIBERATE DEVIATION FROM THE LAB'S OWN STANDARD, taken with the
-- owner's explicit decision, and it is recorded in the vault rather than left
-- to be discovered. Standard §8.1 is the only unhedged "every experiment
-- begins with" in the planning chapter and lists all eighteen sections;
-- crosswalk decision C2 created exactly these columns and named the field
-- names themselves "the durable export contract". Against that: the overhaul
-- closes gap G3 (the execution log, §10) which had been open since the
-- beginning, so the app moves closer to the standard overall, not further.
--
-- KEPT, and not narrative at all despite looking it:
--   acceptance_criteria -- §8.6's start gate, immutable once locked (G8)
--   conclusion          -- §15.2's completion gate
--   observations, notes -- the log's ancestors: in the search vector, in the
--                          evidence trigger, in keyless ilike, and in the CSV
--                          import/export column set. They cut over to
--                          read-only once the log has entries; that is a
--                          later change, not this one.
--
-- next_steps is dropped rather than kept: §8.1 does not list it, and §10.1's
-- own "Next action" column plus experiment_tasks now cover it properly.

-- ============================================================
-- 1. The search-vector function FIRST, and in this file.
--
-- It references scientific_question and hypothesis. A plpgsql body is not
-- validated until it executes, so dropping those columns while this function
-- still names them would let `db push` report success and then raise on the
-- FIRST WRITE TO ANY EXPERIMENT. That is the sharpest landmine in this
-- change, and it is defused here rather than discovered in production.
--
-- acceptance_criteria joins the C-weight bucket: it survives, it is real
-- scientific content, and it was never indexed.
-- ============================================================
create or replace function experiments_update_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english',
      coalesce(new.id, '') || ' ' ||
      coalesce(case when new.id ~ '^EXP-\d+$' then 'E' || lpad(substring(new.id from 5), 3, '0') else new.id end, '') || ' ' ||
      coalesce(new.name, '')
    ), 'A') ||
    setweight(to_tsvector('english',
      coalesce(new.researcher, '') || ' ' || coalesce(new.reaction_type, '') || ' ' ||
      array_to_string(coalesce(new.compounds, '{}'), ' ') || ' ' ||
      array_to_string(coalesce(new.metals, '{}'), ' ') || ' ' ||
      array_to_string(coalesce(new.methods, '{}'), ' ')
    ), 'B') ||
    setweight(jsonb_to_tsvector('english', coalesce(new.sample_matrix, '[]'::jsonb), '["string"]'), 'B') ||
    setweight(to_tsvector('english',
      coalesce(new.observations, '') || ' ' || coalesce(new.notes, '') || ' ' ||
      coalesce(new.conclusion, '') || ' ' || coalesce(new.acceptance_criteria, '')
    ), 'C');
  return new;
end;
$$;

-- ============================================================
-- 2. Suggestion rows naming a doomed field, BEFORE the CHECK is swapped.
--
-- The ALTER would abort on existing rows otherwise, and `db push` is not
-- transactional across files -- an abort here would leave a half-changed
-- schema behind.
--
-- This deletes accepted-suggestion audit rows as well as pending ones, and
-- that is correct rather than regrettable: apply_ai_suggestion wrote those
-- values into columns that are themselves being dropped, so the trail they
-- belonged to is going away regardless. An archive table is not worth it --
-- every public table needs an RLS decision, and this one would have no reader.
-- ============================================================
delete from experiment_ai_suggestions where field in (
  'scientific_question', 'hypothesis', 'rationale', 'primary_outcome',
  'secondary_outcomes', 'data_analysis_plan', 'risks_failure_modes', 'next_steps'
);

alter table experiment_ai_suggestions drop constraint if exists experiment_ai_suggestions_field_check;
alter table experiment_ai_suggestions add constraint experiment_ai_suggestions_field_check
  check (field in ('acceptance_criteria', 'conclusion', 'observations', 'notes'));

-- acceptance_criteria is a NEW member of that allowlist and needs a guard the
-- others do not. apply_ai_suggestion builds a dynamic UPDATE, so accepting a
-- suggestion for it on an already-started experiment would hit branch (d)'s
-- immutability check and surface a raw Postgres error to the user. Refuse it
-- in a sentence a person wrote instead. The CHECK above stays the single
-- source of truth for the dynamic identifier itself.
create or replace function guard_locked_acceptance_criteria() returns trigger
language plpgsql as $$
begin
  -- Fires on insert as well as on accept. Catching it at accept-time would be
  -- too late to be useful: apply_ai_suggestion updates `experiments` before it
  -- touches this row, so the locked-column write would already have raised a
  -- raw Postgres error. Refusing at insert means the pointless suggestion is
  -- never generated in the first place.
  if new.field = 'acceptance_criteria'
     and exists (
       select 1 from experiments e
       where e.id = new.experiment_id and e.acceptance_criteria_locked_at is not null
     ) then
    raise exception 'Acceptance criteria were locked when this experiment started and cannot be changed (standard section 8.6).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ai_suggestions_guard_locked_criteria on experiment_ai_suggestions;
create trigger ai_suggestions_guard_locked_criteria
  before insert or update on experiment_ai_suggestions
  for each row execute function guard_locked_acceptance_criteria();

-- ============================================================
-- 3. Crew checklist items pointing at doomed fields.
--
-- unresolved_open_count gates the Start button (lifecycle-controls.tsx, and
-- branch (g) of the lifecycle trigger). An orphaned item naming a column that
-- no longer exists could never be resolved, so it would PERMANENTLY BLOCK
-- STARTING those experiments.
--
-- Note this UPDATEs experiment_crew_provenance, NOT experiments, so
-- enforce_experiment_lifecycle is not in play and no trigger bracketing is
-- needed here. CLAUDE.md's migration checklist trains you to reach for the
-- bracket; this is the case where it does not apply.
-- ============================================================
update experiment_crew_provenance
set unresolved = coalesce((
      select jsonb_agg(item)
      from jsonb_array_elements(unresolved) item
      where item ->> 'field' is null
         or item ->> 'field' not in (
              'scientific_question', 'hypothesis', 'rationale', 'primary_outcome',
              'secondary_outcomes', 'data_analysis_plan', 'risks_failure_modes', 'next_steps'
            )
    ), '[]'::jsonb)
where jsonb_typeof(unresolved) = 'array';

-- Recounted in its own statement, reading the column the statement above just
-- wrote, so the count can never disagree with the list it counts.
update experiment_crew_provenance
set unresolved_open_count = (
      select count(*) from jsonb_array_elements(unresolved) i
      where coalesce((i ->> 'resolved')::boolean, false) = false
    )
where jsonb_typeof(unresolved) = 'array';

-- ============================================================
-- 4. Template defaults and required_fields naming doomed columns.
--
-- buildCommitInput marks any still-empty required field "TBD"; a required
-- field that cannot exist would sit TBD forever against a frozen (and
-- therefore un-editable) version. The migration connection bypasses the
-- `frozen_at is null` update policy, which is correct here and noted so it
-- does not read as an oversight.
-- ============================================================
update experiment_template_versions
set defaults = defaults
      - 'scientific_question' - 'rationale' - 'hypothesis' - 'primary_outcome'
      - 'secondary_outcomes' - 'data_analysis_plan' - 'risks_failure_modes'
      - 'next_steps' - 'independent_variables' - 'controlled_variables'
      - 'planned_analyses' - 'sample_storage_plan',
    required_fields = coalesce((
      select array_agg(f) from unnest(required_fields) f
      where f not in (
        'scientific_question', 'rationale', 'hypothesis', 'primary_outcome',
        'secondary_outcomes', 'data_analysis_plan', 'risks_failure_modes',
        'next_steps', 'independent_variables', 'controlled_variables',
        'planned_analyses', 'sample_storage_plan'
      )
    ), '{}');

-- ============================================================
-- 5. The columns.
--
-- Plain drop, never cascade: there are no dependent views today, and cascade
-- would silently drop one if somebody adds it later.
-- ============================================================
alter table experiments drop column scientific_question;
alter table experiments drop column rationale;
alter table experiments drop column hypothesis;
alter table experiments drop column primary_outcome;
alter table experiments drop column secondary_outcomes;
alter table experiments drop column data_analysis_plan;
alter table experiments drop column risks_failure_modes;
alter table experiments drop column next_steps;
alter table experiments drop column independent_variables;
alter table experiments drop column controlled_variables;
alter table experiments drop column planned_analyses;
alter table experiments drop column sample_storage_plan;

-- ============================================================
-- 6. Rebuild the search vectors, so the dropped text stops being findable.
--
-- Same trigger-bracketing dance 20260805120000 used for the original
-- backfill, and for the same two reasons: search_vector is not in
-- enforce_experiment_lifecycle's exclusion list so every locked record would
-- reject the write, and record_experiment_revision would log a revision for a
-- column no human edited.
-- ============================================================
-- Conditional, not a bare ALTER: chememo-dev turned out NOT to have
-- experiments_enqueue_index_job even though 20260725120000 creates it, so a
-- plain `disable trigger` aborted this whole migration. That is real schema
-- drift between the migration history and a live database -- the same class
-- of thing that desynced production's bookkeeping on 2026-08-09 -- and a
-- migration that has to run against three databases should not assume which
-- triggers each one actually has.
do $$
declare t text;
begin
  foreach t in array array[
    'experiments_enforce_lifecycle',
    'experiments_record_revision',
    'experiments_enqueue_index_job'
  ] loop
    if exists (
      select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
      where g.tgname = t and c.relname = 'experiments' and not g.tgisinternal
    ) then
      execute format('alter table experiments disable trigger %I', t);
    end if;
  end loop;

  update experiments set updated_at = updated_at;

  foreach t in array array[
    'experiments_enforce_lifecycle',
    'experiments_record_revision',
    'experiments_enqueue_index_job'
  ] loop
    if exists (
      select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
      where g.tgname = t and c.relname = 'experiments' and not g.tgisinternal
    ) then
      execute format('alter table experiments enable trigger %I', t);
    end if;
  end loop;
end $$;
