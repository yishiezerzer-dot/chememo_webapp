-- QA sweep 2026-08-18. Three related defects in the job-queue / health
-- machinery, all found by reading /api/health on dev and then checking the
-- database rather than the page.

-- ---------------------------------------------------------------------------
-- 1. Stranded `processing` rows -- no lease, no reclaim.
--
-- Every poller (lib/evidence-chunks.ts, lib/index-jobs.ts, lib/file-jobs.ts)
-- flips a row to 'processing' in one statement and then works it in the next.
-- If the process dies in between -- a Railway redeploy, a container restart,
-- an OOM -- the row stays 'processing' forever, because every poller selects
-- only status = 'pending' and nothing anywhere looks at 'processing' again.
-- Found on dev: an evidence_chunks row for EXP-958 stuck since 2026-08-09,
-- nine days, attempts still 0 and last_error still null -- it never even got
-- charged an attempt.
--
-- A row that has sat in 'processing' far longer than any real job could take
-- was abandoned by a dead process, so put it back. attempts is incremented so
-- that a row which genuinely kills its worker every time still climbs to
-- MAX_ATTEMPTS and stops, instead of being reclaimed forever.
--
-- p_table is validated against a fixed allowlist before being interpolated as
-- an identifier -- the same discipline used for column names in
-- apply_ai_suggestion(): never build a dynamic identifier from unvalidated
-- input, and never string-concatenate one.
create or replace function reclaim_stale_queue_rows(p_table text, p_stale_minutes int default 10)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_table not in ('evidence_chunks', 'index_jobs', 'file_jobs') then
    raise exception 'Unknown queue table %.', p_table using errcode = 'check_violation';
  end if;

  execute format(
    'update %I
        set status = ''pending'',
            attempts = attempts + 1,
            next_attempt_at = now(),
            last_error = coalesce(last_error, ''reclaimed: worker died mid-job''),
            updated_at = now()
      where status = ''processing''
        and updated_at < now() - make_interval(mins => $1)',
    p_table
  ) using p_stale_minutes;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Health counted chunks whose experiment is soft-deleted.
--
-- Exactly the bug class already found and fixed for index_jobs in T0.10
-- ("indexedCount could exceed totalExperiments by counting soft-deleted
-- experiments' jobs"), never carried across to evidence_chunks. On dev this
-- was most of the noise: of 61 failed experiment-sourced chunks, 52 belonged
-- to soft-deleted experiments, and all 30 failed comment chunks pointed at
-- soft-deleted experiments too.
--
-- evidence_chunks is polymorphic (source_type/source_id over 10 tables) with
-- no direct experiment FK, but the enqueue triggers already record the owning
-- experiment in metadata->>'experiment_id' for every experiment-scoped source
-- type. Protocol-scoped chunks (protocol_version, protocol_step) legitimately
-- have none -- protocols are lab-shared and do not die with an experiment --
-- so they are always counted.
create or replace function health_evidence_chunk_counts()
returns table (pending bigint, failed bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where c.status in ('pending', 'processing')) as pending,
    count(*) filter (where c.status = 'failed') as failed
  from evidence_chunks c
  where c.metadata->>'experiment_id' is null
     or exists (
       select 1 from experiments e
       where e.id = c.metadata->>'experiment_id'
         and e.deleted_at is null
     );
$$;

-- The health page's list of failed chunks has to apply the same filter as the
-- count above, or the page contradicts itself -- a tile reading 25 above a
-- list of 107. Same predicate, newest first.
create or replace function health_failed_evidence_chunks(p_limit int default 20)
returns table (
  id uuid,
  source_type text,
  source_id text,
  attempts int,
  last_error text,
  next_attempt_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.source_type, c.source_id, c.attempts, c.last_error, c.next_attempt_at
  from evidence_chunks c
  where c.status = 'failed'
    and (
      c.metadata->>'experiment_id' is null
      or exists (
        select 1 from experiments e
        where e.id = c.metadata->>'experiment_id'
          and e.deleted_at is null
      )
    )
  order by c.next_attempt_at desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- 3. No requeue path anywhere for a terminally-failed row.
--
-- MAX_ATTEMPTS is 5 and the pollers only ever look at 'pending', so 'failed'
-- is terminal with no way back -- no button, no action, no script. Since
-- /api/health reports `degraded` whenever any failed row exists, dev has been
-- latched at `degraded` since 2026-08-09 and could not have returned to `ok`
-- by any means short of a manual SQL write. An alarm that cannot be cleared
-- stops carrying information: a genuinely new failure today would look
-- exactly like the nine-day-old one.
--
-- Requeueing deliberately skips rows whose owning experiment is soft-deleted:
-- re-embedding a deleted record would burn provider quota to put content back
-- into an index it should not be in. Those rows stay 'failed' and are simply
-- no longer counted, per (2) above.
create or replace function requeue_failed_queue_rows(p_table text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_table not in ('evidence_chunks', 'index_jobs', 'file_jobs') then
    raise exception 'Unknown queue table %.', p_table using errcode = 'check_violation';
  end if;

  if p_table = 'evidence_chunks' then
    update evidence_chunks c
    set status = 'pending', attempts = 0, last_error = null,
        next_attempt_at = now(), updated_at = now()
    where c.status = 'failed'
      and (
        c.metadata->>'experiment_id' is null
        or exists (
          select 1 from experiments e
          where e.id = c.metadata->>'experiment_id' and e.deleted_at is null
        )
      );
  elsif p_table = 'index_jobs' then
    update index_jobs j
    set status = 'pending', attempts = 0, last_error = null,
        next_attempt_at = now(), updated_at = now()
    where j.status = 'failed'
      and exists (select 1 from experiments e where e.id = j.experiment_id and e.deleted_at is null);
  else
    update file_jobs f
    set status = 'pending', attempts = 0, last_error = null,
        next_attempt_at = now(), updated_at = now()
    where f.status = 'failed';
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
