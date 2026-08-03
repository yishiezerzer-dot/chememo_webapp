-- T1.6 — Server-side experiment search & pagination.
-- See Spec: ChemMemo_Feature_ServerSideSearch_Spec.md (D1-D7).
--
-- Every statement below is idempotent (IF NOT EXISTS / DROP-then-CREATE):
-- applying this migration hit two real issues along the way (a generated
-- column referencing another generated column; then a generated column
-- using a STABLE, not IMMUTABLE, tsvector expression) and the tool used to
-- apply it runs statements independently rather than in one transaction, so
-- earlier failed attempts left some objects already created. Idempotency
-- makes re-running this file safe regardless of that partial history.

-- 1. Full-text search column (D1). jsonb_to_tsvector over sample_matrix
--    indexes every stored legacy_code/vial_label/sample_id string for free --
--    satisfies §4.1-§4.3 without a separate mechanism.
--
--    NOT a generated column: to_tsvector/jsonb_to_tsvector with an explicit
--    regconfig are STABLE, not IMMUTABLE (a dictionary backing 'english' can
--    be altered), and Postgres requires GENERATED ALWAYS ... STORED
--    expressions to be immutable -- maintained by a trigger instead, the
--    standard idiom for tsvector columns.
alter table experiments add column if not exists search_vector tsvector;

create or replace function experiments_update_search_vector()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english',
      coalesce(new.id, '') || ' ' ||
      -- short_code's own expression (T1.1), inlined: it's a generated column
      -- and can't be referenced directly even from a plain trigger read of
      -- NEW, since NEW.short_code isn't materialized yet inside this trigger.
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
      coalesce(new.scientific_question, '') || ' ' || coalesce(new.hypothesis, '') || ' ' || coalesce(new.conclusion, '')
    ), 'C');
  return new;
end;
$$;

drop trigger if exists experiments_search_vector_trigger on experiments;
create trigger experiments_search_vector_trigger
  before insert or update on experiments
  for each row
  execute function experiments_update_search_vector();

create index if not exists experiments_search_vector_idx on experiments using gin (search_vector);

-- Backfill existing rows. Temporarily disabled: the lifecycle lock trigger
-- (T1.1) would otherwise reject this on every already-completed/reviewed/
-- archived/failed/cancelled experiment (search_vector isn't in its
-- "excluded from scientific-change diff" list, same reason short_code is),
-- and the revision-audit trigger would otherwise log a synthetic revision
-- entry for every experiment for a column no human actually edited.
alter table experiments disable trigger experiments_enforce_lifecycle;
alter table experiments disable trigger experiments_record_revision;
update experiments set updated_at = updated_at;
alter table experiments enable trigger experiments_enforce_lifecycle;
alter table experiments enable trigger experiments_record_revision;

-- 2. Keyset-pagination indexes, one per sortable column, id as tiebreaker (D2).
create index if not exists experiments_date_id_idx on experiments (date desc, id desc);
create index if not exists experiments_name_id_idx on experiments (name asc, id asc);
create index if not exists experiments_ph_id_idx on experiments (ph desc, id desc);
create index if not exists experiments_cycles_id_idx on experiments (cycles desc, id desc);

-- 3. Indexes for the new server-side filters.
create index if not exists experiments_status_idx on experiments (status);
create index if not exists experiments_project_idx on experiments (project);

-- 4. Saved views (D4) — owner-only, matching experiment_drafts' precedent.
create table if not exists saved_views (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  query      jsonb not null,
  created_at timestamptz not null default now()
);

alter table saved_views enable row level security;
drop policy if exists saved_views_own on saved_views;
create policy saved_views_own on saved_views
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
