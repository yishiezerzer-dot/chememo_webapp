"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as relationshipsService from "@/lib/relationships/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, RelationshipType } from "@/lib/types";

export async function createRelationshipAction(
  experimentId: string,
  targetExperimentId: string,
  relationshipType: RelationshipType
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const target = targetExperimentId.trim();
  if (!target) return { ok: false, error: "Enter the other experiment's ID." };

  try {
    await relationshipsService.createRelationship(supabase, user.id, experimentId, target, relationshipType);
  } catch (e) {
    return toActionResult("createRelationshipAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  revalidatePath(`/experiments/${target}`);
  return { ok: true };
}

export async function deleteRelationshipAction(experimentId: string, relationshipId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await relationshipsService.deleteRelationship(supabase, relationshipId);
  } catch (e) {
    return toActionResult("deleteRelationshipAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
