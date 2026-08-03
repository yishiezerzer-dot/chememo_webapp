-- T1.8 — Improved revision diff & restore.
-- See Spec: ChemMemo_Feature_RevisionDiffRestore_Spec.md (D1-D7).

-- 1. Skip no-op revisions (D1) — same scientific_changed-style diff
--    enforce_experiment_lifecycle() already uses (T1.1), extended with
--    search_vector (T1.6) the same way short_code already is.
create or replace function record_experiment_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  excluded constant text[] := array[
    'updated_at', 'short_code', 'search_vector', 'locked_at',
    'completed_at', 'completed_by', 'reviewed_at', 'reviewed_by'
  ];
begin
  if (to_jsonb(new) - excluded) is not distinct from (to_jsonb(old) - excluded) then
    return new;
  end if;
  insert into experiment_revisions (experiment_id, editor_id, snapshot)
  values (old.id, auth.uid(), to_jsonb(old));
  return new;
end;
$$;

-- 2. Restore events (D7) — extend the existing check constraint, no new table.
--    (Constraint name follows Postgres's default naming for an inline
--    column-less table check: <table>_<check-column-guess>_check; verified
--    against the real name on chememo-dev before this migration is applied.)
alter table experiment_lock_events drop constraint experiment_lock_events_event_check;
alter table experiment_lock_events add constraint experiment_lock_events_event_check
  check (event in ('lock', 'reopen', 'restore'));
