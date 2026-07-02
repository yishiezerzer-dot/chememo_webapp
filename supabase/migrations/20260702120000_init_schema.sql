-- ChemMemo Phase 2 — data model, triggers, and row-level security.
-- Lab-shared model: any authenticated user reads all non-deleted rows;
-- users may insert/update/delete only their own (owner_id = auth.uid()).

create extension if not exists vector;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  initials text,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- projects: lab research programs (reference data)
-- ---------------------------------------------------------------------------
create table projects (
  id text primary key,
  label text not null,
  color text
);

-- ---------------------------------------------------------------------------
-- experiments: the core record
-- ---------------------------------------------------------------------------
create table experiments (
  id text primary key,
  name text not null,
  date date,
  researcher text,
  owner_id uuid references auth.users(id) default auth.uid(),
  project text references projects(id),
  reaction_type text,
  compounds text[] default '{}',
  metals text[] default '{}',
  ph numeric,
  concentration text,
  temperature text,
  cycles int,
  methods text[] default '{}',
  mz numeric[] default '{}',
  observations text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index experiments_owner_idx on experiments(owner_id);
create index experiments_project_idx on experiments(project);

-- ---------------------------------------------------------------------------
-- experiment_files: uploads (Storage) OR external links
-- ---------------------------------------------------------------------------
create table experiment_files (
  id uuid primary key default gen_random_uuid(),
  experiment_id text references experiments(id) on delete cascade,
  kind text check (kind in ('upload','link')),
  file_type text,
  label text,
  storage_path text,
  url text,
  created_at timestamptz default now()
);

create index experiment_files_experiment_idx on experiment_files(experiment_id);

-- ---------------------------------------------------------------------------
-- experiment_embeddings: semantic search vectors (populated in Phase 10)
-- ---------------------------------------------------------------------------
create table experiment_embeddings (
  experiment_id text primary key references experiments(id) on delete cascade,
  content text,
  embedding vector(1536),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- ai_summaries: grounded generated summaries (populated in Phase 10)
-- ---------------------------------------------------------------------------
create table ai_summaries (
  id uuid primary key default gen_random_uuid(),
  experiment_id text references experiments(id) on delete cascade,
  scope text,
  summary text,
  model text,
  source_ids text[],
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- triggers
-- ---------------------------------------------------------------------------

-- keep updated_at fresh on experiments
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger experiments_set_updated_at
  before update on experiments
  for each row execute function set_updated_at();

-- auto-create a profile row when a new auth user signs up
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- row-level security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table projects enable row level security;
alter table experiments enable row level security;
alter table experiment_files enable row level security;
alter table experiment_embeddings enable row level security;
alter table ai_summaries enable row level security;

-- profiles: everyone authenticated can read; you edit only your own row
create policy profiles_read on profiles
  for select to authenticated using (true);
create policy profiles_update_own on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- projects: reference data — all authenticated users read; no client writes
create policy projects_read on projects
  for select to authenticated using (true);

-- experiments: read all non-deleted (lab-shared); write only your own
create policy experiments_read on experiments
  for select to authenticated using (deleted_at is null);
create policy experiments_insert_own on experiments
  for insert to authenticated with check (owner_id = auth.uid());
create policy experiments_update_own on experiments
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy experiments_delete_own on experiments
  for delete to authenticated using (owner_id = auth.uid());

-- experiment_files: readable when the parent experiment is; writable when you own the parent
create policy experiment_files_read on experiment_files
  for select to authenticated using (
    exists (select 1 from experiments e where e.id = experiment_id and e.deleted_at is null)
  );
create policy experiment_files_write on experiment_files
  for all to authenticated using (
    exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid())
  ) with check (
    exists (select 1 from experiments e where e.id = experiment_id and e.owner_id = auth.uid())
  );

-- embeddings + summaries: readable to all authenticated; writes happen server-side (service role bypasses RLS)
create policy experiment_embeddings_read on experiment_embeddings
  for select to authenticated using (true);
create policy ai_summaries_read on ai_summaries
  for select to authenticated using (true);
