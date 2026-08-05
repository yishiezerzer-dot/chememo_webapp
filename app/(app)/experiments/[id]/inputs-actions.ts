"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as materialsService from "@/lib/materials/service";
import { listControlledVocab } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { validateQuantityUnits, validateMaterialRole, validateOutputRole } from "@/lib/schemas";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, InputSourceType, Quantity } from "@/lib/types";

export async function addInputAction(
  experimentId: string,
  sourceType: InputSourceType,
  sourceId: string,
  role: string,
  quantities: Record<string, Quantity>,
  notes: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const allowedRoles = await listControlledVocab("material_role");
  const roleError = validateMaterialRole(role, allowedRoles);
  if (roleError) return { ok: false, error: roleError };

  const quantityError = validateQuantityUnits(quantities, await listQuantityKinds());
  if (quantityError) return { ok: false, error: quantityError };

  try {
    await materialsService.addInput(supabase, user.id, experimentId, {
      source_type: sourceType,
      source_id: sourceId,
      role,
      quantities,
      notes: notes.trim() || null,
    });
  } catch (e) {
    return toActionResult("addInputAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function removeInputAction(experimentId: string, inputId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await materialsService.removeInput(supabase, inputId);
  } catch (e) {
    return toActionResult("removeInputAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function addOutputAction(
  experimentId: string,
  materialId: string | null,
  materialName: string,
  role: string,
  quantities: Record<string, Quantity>,
  notes: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  if (!materialId && !materialName.trim()) {
    return { ok: false, error: "Pick a registered material or enter a name." };
  }

  const allowedRoles = await listControlledVocab("output_role");
  const roleError = validateOutputRole(role, allowedRoles);
  if (roleError) return { ok: false, error: roleError };

  const quantityError = validateQuantityUnits(quantities, await listQuantityKinds());
  if (quantityError) return { ok: false, error: quantityError };

  try {
    await materialsService.addOutput(supabase, user.id, experimentId, {
      material_id: materialId,
      material_name: materialName.trim() || null,
      role,
      quantities,
      notes: notes.trim() || null,
    });
  } catch (e) {
    return toActionResult("addOutputAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function removeOutputAction(experimentId: string, outputId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await materialsService.removeOutput(supabase, outputId);
  } catch (e) {
    return toActionResult("removeOutputAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
