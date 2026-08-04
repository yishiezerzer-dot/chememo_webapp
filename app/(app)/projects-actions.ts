"use server";

import { requireUser, requireWorkspace } from "@/lib/authorization/policies";
import * as projectsService from "@/lib/projects/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import { projectLabelSchema } from "@/lib/schemas";

export async function createProject(label: string, color: string): Promise<ActionResult> {
  const { supabase, user, workspaceId } = await requireWorkspace();

  const parsed = projectLabelSchema.safeParse(label);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    await projectsService.createProject(supabase, user.id, workspaceId, parsed.data, color);
  } catch (e) {
    return toActionResult("createProject", e);
  }
  return { ok: true };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();

  try {
    await projectsService.deleteProject(supabase, id);
  } catch (e) {
    return toActionResult("deleteProject", e);
  }
  return { ok: true };
}
