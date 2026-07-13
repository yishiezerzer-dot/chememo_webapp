-- Phase 6 — semantic-search plumbing (inert until embeddings are populated in
-- Phase 10). Cosine-distance nearest-neighbour lookup over experiment_embeddings.
-- SECURITY INVOKER (the default) so the caller's RLS still applies: only
-- accessible, non-deleted experiments are ever returned.

create index if not exists experiment_embeddings_hnsw
  on experiment_embeddings
  using hnsw (embedding vector_cosine_ops);

create or replace function match_experiments(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (id text, name text, similarity float)
language sql
stable
as $$
  select e.id, e.name, 1 - (em.embedding <=> query_embedding) as similarity
  from experiment_embeddings em
  join experiments e on e.id = em.experiment_id
  where e.deleted_at is null
  order by em.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function match_experiments(vector, int) to authenticated;
