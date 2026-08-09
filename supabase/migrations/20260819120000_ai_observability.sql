-- T3.4 — AI observability, feedback & expanded eval.
-- See Spec: ChemMemo_Feature_AIObservabilityFeedbackEval_Spec.md (D1-D7).

-- D1 — per-retrieval log: which records were actually retrieved (not just
-- cited), their T3.3 MatchExplanation, for the evidence inspector + eval.
create table if not exists ai_retrieval_events (
  id             uuid primary key default gen_random_uuid(),
  ai_request_id  uuid references ai_requests(id) on delete set null,
  user_id        uuid references auth.users(id),
  query          text not null,
  ask_mode       text not null check (ask_mode in ('lab', 'context')),
  router_mode    text,
  retrieved      jsonb not null default '[]',
  created_at     timestamptz not null default now()
);

alter table ai_retrieval_events enable row level security;
drop policy if exists ai_retrieval_events_read_own on ai_retrieval_events;
create policy ai_retrieval_events_read_own on ai_retrieval_events
  for select to authenticated using (user_id = auth.uid());

-- D4 — thumbs up/down + optional note on a specific ai_requests row.
create table if not exists ai_feedback (
  id             uuid primary key default gen_random_uuid(),
  ai_request_id  uuid not null references ai_requests(id) on delete cascade,
  user_id        uuid references auth.users(id),
  rating         text not null check (rating in ('up', 'down')),
  note           text,
  created_at     timestamptz not null default now()
);

alter table ai_feedback enable row level security;
drop policy if exists ai_feedback_read_own on ai_feedback;
create policy ai_feedback_read_own on ai_feedback
  for select to authenticated using (user_id = auth.uid());

-- D2 — a distinct (provider, chat_model, embedding_model, dims) combination
-- is recorded once, at first sight — global deployment config, not
-- workspace-scoped data, so read access mirrors controlled_vocabularies'
-- "everyone authenticated reads, no client writes" shape.
create table if not exists ai_model_versions (
  id                    uuid primary key default gen_random_uuid(),
  provider              text not null,
  chat_model            text not null,
  embedding_model       text,
  embedding_dimensions  int,
  first_seen_at         timestamptz not null default now(),
  unique (provider, chat_model, embedding_model, embedding_dimensions)
);

alter table ai_model_versions enable row level security;
drop policy if exists ai_model_versions_read on ai_model_versions;
create policy ai_model_versions_read on ai_model_versions
  for select to authenticated using (true);

-- D5 — a registry of the version number for each hardcoded system prompt in
-- lib/llm.ts, for future eval/feedback correlation. Bumped by hand alongside
-- whatever prompt edit motivates it — not a live-editable CMS.
create table if not exists prompt_versions (
  id          uuid primary key default gen_random_uuid(),
  prompt_key  text not null unique,
  version     int not null default 1,
  updated_at  timestamptz not null default now()
);

alter table prompt_versions enable row level security;
drop policy if exists prompt_versions_read on prompt_versions;
create policy prompt_versions_read on prompt_versions
  for select to authenticated using (true);

insert into prompt_versions (prompt_key, version) values
  ('route_query', 1),
  ('cited_answer', 1),
  ('general_answer', 1),
  ('extract_fields', 1),
  ('summarize_experiment', 1),
  ('summarize_group', 1)
on conflict (prompt_key) do nothing;
