"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import { AppError, toActionResult } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type { ActionResult, ExperimentStatus } from "@/lib/types";

// T1.1 — status moves only through these gates (D10). The DB trigger
// (enforce_experiment_lifecycle, migration 20260730120000) is the real
// enforcement boundary for every legal-transition and lock rule; a raised
// check_violation already reads as a sentence a human wrote, so it's surfaced
// as-is rather than replaced with a generic message.
function lifecycleError(context: string, error: { message: string }): ActionResult {
  return toActionResult(context, new AppError("conflict", error.message, { cause: error }));
}

export async function setStatus(id: string, next: ExperimentStatus): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("experiments").update({ status: next }).eq("id", id);
  if (error) return lifecycleError("setStatus", error);

  revalidatePath(`/experiments/${id}`);
  revalidatePath("/experiments");
  return { ok: true };
}

export async function completeExperiment(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("experiments").update({ status: "completed" }).eq("id", id);
  if (error) return lifecycleError("completeExperiment", error);

  // Best-effort audit entry — the status change above is the source of
  // truth and has already committed; a missed log row shouldn't undo it.
  const { error: logErr } = await supabase
    .from("experiment_lock_events")
    .insert({ experiment_id: id, event: "lock", reason: "Completed.", actor_id: user.id });
  if (logErr) logError("completeExperiment", "lock event insert failed", { error: logErr });

  revalidatePath(`/experiments/${id}`);
  revalidatePath("/experiments");
  return { ok: true };
}

// D11 — self-review permitted for now; reviewed_by is always stamped (by the
// trigger) so T2.1 can find self-reviews later with one query.
export async function reviewExperiment(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("experiments").update({ status: "reviewed" }).eq("id", id);
  if (error) return lifecycleError("reviewExperiment", error);

  revalidatePath(`/experiments/${id}`);
  revalidatePath("/experiments");
  return { ok: true };
}

// D12 — archive is the close-out affordance. On a non-terminal record,
// endedAs supplies the missing "how it ended" move; archive_experiment (SQL
// function, security invoker) makes both moves in one transaction so a
// client-side failure between them can't strand the record half-closed.
export async function archiveExperiment(
  id: string,
  endedAs?: "completed" | "failed" | "cancelled"
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("archive_experiment", {
    p_id: id,
    p_ended_as: endedAs ?? undefined,
  });
  if (error) return lifecycleError("archiveExperiment", error);

  revalidatePath(`/experiments/${id}`);
  revalidatePath("/experiments");
  return { ok: true };
}

// D5 — §18.5 requires a documented reason to reopen a locked record.
// reopen_experiment (SQL function) writes the unlock and the reason row in
// one transaction; the reason is also checked here so the UI can show a
// field-level error before ever calling the database.
export async function reopenExperiment(id: string, reason: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const trimmed = reason.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: "A reason is required to reopen an experiment.",
      fieldErrors: { reason: "A reason is required." },
    };
  }

  const { error } = await supabase.rpc("reopen_experiment", { p_id: id, p_reason: trimmed });
  if (error) return lifecycleError("reopenExperiment", error);

  revalidatePath(`/experiments/${id}`);
  revalidatePath("/experiments");
  return { ok: true };
}
