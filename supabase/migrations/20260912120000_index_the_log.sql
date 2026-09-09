-- Make the execution log searchable.
--
-- This closes a hole the overhaul itself opened, and it is the more important
-- half of that story. Before, what a scientist typed went into
-- experiments.observations, which the evidence-chunk trigger indexes. Now it
-- goes into timeline_events, which nothing indexed -- so every sentence
-- written since the log shipped was invisible to Ask AI and to semantic
-- search. The app's central feature could not see its own new spine.
--
-- The narrative fields were safe to delete precisely because they were never
-- indexed. The log is the opposite case: it is where the science actually is,
-- so indexing it makes retrieval better than it was before any of this
-- started.
--
-- ONLY NATIVE ENTRIES ARE INDEXED. A projected row (source_type is not null)
-- mirrors a step observation, a sample event, an analysis result and so on --
-- and every one of those tables already has its own evidence-chunk trigger
-- from 20260818120000. Indexing both copies would put two hits for one fact
-- into reciprocal-rank fusion, which does not merely waste embedding calls: it
-- lets a single observation outvote two distinct ones and quietly corrupts
-- the ranking. The `where` clause below is that guard.
--
-- It is also why this migration costs nothing to apply: every timeline row
-- that exists today came from the backfill in 20260909120000, so every one of
-- them is projected, so none is re-embedded.

alter table evidence_chunks drop constraint if exists evidence_chunks_source_type_check;
alter table evidence_chunks add constraint evidence_chunks_source_type_check
  check (source_type in (
    'experiment', 'step_observation', 'step_deviation', 'protocol_version', 'protocol_step',
    'sample_event', 'sample_measurement', 'analysis_result', 'comment', 'condition_cycle',
    'timeline_event'
  ));

create or replace function enqueue_evidence_chunk_timeline_event() returns trigger
language plpgsql as $$
declare
  v_text text;
  v_section text;
begin
  -- Projected rows are indexed under their own source type by their own
  -- trigger. See the note above: double-indexing corrupts RRF ranking.
  if new.source_type is not null then return new; end if;

  v_text := concat_ws(' — ', nullif(btrim(coalesce(new.action, '')), ''),
                             nullif(btrim(coalesce(new.observation, '')), ''),
                             nullif(btrim(coalesce(new.deviation_note, '')), ''),
                             nullif(btrim(coalesce(new.next_action, '')), ''));
  if coalesce(btrim(v_text), '') = '' then return new; end if;

  -- section_type drives how a hit is explained back to the user in
  -- MatchExplanation, so a deviation should not be labelled an observation.
  v_section := case when new.event_type = 'deviated' then 'deviation' else 'observations' end;

  perform upsert_evidence_chunk(
    new.workspace_id,
    'timeline_event',
    new.id::text,
    v_section,
    'Experiment ' || new.experiment_id || ' — ' || new.event_type || ': ' || v_text
      || coalesce(' (' || nullif(new.subject_label, '') || ')', ''),
    jsonb_build_object('experiment_id', new.experiment_id, 'event_type', new.event_type)
  );
  return new;
end;
$$;

-- Insert only. timeline_events has no UPDATE policy at all -- it is
-- append-only by §10.2 -- so an update trigger would be dead code that implies
-- the table is mutable.
drop trigger if exists trg_evidence_chunk_timeline_event on timeline_events;
create trigger trg_evidence_chunk_timeline_event
  after insert on timeline_events
  for each row execute function enqueue_evidence_chunk_timeline_event();
