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
): Promise<ActionResult<relationshipsService.RelationshipView>> {
  const { supabase, user } = await requireUser();
  const target = targetExperimentId.trim();
  if (!target) return { ok: false, error: "Enter the other experiment's ID." };

  let view: relationshipsService.RelationshipView;
  try {
    view = await relationshipsService.createRelationship(supabase, user.id, experimentId, target, relationshipType);
  } catch (e) {
    return toActionResult("createRelationshipAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  revalidatePath(`/experiments/${target}`);
  return { ok: true, data: view };
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
