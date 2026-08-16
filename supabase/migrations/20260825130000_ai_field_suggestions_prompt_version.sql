-- T3.4 D5's prompt_versions registry needs an entry for the new
-- suggestExperimentFields() system prompt in lib/llm.ts, added alongside
-- the AI Field Suggestions feature (see 20260825120000_ai_field_suggestions.sql
-- and ChemMemo_Feature_AIFieldSuggestions_Spec.md).
insert into prompt_versions (prompt_key, version) values
  ('suggest_fields', 1)
on conflict (prompt_key) do nothing;
