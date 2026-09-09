import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { Json } from "@/lib/database.types";
import type { TimelineEventType } from "@/lib/timeline/event-types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// The vocabulary lives in event-types.ts, which carries no `server-only` so
// the classifier and the composer can share it in the browser.
export { TIMELINE_EVENT_TYPES, type TimelineEventType } from "@/lib/timeline/event-types";

// The domain shape, narrower than the generated row type in two places that
// matter: event_type is the union above rather than bare string, and
// quality_flags/details are typed for use rather than as Json. Same
// arrangement as StepDetail in lib/experiment-steps/service.ts.
export type TimelineEvent = {
  id: string;
  experiment_id: string;
  workspace_id: string | null;
  occurred_at: string;
  recorded_at: string;
  actor_id: string | null;
  event_type: TimelineEventType;
  batch_id: string | null;
  sample_id: string | null;
  experiment_step_id: string | null;
  file_id: string | null;
  subject_label: string | null;
  action: string | null;
  observation: string | null;
  deviation_note: string | null;
  next_action: string | null;
  quality_flags: string[];
  corrects_event_id: string | null;
  source_type: string | null;
  source_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
};

export type TimelineEventView = TimelineEvent & {
  actorName: string;
  /** Corrections pointing AT this event, so the UI can render them together (§10.2). */
  corrections: TimelineEvent[];
};

export type NewTimelineEvent = {
  experimentId: string;
  eventType?: TimelineEventType;
  action?: string | null;
  observation?: string | null;
  deviationNote?: string | null;
  nextAction?: string | null;
  occurredAt?: string | null;
  sampleId?: string | null;
  batchId?: string | null;
  experimentStepId?: string | null;
  fileId?: string | null;
  subjectLabel?: string | null;
  correctsEventId?: string | null;
  qualityFlags?: string[];
  details?: Record<string, unknown>;
};

// Reverse-chronological, with corrections folded under what they correct so a
// stale claim can never render alone (§10.2). Projected rows are included:
// the whole point is that one read shows everything that happened, whichever
// surface recorded it.
export async function listTimeline(experimentId: string): Promise<TimelineEventView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("timeline_events")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as TimelineEvent[];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, initials").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null; initials: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.initials || "Someone"]));

  const correctionsFor = new Map<string, TimelineEvent[]>();
  for (const r of rows) {
    if (!r.corrects_event_id) continue;
    correctionsFor.set(r.corrects_event_id, [...(correctionsFor.get(r.corrects_event_id) ?? []), r]);
  }

  return rows
    // A correction renders under its original, not as a separate entry.
    .filter((r) => !r.corrects_event_id)
    .map((r) => ({
      ...r,
      actorName: r.actor_id ? nameById.get(r.actor_id) ?? "Someone" : "Someone",
      corrections: (correctionsFor.get(r.id) ?? []).sort((a, b) =>
        a.occurred_at.localeCompare(b.occurred_at)
      ),
    }));
}

// Returns the row it wrote, so the panel patches its sticky state from the
// server's own values rather than assembling one here — occurred_at in
// particular is the database's now(), not this workstation's clock.
export async function addTimelineEvent(
  supabase: Supabase,
  userId: string,
  input: NewTimelineEvent
): Promise<TimelineEvent> {
  const { data, error } = await supabase
    .from("timeline_events")
    .insert({
      experiment_id: input.experimentId,
      actor_id: userId,
      event_type: input.eventType ?? "observed",
      action: input.action ?? null,
      observation: input.observation ?? null,
      deviation_note: input.deviationNote ?? null,
      next_action: input.nextAction ?? null,
      occurred_at: input.occurredAt ?? undefined,
      sample_id: input.sampleId ?? null,
      batch_id: input.batchId ?? null,
      experiment_step_id: input.experimentStepId ?? null,
      file_id: input.fileId ?? null,
      subject_label: input.subjectLabel ?? null,
      corrects_event_id: input.correctsEventId ?? null,
      quality_flags: input.qualityFlags ?? [],
      details: (input.details ?? {}) as Json,
    })
    .select("*")
    .single();
  if (error) throw new AppError("conflict", "Could not save that log entry.", { cause: error });
  return data as TimelineEvent;
}
