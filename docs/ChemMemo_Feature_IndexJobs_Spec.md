---
type: spec
project: ChemMemo
title: ChemMemo — Durable Indexing Job Queue (T0.5 Design Spec)
status: shipped — dev only, not yet promoted to master/prod
aliases:
  - ChemMemo Index Jobs Spec
  - T0.5 Spec
tags:
  - chememo
  - chememo/spec
created: 2026-07-25
updated: 2026-07-25
---

# ChemMemo — Durable Indexing Job Queue

> **Shipped 2026-07-25 on dev** (not yet promoted to master/prod). Implemented as designed, verified end-to-end: trigger tested in a rolled-back transaction before trusting it, a real created-then-soft-deleted throwaway experiment confirmed the full enqueue → fast-path-run → done cycle both ways, and Railway runtime logs confirmed the poller starts. See [[ChemMemo_Implementation_Plan]] session history (2026-07-25) for the full account.

Hub: [[ChemMemo]] · Plan: [[ChemMemo_Product_Evolution_Plan]] (T0.5) · Build log: [[ChemMemo_Implementation_Plan]]

**Repo:** `C:\dev\chememo_webapp` · **Branch:** implement on `dev`.

## Problem

`lib/sync-embedding.ts` (`syncExperimentEmbedding`) is called fire-and-forget from `app/(app)/new/actions.ts` on create/update/soft-delete:

```ts
void syncExperimentEmbedding(id).catch((e) => console.error(...));
```

If the Node process restarts or crashes between the experiment row being written and that promise resolving, the embed call is lost silently — the experiment exists but never gets indexed for semantic search, with no retry and no record that anything went wrong. There's also no path today to re-embed everything if the embedding model/dimensions ever change.

## Decisions (from brainstorming, 2026-07-25)

