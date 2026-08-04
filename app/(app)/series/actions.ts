"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, requireWorkspace } from "@/lib/authorization/policies";
import * as seriesService from "@/lib/series/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export async function createNewSeries(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user, workspaceId } = await requireWorkspace();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) {
    return { ok: false, error: "Name is required.", fieldErrors: { name: "Name is required." } };
  }
  const description = ((formData.get("description") as string | null) ?? "").trim() || null;

  let id: string;
  try {
    id = await seriesService.createSeries(supabase, user.id, workspaceId, name, description);
  } catch (e) {
    return toActionResult("createNewSeries", e);
  }

  revalidatePath("/series");
  redirect(`/series/${id}`);
}

export async function addMemberAction(seriesId: string, experimentId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const trimmed = experimentId.trim();
  if (!trimmed) return { ok: false, error: "Enter an experiment ID." };
  try {
    await seriesService.addMember(supabase, seriesId, trimmed);
  } catch (e) {
    return toActionResult("addMemberAction", e);
  }
  revalidatePath(`/series/${seriesId}`);
  revalidatePath(`/experiments/${trimmed}`);
  return { ok: true };
}

export async function removeMemberAction(seriesId: string, experimentId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await seriesService.removeMember(supabase, seriesId, experimentId);
  } catch (e) {
    return toActionResult("removeMemberAction", e);
  }
  revalidatePath(`/series/${seriesId}`);
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

// Same operations, experiment-id-first, so the experiment detail page can
// bind its own id via .bind(null, experimentId) and leave seriesId as the
// remaining call-time argument (the "add to series" control on that page
// picks the series, not the experiment).
export async function addExperimentToSeriesAction(experimentId: string, seriesId: string): Promise<ActionResult> {
  return addMemberAction(seriesId, experimentId);
}

export async function removeExperimentFromSeriesAction(experimentId: string, seriesId: string): Promise<ActionResult> {
  return removeMemberAction(seriesId, experimentId);
}
