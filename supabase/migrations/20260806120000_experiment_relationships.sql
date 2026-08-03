-- T1.7 — Experiment relationships & series.
-- See Spec: ChemMemo_Feature_ExperimentRelationships_Spec.md (D1-D7).

-- 1. Typed, directed relationship edges (D1, D2, D3). Lab-shared read+write,
--    like controlled_vocabularies/experiment_templates/protocols (no role
--    model until T2.1) -- relating two experiments is closer to
--    categorization than to editing either one's scientific content.
create table experiment_relationships (
  id                    uuid primary key default gen_random_uuid(),
  source_experiment_id  text not null references experiments(id) on delete cascade,
  target_experiment_id  text not null references experiments(id) on delete cascade,
  relationship_type     text not null,
  created_by            uuid references auth.users(id),
  created_at            timestamptz not null default now(),
  constraint experiment_relationships_no_self check (source_experiment_id <> target_experiment_id),
  constraint experiment_relationships_valid_type check (relationship_type in (
    'replicate_of', 'control_for', 'optimization_of', 'continuation_of',
    'based_on', 'confirms', 'contradicts', 'same_series'
  )),
  unique (source_experiment_id, target_experiment_id, relationship_type)
);

create index experiment_relationships_source_idx on experiment_relationships (source_experiment_id);
create index experiment_relationships_target_idx on experiment_relationships (target_experiment_id);

alter table experiment_relationships enable row level security;
create policy experiment_relationships_read on experiment_relationships for select to authenticated using (true);
create policy experiment_relationships_write on experiment_relationships for all to authenticated using (true) with check (true);

-- 2. Formal series grouping (D4) -- a set membership, not a pairwise edge.
create table experiment_series (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table experiment_series_members (
  series_id     uuid not null references experiment_series(id) on delete cascade,
  experiment_id text not null references experiments(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (series_id, experiment_id)
);

alter table experiment_series enable row level security;
alter table experiment_series_members enable row level security;
create policy experiment_series_read on experiment_series for select to authenticated using (true);
create policy experiment_series_write on experiment_series for all to authenticated using (true) with check (true);
create policy experiment_series_members_read on experiment_series_members for select to authenticated using (true);
create policy experiment_series_members_write on experiment_series_members for all to authenticated using (true) with check (true);
