import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DraftKey, ExperimentDraft, ExperimentInput } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function keyColumn(key: DraftKey) {
  return "targetExperimentId" in key
    ? { column: "target_experiment_id" as const, value: key.targetExperimentId }
    : { column: "client_draft_id" as const, value: key.clientDraftId };
}

export async function getDraft(key: DraftKey): Promise<ExperimentDraft | null> {
  const supabase = await createClient();
  const { column, value } = keyColumn(key);
  const { data } = await supabase
    .from("experiment_drafts")
    .select("*")
    .eq(column, value)
    .maybeSingle();
  return (data as ExperimentDraft | null) ?? null;
}

// Upserts on the matching unique index (owner_id, target_experiment_id) or
// (owner_id, client_draft_id) — a debounced autosave tick, not a growing log.
export async function saveDraft(
  supabase: Supabase,
  userId: string,
  key: DraftKey,
  fields: Partial<ExperimentInput>,
  rawNote: string | null,
  baseUpdatedAt: string | null
): Promise<void> {
  const { column, value } = keyColumn(key);
  const row =
    column === "target_experiment_id"
      ? { owner_id: userId, target_experiment_id: value, client_draft_id: null }
      : { owner_id: userId, client_draft_id: value, target_experiment_id: null };
  const { error } = await supabase.from("experiment_drafts").upsert(
    {
      ...row,
      fields,
      raw_note: rawNote,
      base_updated_at: baseUpdatedAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: column === "target_experiment_id" ? "owner_id,target_experiment_id" : "owner_id,client_draft_id" }
  );
  if (error) throw error;
}

// Called by createExperiment/updateExperiment on success so a saved
// record's draft doesn't linger and get offered as "recover?" next time.
export async function discardDraft(supabase: Supabase, key: DraftKey): Promise<void> {
  const { column, value } = keyColumn(key);
  await supabase.from("experiment_drafts").delete().eq(column, value);
}
