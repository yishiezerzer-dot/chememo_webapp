-- T0.5 — durable indexing job queue. Replaces the fire-and-forget-only
-- embedding sync: an AFTER INSERT OR UPDATE trigger on experiments upserts a
-- pending job in the SAME transaction as the experiment write, so it's
-- durable even if the app process dies before the fire-and-forget embed
-- call finishes. Soft-delete is just an UPDATE (deleted_at), already covered
-- — no separate delete trigger needed. One row per experiment (supersede,
-- not append): a new save resets attempts/status on that same row rather
-- than piling up duplicate jobs. See ChemMemo_Feature_IndexJobs_Spec.md.

create table if not exists index_jobs (
  experiment_id text primary key references experiments(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  embedding_model text,
  embedding_dimensions integer,
  next_attempt_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists index_jobs_pending_idx
  on index_jobs (next_attempt_at) where status = 'pending';

alter table index_jobs enable row level security;
-- No policies for `authenticated` — operational bookkeeping only, no
-- user-authored content. All reads/writes go through the service role.

create or replace function enqueue_index_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into index_jobs (experiment_id, status, attempts, next_attempt_at, updated_at, last_error)
  values (new.id, 'pending', 0, now(), now(), null)
  on conflict (experiment_id) do update
    set status = 'pending', attempts = 0, next_attempt_at = now(), updated_at = now(), last_error = null;
  return new;
end;
$$;

drop trigger if exists experiments_enqueue_index_job on experiments;
create trigger experiments_enqueue_index_job
  after insert or update on experiments
  for each row
  execute function enqueue_index_job();
