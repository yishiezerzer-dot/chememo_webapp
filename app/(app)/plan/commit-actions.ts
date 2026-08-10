"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/authorization/policies";
import { commitCrewDraft } from "@/lib/ai/crew/commit";
import { getLatestVersion } from "@/lib/templates/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import type { CrewDraft } from "@/lib/ai/crew/types";

// T3.8 D1 — the human already reviewed the plan on screen (T3.7); this is
// the one write path, initiated only by an explicit click, never automatic.
// Takes a template id (not a version) — the confirm dialog only shows
// templates, and this resolves the frozen version to use at commit time,
// same as any other instantiate-from-template entry point.
export async function createDraftExperimentFromPlan(
  draft: CrewDraft,
  opts: { name: string; templateId: string | null; newProjectName: string | null }
): Promise<ActionResult> {
  const { supabase, user, workspaceId } = await requireWorkspace();

  const name = opts.name.trim();
  if (!name) {
    return { ok: false, error: "Please give the experiment a name.", fieldErrors: { name: "Required." } };
  }

  const template = opts.templateId ? await getLatestVersion(opts.templateId) : null;

  let experimentId: string;
  try {
    experimentId = await commitCrewDraft(supabase, user.id, workspaceId, draft, {
      name,
      templateVersionId: template?.id ?? null,
      template,
      newProjectName: opts.newProjectName,
    });
  } catch (e) {
    return toActionResult("createDraftExperimentFromPlan", e);
  }

  revalidatePath("/experiments");
  redirect(`/experiments/${experimentId}`);
}
