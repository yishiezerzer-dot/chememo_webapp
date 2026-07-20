-- Audit #24 — edit history. Every UPDATE to an experiment snapshots the PRIOR
-- row into experiment_revisions, so the detail page can show what changed over
-- time. Read-all (lab-shared) under RLS; rows are written only by the trigger.

create table experiment_revisions (
  id uuid primary key default gen_random_uuid(),
  experiment_id text references experiments(id) on delete cascade,
  editor_id uuid references auth.users(id),
  snapshot jsonb not null,
  created_at timestamptz default now()
);

create index experiment_revisions_exp_idx
  on experiment_revisions (experiment_id, created_at desc);

alter table experiment_revisions enable row level security;

-- Lab-shared read, matching the experiments read-all model. No client writes.
create policy experiment_revisions_read on experiment_revisions
  for select to authenticated using (true);

-- SECURITY DEFINER so the trigger can insert regardless of the caller's direct
-- grants; auth.uid() still resolves to the user performing the update.
create or replace function record_experiment_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into experiment_revisions (experiment_id, editor_id, snapshot)
  values (old.id, auth.uid(), to_jsonb(old));
  return new;
end;
$$;

create trigger experiments_record_revision
  after update on experiments
  for each row
  execute function record_experiment_revision();
