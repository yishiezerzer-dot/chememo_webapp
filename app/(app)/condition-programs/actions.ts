"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/authorization/policies";
import * as conditionsService from "@/lib/conditions/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { validateQuantityUnits } from "@/lib/schemas";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, Quantity } from "@/lib/types";

export async function createConditionProgramTemplateAction(
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
  const { supabase, user, workspaceId } = await requireWorkspace();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a name." };

  const quantityKinds = await listQuantityKinds();
  const err = validateQuantityUnits(quantities, quantityKinds);
  if (err) return { ok: false, error: err };

  try {
    await conditionsService.createConditionProgramTemplate(supabase, user.id, workspaceId, {
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
    return toActionResult("createConditionProgramTemplateAction", e);
  }
  revalidatePath("/condition-programs");
  return { ok: true };
}
