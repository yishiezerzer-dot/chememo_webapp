"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import { getRevision, updateExperiment } from "@/lib/experiments/service";
import { toActionResult } from "@/lib/errors";
import { experimentInputFromSnapshot } from "@/lib/types";
import type { ActionResult } from "@/lib/types";

// T1.8 D6/D7 — restore re-applies a snapshot through the *normal* update
// path (never a privileged bypass), so it automatically inherits the
// existing completion-lock trigger: restoring over a locked/failed record
// requires reopening it first, exactly like any other edit. A restore
// reason is always required (D7, unlike a normal edit where only locked
// records demand one) and logged as a 'restore' event on
// experiment_lock_events (its existing append-only shape already fits).
export async function restoreRevisionAction(
  experimentId: string,
  revisionId: string,
  reason: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: "A reason is required to restore a version." };
  }

  const revision = await getRevision(revisionId);
  if (!revision || revision.experiment_id !== experimentId) {
    return { ok: false, error: "That revision could not be found." };
  }

  const input = experimentInputFromSnapshot(revision.snapshot);

  try {
    await updateExperiment(supabase, experimentId, input);
  } catch (e) {
    return toActionResult("restoreRevisionAction", e);
  }

  const { error: logError } = await supabase
    .from("experiment_lock_events")
    .insert({ experiment_id: experimentId, event: "restore", reason: trimmedReason, actor_id: user.id });
  if (logError) {
    return toActionResult("restoreRevisionAction", logError);
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
