-- T3.6 D5 — widen ai_requests.endpoint to cover the two new higher-order
-- assists (comparison table generation, contradiction detection), mirroring
-- T2.8's precedent for widening a check constraint for a new, real, distinct
-- value rather than overloading an existing one.
alter table ai_requests drop constraint if exists ai_requests_endpoint_check;
alter table ai_requests add constraint ai_requests_endpoint_check
  check (endpoint in ('ask_grounded', 'ask_general', 'summary_single', 'summary_group', 'comparison_table', 'contradiction_check'));
