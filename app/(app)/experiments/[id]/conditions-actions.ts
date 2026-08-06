"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as conditionsService from "@/lib/conditions/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { listControlledVocab } from "@/lib/experiments/service";
import { validateQuantityUnits, validateControlType } from "@/lib/schemas";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, ControlType, Quantity } from "@/lib/types";

export async function applyConditionProgramTemplateAction(
  experimentId: string,
  batchId: string,
  templateId: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  try {
    await conditionsService.applyConditionProgramTemplate(supabase, user.id, batchId, templateId);
  } catch (e) {
    return toActionResult("applyConditionProgramTemplateAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function createAdHocConditionProgramAction(
  experimentId: string,
  batchId: string,
  name: string,
  cycleCount: number,
  atmosphere: string,
  humidityOrDryingMethod: string,
  vessel: string,
  agitation: string,
  samplingPoints: string,
  quantities: Record<string, Quantity>,
  notes: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a name." };

  const quantityKinds = await listQuantityKinds();
  const err = validateQuantityUnits(quantities, quantityKinds);
  if (err) return { ok: false, error: err };

  try {
    await conditionsService.createAdHocBatchConditionProgram(supabase, user.id, batchId, {
      name: trimmed,
      cycle_count: cycleCount,
      atmosphere: atmosphere.trim() || null,
      humidity_or_drying_method: humidityOrDryingMethod.trim() || null,
      vessel: vessel.trim() || null,
      agitation: agitation.trim() || null,
      sampling_points: samplingPoints.trim() || null,
      quantities,
      notes: notes.trim() || null,
    });
  } catch (e) {
    return toActionResult("createAdHocConditionProgramAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function getBatchConditionsAction(batchId: string) {
  const [program, environmental] = await Promise.all([
    conditionsService.getBatchConditionProgram(batchId),
    conditionsService.getEnvironmentalConditions(batchId),
  ]);
  const cycles = program ? await conditionsService.listConditionProgramCycles(program.id) : [];
  return { program, cycles, environmental };
}

export async function addConditionProgramCycleAction(
  experimentId: string,
  batchConditionProgramId: string,
  cycleIndex: number,
  wetStartAt: string,
  wetEndAt: string,
  dryStartAt: string,
  dryEndAt: string,
  quantities: Record<string, Quantity>,
  observation: string,
  deviation: Record<string, unknown>
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const quantityKinds = await listQuantityKinds();
  const err = validateQuantityUnits(quantities, quantityKinds);
  if (err) return { ok: false, error: err };

  try {
    await conditionsService.addConditionProgramCycle(supabase, user.id, batchConditionProgramId, {
      cycle_index: cycleIndex,
      wet_start_at: wetStartAt || null,
      wet_end_at: wetEndAt || null,
      dry_start_at: dryStartAt || null,
      dry_end_at: dryEndAt || null,
      quantities,
      observation: observation.trim() || null,
      deviation,
    });
  } catch (e) {
    return toActionResult("addConditionProgramCycleAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function saveEnvironmentalConditionsAction(
  experimentId: string,
  batchId: string,
  fields: conditionsService.EnvironmentalConditionsFields
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const quantityKinds = await listQuantityKinds();
  const err = validateQuantityUnits(fields.quantities, quantityKinds);
  if (err) return { ok: false, error: err };

  try {
    await conditionsService.upsertEnvironmentalConditions(supabase, user.id, batchId, fields);
  } catch (e) {
    return toActionResult("saveEnvironmentalConditionsAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function listControlsAction(experimentId: string) {
  return conditionsService.listControls(experimentId);
}

export async function createControlAction(
  experimentId: string,
  controlType: ControlType,
  description: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const allowed = await listControlledVocab("control_type");
  const err = validateControlType(controlType, allowed);
  if (err) return { ok: false, error: err };

  try {
    await conditionsService.createControl(supabase, user.id, experimentId, controlType, description.trim() || null);
  } catch (e) {
    return toActionResult("createControlAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function deleteControlAction(experimentId: string, controlId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await conditionsService.deleteControl(supabase, controlId);
  } catch (e) {
    return toActionResult("deleteControlAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
