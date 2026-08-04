"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, requireWorkspace } from "@/lib/authorization/policies";
import * as workspacesService from "@/lib/workspaces/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, WorkspaceRole } from "@/lib/types";

const WORKSPACE_COOKIE = "cm_workspace";

// D1 — self-serve: any signed-in user can create a workspace and becomes
// its owner, then switches into it immediately.
export async function createWorkspaceAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) return { ok: false, error: "Name is required.", fieldErrors: { name: "Name is required." } };

  let id: string;
  try {
    id = await workspacesService.createWorkspace(supabase, user.id, name);
  } catch (e) {
    return toActionResult("createWorkspaceAction", e);
  }

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}

export async function switchWorkspaceAction(workspaceId: string): Promise<void> {
  const { memberships } = await requireWorkspace();
  if (!memberships.some((m) => m.id === workspaceId)) return;
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function inviteMemberAction(email: string, role: WorkspaceRole): Promise<ActionResult> {
  const { supabase, user, workspaceId } = await requireWorkspace();
  try {
    await workspacesService.createInvitation(supabase, workspaceId, user.id, email, role);
  } catch (e) {
    return toActionResult("inviteMemberAction", e);
  }
  revalidatePath("/workspaces/members");
  return { ok: true };
}

export async function updateMemberRoleAction(memberUserId: string, role: WorkspaceRole): Promise<ActionResult> {
  const { supabase, workspaceId } = await requireWorkspace();
  try {
    await workspacesService.updateMemberRole(supabase, workspaceId, memberUserId, role);
  } catch (e) {
    return toActionResult("updateMemberRoleAction", e);
  }
  revalidatePath("/workspaces/members");
  return { ok: true };
}

export async function removeMemberAction(memberUserId: string): Promise<ActionResult> {
  const { supabase, workspaceId } = await requireWorkspace();
  try {
    await workspacesService.removeMember(supabase, workspaceId, memberUserId);
  } catch (e) {
    return toActionResult("removeMemberAction", e);
  }
  revalidatePath("/workspaces/members");
  return { ok: true };
}

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  let workspaceId: string;
  try {
    workspaceId = await workspacesService.acceptInvitation(supabase, user.id, token);
  } catch (e) {
    return toActionResult("acceptInvitationAction", e);
  }
  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return { ok: true };
}
