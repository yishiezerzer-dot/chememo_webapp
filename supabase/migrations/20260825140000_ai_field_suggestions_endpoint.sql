-- AI Field Suggestions — widen ai_requests.endpoint for the two new AI
-- entry points, same pattern as every prior widening (T3.6 D5/D6).
alter table ai_requests drop constraint if exists ai_requests_endpoint_check;
alter table ai_requests add constraint ai_requests_endpoint_check
  check (endpoint in (
    'ask_grounded', 'ask_general', 'summary_single', 'summary_group',
    'comparison_table', 'contradiction_check', 'crew_plan',
    'next_experiment_suggestion', 'gap_scan', 'crew_resolve'
  ));