1. **Keep today's near-instant UX.** Saving an experiment must stay searchable almost immediately in the healthy case — this is not a "queue everything, poll every 30s" redesign. The existing fire-and-forget call in `new/actions.ts` stays as the fast path; durability is added underneath it, not instead of it.
2. **Enqueue via a Postgres trigger, not app code.** An `AFTER INSERT OR UPDATE` trigger on `experiments` upserts a row into `index_jobs` inside the *same* transaction as the experiment write — this is what makes it genuinely durable (Postgres guarantees it) rather than "durable if the app remembers to call two things." Matches the existing `experiment_revisions` trigger pattern already in this codebase (`20260720120000_experiment_revisions.sql`). Soft-delete is just an `UPDATE` setting `deleted_at`, so it's already covered — no separate delete trigger needed.
3. **One job row per experiment (supersede, not append).** `experiment_id` is the primary key of `index_jobs`. A new save `ON CONFLICT (experiment_id) DO UPDATE` resets the row to `pending` with `attempts = 0`. If an experiment is edited again while its previous job is still pending/retrying, there is still only one job for it — the poller redoes the work once, using whatever the row currently looks like (see decision 6), instead of processing stale duplicate jobs back-to-back.
4. **Worker mechanism: in-process poller.** The app already runs as a single persistent Node.js service on Railway (not serverless, not multi-instance — same assumption the T0.3 rate limiter already relies on). A `setInterval` inside the existing server checks for `pending` jobs whose `next_attempt_at` has passed, retries them, and updates status. This needs zero new infrastructure (no Railway cron config, no Supabase `pg_cron`/`pg_net` verification) for a path that should rarely even fire. Trade-off accepted: if the whole service is down, the poller is down too — but jobs stay durable in the DB and get picked up on the next restart, which is exactly the failure mode this fixes (compare to today, where a crash mid-request loses the job entirely).
5. **Retry shape.** Up to 5 attempts, backoff via `next_attempt_at = now() + (2^attempts minutes)`, capped at ~30 min between tries. After 5 failed attempts, status becomes `failed` and stays there (the poller stops touching it) — a person or a future admin view (T0.10) can decide what to do. No dead-letter table; `failed` rows are just left in `index_jobs` with their `last_error`. The poller flips a job to `processing` right before calling the embed logic and back to `pending`/`done`/`failed` afterward — this is single-process housekeeping (so a slow-running job doesn't get double-picked-up by the same interval firing again before the last run finished), not a concurrency guard against other workers, since there are none.
6. **Reindexing is a data-shape concern only, not a feature, for T0.5.** `syncExperimentEmbedding` always re-fetches the experiment by ID and computes the embedding fresh — it never operates on a stale snapshot — so a job naturally reflects the latest edit whenever it runs. On success, the job row is stamped with `embedding_model`/`embedding_dimensions` actually used. This is enough for a future "reindex everything on model X" script to `select experiment_id from index_jobs where embedding_model != 'new-model'` and re-enqueue — but building that script/trigger/UI is explicitly **out of scope** for T0.5. It ships when the embedding model actually changes, not speculatively now.
7. **Status visibility.** T0.5 only needs the *data* to exist (status/attempts/last_error columns, queryable). The actual admin/health screen (queue depth, failures, index version) is T0.10's job per the plan — not built here.

## Data model

**New migration** (`supabase/migrations/`, `YYYYMMDDHHMMSS_index_jobs.sql`):

```sql
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

-- Enqueue trigger: any experiment insert/update resets its job to pending.
create or replace function enqueue_index_job() returns trigger
language plpgsql security definer as $$
begin
  insert into index_jobs (experiment_id, status, attempts, next_attempt_at, updated_at)
  values (new.id, 'pending', 0, now(), now())
  on conflict (experiment_id) do update
    set status = 'pending', attempts = 0, next_attempt_at = now(), updated_at = now(), last_error = null;
  return new;
end;
$$;

drop trigger if exists experiments_enqueue_index_job on experiments;
create trigger experiments_enqueue_index_job
  after insert or update on experiments
  for each row execute function enqueue_index_job();
```

RLS: `index_jobs` holds no user-authored content (just status bookkeeping), so it's service-role-only — no `select`/`insert`/`update` policy for `authenticated`, matching the "not client-writable" pattern already used for operational tables. Reads (for a future T0.10 screen) go through `createAdminClient()`.

## App code changes

- **`lib/sync-embedding.ts`** — `syncExperimentEmbedding` gains a thin wrapper (or is called from a new `lib/index-jobs.ts`) that, on success, marks the job `done` with the model/dims used; on failure, increments `attempts`, sets `last_error`, computes the next backoff, and marks `failed` once attempts are exhausted.
- **`app/(app)/new/actions.ts`** — unchanged call shape (`void syncExperimentEmbedding(id).catch(...)`); the trigger already inserted the `pending` row as part of the same DB write that created/updated the experiment, so nothing here needs to explicitly "enqueue" — the fire-and-forget call is just the fast-path attempt at the job the trigger already recorded.
- **New: an in-process poller.** A `setInterval` (~30s), started once when the server boots (guarded so it doesn't double-start across Next.js's dev-mode module reloads), that selects `pending` jobs where `next_attempt_at <= now()`, calls the same embedding logic, and updates the row. Runs in the same process as the Next.js server — no new deployable, no new Railway service.

## Acceptance criteria

- Creating, updating, or soft-deleting an experiment inserts/updates exactly one `index_jobs` row for it, in the same transaction as the experiment write (verifiable by checking the row exists immediately after the write, even if the embed call itself is mocked to fail).
- A simulated failure (e.g., temporarily breaking the embedding call) leaves the job `pending`/`failed` with `last_error` populated, and the poller picks it up and retries within its backoff window.
- Editing an experiment again while its job is still pending resets that same row (no duplicate rows for one experiment) and the next successful run reflects the *latest* edit's content.
- After 5 failed attempts, the job settles at `status = 'failed'` and the poller stops retrying it.
- No new Railway service, cron config, or Postgres extension is required to ship this.

## Out of scope (explicitly deferred)

- Admin/health UI showing queue depth, failures, index version — **T0.10**.
- A reindex-by-model-version trigger/script/UI — ships only when the embedding model actually changes.
- Multi-instance-safe job claiming (row locking, `SELECT ... FOR UPDATE SKIP LOCKED`) — not needed while Railway runs this as a single process; would need revisiting if the service ever scales out.
