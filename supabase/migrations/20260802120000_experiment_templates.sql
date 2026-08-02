-- T1.2 — Templates & clone experiment.
-- See Spec: ChemMemo_Feature_Templates_Spec.md (D1-D6).

-- 1. Seven §8.1 planning sections deferred by T1.1's C2 (D1), plus the two
--    provenance columns for template-instantiate and clone (D6).
alter table experiments
  add column independent_variables  text,
  add column controlled_variables   text,
  add column sample_matrix          jsonb not null default '[]',
  add column controls               jsonb not null default '[]',
  add column protocol_version       text,
  add column planned_analyses       text,
  add column sample_storage_plan    text,
  add column template_version_id    uuid,
  add column based_on_experiment_id text references experiments(id) on delete set null;

-- 2. Template tables (D4). Versions are immutable once any experiment
--    instantiates them (frozen_at), enforced by the trigger in step 3.
create table experiment_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  archived    boolean not null default false,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

create table experiment_template_versions (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null references experiment_templates(id) on delete cascade,
  version         int not null,
  defaults        jsonb not null default '{}',
  required_fields text[] not null default '{}',
  frozen_at       timestamptz,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (template_id, version)
);

alter table experiments
  add constraint experiments_template_version_fk
    foreign key (template_version_id) references experiment_template_versions(id);

create index experiment_template_versions_template_idx
  on experiment_template_versions (template_id, version desc);

-- 3. Freeze trigger (D4). AFTER INSERT so the freeze is atomic with the very
--    insert that consumes the version — a concurrent edit of a
--    never-yet-used version must not slip through unfrozen mid-race.
create or replace function freeze_template_version()
returns trigger
language plpgsql
as $$
begin
  update experiment_template_versions
  set frozen_at = now()
  where id = new.template_version_id and frozen_at is null;
  return new;
end;
$$;

create trigger experiments_freeze_template_version
  after insert on experiments
  for each row
  when (new.template_version_id is not null)
  execute function freeze_template_version();

-- 4. RLS — lab-shared, like controlled_vocabularies and ownerless projects
--    rows (D5): no role model yet (T2.1), so any authenticated user reads
--    and writes. created_by is stamped regardless for future attribution.
alter table experiment_templates enable row level security;
alter table experiment_template_versions enable row level security;

create policy experiment_templates_read on experiment_templates
  for select to authenticated using (true);
create policy experiment_templates_write on experiment_templates
  for all to authenticated using (true) with check (true);

create policy experiment_template_versions_read on experiment_template_versions
  for select to authenticated using (true);
create policy experiment_template_versions_insert on experiment_template_versions
  for insert to authenticated with check (true);
-- Update only while unfrozen; the trigger above is what actually flips
-- frozen_at, this policy just stops any further write once it has.
create policy experiment_template_versions_update on experiment_template_versions
  for update to authenticated using (frozen_at is null) with check (frozen_at is null);
