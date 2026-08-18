-- QA sweep 2026-08-18. Semantic search was silently returning nothing for
-- the lab's entire real record set, and had been since the AI provider was
-- switched from Gemini to OpenAI.
--
-- Every chunk belonging to the 13 real experiments was embedded with
-- gemini-embedding-001. The app now embeds QUERIES with
-- text-embedding-3-small. Both produce 1536-dim vectors, so pgvector
-- compares them perfectly happily -- no dimension error, no warning, nothing
-- in any log -- but cosine similarity between vectors from two different
-- models is meaningless, so every hit fell under lib/rag.ts's MIN_SIM of 0.5
-- and semanticSearch returned an empty set every time.
--
-- Reproduced end to end before writing this: "Experiments with m/z 297"
-- answered correctly with five cited sources (the deterministic filter path,
-- which never touches embeddings), while "where did we see turbidity or
-- precipitate forming" returned "No matching experiments found in your lab"
-- -- even though EXP-001's observations literally read "Persistent
-- precipitate formed upon rehydration ... Solution turbidity increased with
-- cycle count."
--
-- The existing embedding_version column is the intended mechanism for this,
-- but nothing bumped it when the provider changed, and nothing anywhere
-- compared a chunk's embedding_model against the one currently in use. The
-- app's own watch-out note warns that the embedding dimension must match the
-- model "or pgvector errors" -- the real trap is the reverse: when two
-- different models happen to share a dimension, it fails silently instead.

-- 1. How many chunks are embedded with something other than the model now in
--    use. The active model lives in the environment (lib/embeddings.ts), so
--    it is passed in rather than hardcoded here.
--
--    `is distinct from` rather than `<>` on purpose: a null embedding_model
--    (a chunk that has never been embedded) must count as stale, and `<>`
--    silently drops nulls. That exact NULL-comparison trap produced a false
--    alarm during this same session's verification work.
create or replace function health_stale_embedding_chunks(p_active_model text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from evidence_chunks
  where status = 'done'
    and embedding_model is distinct from p_active_model;
$$;

-- 2. Re-queue those chunks so the existing poller re-embeds them with the
--    current model. Only touches rows already settled at 'done' -- anything
--    pending or processing is on its way through the queue already, and
--    anything failed is the requeue path's business, not this one.
create or replace function requeue_stale_embedding_chunks(p_active_model text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update evidence_chunks
  set status = 'pending',
      attempts = 0,
      last_error = null,
      next_attempt_at = now(),
      updated_at = now()
  where status = 'done'
    and embedding_model is distinct from p_active_model;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 3. Drop chunks whose source row no longer exists. evidence_chunks points at
--    its source polymorphically (source_type/source_id) with no foreign key,
--    so nothing cascades: deleting a protocol or an experiment leaves its
--    chunks behind as orphans that still surface in retrieval. Clearing the
--    e2e protocols earlier today orphaned several hundred in one go.
--
--    Without this they would also be re-embedded by step 2 -- spending real
--    provider quota to re-index records that no longer exist.
delete from evidence_chunks c
where (c.source_type = 'experiment'
       and not exists (select 1 from experiments e where e.id = c.source_id))
   or (c.source_type = 'protocol_version'
       and not exists (select 1 from protocol_versions p where p.id::text = c.source_id))
   or (c.source_type = 'protocol_step'
       and not exists (select 1 from protocol_steps s where s.id::text = c.source_id))
   or (c.source_type = 'comment'
       and not exists (select 1 from comments m where m.id::text = c.source_id));
