-- T3.7 D4 — widen ai_requests.endpoint for the planning crew (one row per
-- crew RUN, not per agent — matches D3's "one logical request" design).
alter table ai_requests drop constraint if exists ai_requests_endpoint_check;
alter table ai_requests add constraint ai_requests_endpoint_check
  check (endpoint in (
    'ask_grounded', 'ask_general', 'summary_single', 'summary_group',
    'comparison_table', 'contradiction_check', 'crew_plan'
  ));

-- Register the four crew-agent prompts (T3.4 D5's versioning registry).
insert into prompt_versions (prompt_key, version) values
  ('crew_intake', 1),
  ('crew_design', 1),
  ('crew_controls', 1),
  ('crew_critic', 1)
on conflict (prompt_key) do nothing;
