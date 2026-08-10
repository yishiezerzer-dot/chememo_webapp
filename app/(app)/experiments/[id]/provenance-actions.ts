"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

// T3.8 D4/D8 — resolving an item is the only way unresolved_open_count ever
// changes; enforced by resolve_crew_unresolved_item (security definer SQL
// function, migration 20260822120000) since the table itself has no
// client-facing UPDATE policy at all.
export async function resolveUnresolvedItemAction(experimentId: string, itemIndex: number): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("resolve_crew_unresolved_item", {
    p_experiment_id: experimentId,
    p_item_index: itemIndex,
  });
  if (error) return toActionResult("resolveUnresolvedItem", error);

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
