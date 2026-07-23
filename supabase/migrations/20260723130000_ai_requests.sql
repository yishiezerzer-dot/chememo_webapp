-- T0.3 — AI endpoint limits & telemetry. Logs actual AI provider calls only
-- (keyless search never reaches this path); rate-limited attempts are not
-- logged here since no provider call was made — see lib/rate-limit.ts.
create table if not exists ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  endpoint text not null check (endpoint in ('ask_grounded', 'ask_general', 'summary_single', 'summary_group')),
  status text not null check (status in ('ok', 'error')),
  source_count integer,
  model text,
  est_tokens integer,
  latency_ms integer,
  created_at timestamptz default now()
);

alter table ai_requests enable row level security;

drop policy if exists ai_requests_read_own on ai_requests;
create policy ai_requests_read_own on ai_requests
  for select to authenticated using (user_id = auth.uid());
