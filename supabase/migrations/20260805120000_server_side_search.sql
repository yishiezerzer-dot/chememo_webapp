-- T1.6 — Server-side experiment search & pagination.
-- See Spec: ChemMemo_Feature_ServerSideSearch_Spec.md (D1-D7).

-- 1. Full-text search column + index (D1). jsonb_to_tsvector over
--    sample_matrix indexes every stored legacy_code/vial_label/sample_id
--    string for free -- satisfies §4.1-§4.3 without a separate mechanism.
alter table experiments add column search_vector tsvector generated always as (
  setweight(to_tsvector('english', coalesce(id, '') || ' ' || coalesce(short_code, '') || ' ' || coalesce(name, '')), 'A') ||
  setweight(to_tsvector('english',
    coalesce(researcher, '') || ' ' || coalesce(reaction_type, '') || ' ' ||
    array_to_string(coalesce(compounds, '{}'), ' ') || ' ' ||
    array_to_string(coalesce(metals, '{}'), ' ') || ' ' ||
    array_to_string(coalesce(methods, '{}'), ' ')
  ), 'B') ||
  setweight(jsonb_to_tsvector('english', coalesce(sample_matrix, '[]'::jsonb), '["string"]'), 'B') ||
  setweight(to_tsvector('english',
    coalesce(observations, '') || ' ' || coalesce(notes, '') || ' ' ||
    coalesce(scientific_question, '') || ' ' || coalesce(hypothesis, '') || ' ' || coalesce(conclusion, '')
  ), 'C')
) stored;

create index experiments_search_vector_idx on experiments using gin (search_vector);

-- 2. Keyset-pagination indexes, one per sortable column, id as tiebreaker (D2).
create index experiments_date_id_idx on experiments (date desc, id desc);
create index experiments_name_id_idx on experiments (name asc, id asc);
create index experiments_ph_id_idx on experiments (ph desc, id desc);
create index experiments_cycles_id_idx on experiments (cycles desc, id desc);

-- 3. Indexes for the new server-side filters.
create index experiments_status_idx on experiments (status);
create index experiments_project_idx on experiments (project);

-- 4. Saved views (D4) — owner-only, matching experiment_drafts' precedent.
create table saved_views (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  query      jsonb not null,
  created_at timestamptz not null default now()
);

alter table saved_views enable row level security;
create policy saved_views_own on saved_views
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
