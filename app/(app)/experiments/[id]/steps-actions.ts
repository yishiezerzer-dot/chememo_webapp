"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as stepsService from "@/lib/experiment-steps/service";
import { listControlledVocab } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { validateQuantityUnits, validateDeviationCategory } from "@/lib/schemas";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, Quantity } from "@/lib/types";
import type { DeviationInput, StepDetail } from "@/lib/experiment-steps/service";

export async function instantiateStepsAction(
  experimentId: string,
  protocolVersionId: string
): Promise<ActionResult<StepDetail[]>> {
  const { supabase } = await requireUser();
  try {
    await stepsService.instantiateSteps(supabase, experimentId, protocolVersionId);
  } catch (e) {
    return toActionResult("instantiateStepsAction", e);
  }
  const details = await stepsService.listStepDetails(experimentId);
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true, data: details };
}

// Called directly by StepRunner (never a raw <form action> submit — actual
// pH/quantities/atmosphere live in client component state), so this takes
// plain arguments rather than parsing FormData, matching the direct-call
// convention lifecycle-actions.ts already established (setStatus/complete).
export async function updateStepStatusAction(
  experimentId: string,
  stepId: string,
  status: string,
  actual: { ph: number | null; quantities: Record<string, Quantity>; atmosphere: string | null }
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const quantityError = validateQuantityUnits(actual.quantities, await listQuantityKinds());
  if (quantityError) return { ok: false, error: quantityError };

  try {
    await stepsService.updateStepStatus(supabase, stepId, status, user.id, actual);
  } catch (e) {
    return toActionResult("updateStepStatusAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

// Direct-call convention (D9's note above) — StepRunner never submits a
// native <form> to this action, so it takes the note as a plain argument.
export async function recordObservationAction(
  experimentId: string,
  stepId: string,
  note: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const trimmed = note.trim();
  if (!trimmed) return { ok: false, error: "An observation needs a note." };

  try {
    await stepsService.recordObservation(supabase, stepId, user.id, trimmed);
  } catch (e) {
    return toActionResult("recordObservationAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

// Same direct-call convention — DeviationForm parses its own native <form>'s
// FormData client-side (a real form submission, not a server action) and
// passes the resulting plain object here.
export async function recordDeviationAction(
  experimentId: string,
  stepId: string,
  input: DeviationInput
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  if (!input.category) return { ok: false, error: "Pick a deviation category." };
  if (!input.what_happened.trim()) return { ok: false, error: "Describe what happened." };

  const allowed = await listControlledVocab("deviation_category");
  const categoryError = validateDeviationCategory(input.category, allowed);
  if (categoryError) return { ok: false, error: categoryError };

  try {
    await stepsService.recordDeviation(supabase, stepId, user.id, input);
  } catch (e) {
    return toActionResult("recordDeviationAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
