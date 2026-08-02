"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as stepsService from "@/lib/experiment-steps/service";
import { listControlledVocab } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { validateQuantityUnits, validateDeviationCategory } from "@/lib/schemas";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, Quantity } from "@/lib/types";

export async function instantiateStepsAction(
  experimentId: string,
  protocolVersionId: string
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await stepsService.instantiateSteps(supabase, experimentId, protocolVersionId);
  } catch (e) {
    return toActionResult("instantiateStepsAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
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

export async function recordObservationAction(
  experimentId: string,
  stepId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const note = ((formData.get("note") as string | null) ?? "").trim();
  if (!note) return { ok: false, error: "An observation needs a note." };

  try {
    await stepsService.recordObservation(supabase, stepId, user.id, note);
  } catch (e) {
    return toActionResult("recordObservationAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function recordDeviationAction(
  experimentId: string,
  stepId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const str = (k: string) => {
    const v = (formData.get(k) as string | null)?.trim();
    return v ? v : null;
  };
  const category = str("category");
  const whatHappened = str("what_happened");
  if (!category) return { ok: false, error: "Pick a deviation category." };
  if (!whatHappened) return { ok: false, error: "Describe what happened." };

  const allowed = await listControlledVocab("deviation_category");
  const categoryError = validateDeviationCategory(category, allowed);
  if (categoryError) return { ok: false, error: categoryError };

  const sampleUsable = formData.get("sample_still_usable") as string | null;

  try {
    await stepsService.recordDeviation(supabase, stepId, user.id, {
      category,
      what_happened: whatHappened,
      how_discovered: str("how_discovered"),
      likely_impact: str("likely_impact"),
      sample_still_usable: sampleUsable === "" || sampleUsable === null ? null : sampleUsable === "true",
      corrective_action: str("corrective_action"),
      preventive_action: str("preventive_action"),
      affected_samples: str("affected_samples"),
    });
  } catch (e) {
    return toActionResult("recordDeviationAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
