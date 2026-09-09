-- Widen ai_requests.endpoint for the log filer, following the same pattern as
-- every prior widening (20260825140000, and T3.6's before it).
--
-- 'crew_plan' stays in the list even though the four-agent crew was retired in
-- 20260910120000: rows referencing it are history, and history does not stop
-- being true because the feature that wrote it is gone.
alter table ai_requests drop constraint if exists ai_requests_endpoint_check;
alter table ai_requests add constraint ai_requests_endpoint_check
  check (endpoint in (
    'ask_grounded', 'ask_general', 'summary_single', 'summary_group',
    'comparison_table', 'contradiction_check', 'crew_plan',
    'next_experiment_suggestion', 'gap_scan', 'crew_resolve',
    'log_filer'
  ));
