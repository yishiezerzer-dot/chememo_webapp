-- T3.6 D6 — widen ai_requests.endpoint for the next-experiment suggestion
-- assist (previously deferred sub-item 4), same pattern as D5's widening for
-- comparison_table/contradiction_check.
alter table ai_requests drop constraint if exists ai_requests_endpoint_check;
alter table ai_requests add constraint ai_requests_endpoint_check
  check (endpoint in (
    'ask_grounded', 'ask_general', 'summary_single', 'summary_group',
    'comparison_table', 'contradiction_check', 'crew_plan',
    'next_experiment_suggestion'
  ));
