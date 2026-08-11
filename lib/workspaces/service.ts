import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { WorkspaceMembership, WorkspaceRole } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// T2.1 — every workspace a user belongs to, oldest first (the oldest
// membership is the fallback "active workspace" when no cookie is set —
// almost always the single backfilled workspace for existing users).
export async function listMyWorkspaces(supabase: Supabase, userId: string): Promise<WorkspaceMembership[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(name)")
    .eq("user_id", userId)
    .order("joined_at");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const ws = Array.isArray(r.workspaces) ? r.workspaces[0] : r.workspaces;
    return { id: r.workspace_id, name: ws?.name ?? "Untitled workspace", role: r.role };
  });
}

// D1 — self-serve creation: any signed-in user can create a workspace and
// becomes its owner.
export async function createWorkspace(supabase: Supabase, userId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new AppError("validation", "Enter a workspace name.");
  const { data: ws, error } = await supabase
    .from("workspaces")
    .insert({ name: trimmed, created_by: userId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the workspace.", { cause: error });
  const { error: memberError } = await supabase
    .from("workspace_members")
    .insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
  if (memberError) throw new AppError("conflict", "Could not add you to the new workspace.", { cause: memberError });
  return ws.id as string;
}

export type MemberView = { userId: string; role: WorkspaceRole; fullName: string | null; initials: string | null };

export async function listMembers(supabase: Supabase, workspaceId: string): Promise<MemberView[]> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("user_id, role")
    .eq("workspace_id", workspaceId)
    .order("joined_at");
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  // No direct FK exists from workspace_members to profiles (both only
  // reference auth.users separately), so PostgREST's embedded-select syntax
  // can't auto-join them — fetch profiles separately and merge here instead.
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name, initials")
    .in(
      "id",
      rows.map((r) => r.user_id)
    );
  if (profilesError) throw profilesError;
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  return rows.map((r) => {
    const p = byId.get(r.user_id);
    return { userId: r.user_id, role: r.role, fullName: p?.full_name ?? null, initials: p?.initials ?? null };
  });
}

export async function updateMemberRole(
  supabase: Supabase,
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
): Promise<void> {
  const { error } = await supabase
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw new AppError("conflict", "Could not update that member's role.", { cause: error });
}

export async function removeMember(supabase: Supabase, workspaceId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw new AppError("conflict", "Could not remove that member.", { cause: error });
}

export type InvitationView = { id: string; email: string; role: WorkspaceRole; token: string; expiresAt: string };

export async function listInvitations(supabase: Supabase, workspaceId: string): Promise<InvitationView[]> {
  const { data, error } = await supabase
    .from("invitations")
    .select("id, email, role, token, expires_at")
    .eq("workspace_id", workspaceId)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, email: r.email, role: r.role, token: r.token, expiresAt: r.expires_at }));
}

// D4 — copy-paste invite link, no email delivery (matches T1.9 D3's
// no-email-infrastructure precedent for notifications).
export async function createInvitation(
  supabase: Supabase,
  workspaceId: string,
  invitedBy: string,
  email: string,
  role: WorkspaceRole
): Promise<string> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) throw new AppError("validation", "Enter an email address.");
  const { data, error } = await supabase
    .from("invitations")
    .insert({ workspace_id: workspaceId, email: trimmed, role, invited_by: invitedBy })
    .select("token")
    .single();
  if (error) throw new AppError("conflict", "Could not create the invitation.", { cause: error });
  return data.token as string;
}

export async function acceptInvitation(supabase: Supabase, userId: string, token: string): Promise<string> {
  const { data: invite, error } = await supabase
    .from("invitations")
    .select("id, workspace_id, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  if (!invite) throw new AppError("not-found", "This invitation link is invalid.");
  if (invite.accepted_at) throw new AppError("conflict", "This invitation has already been used.");
  if (new Date(invite.expires_at) < new Date()) throw new AppError("conflict", "This invitation has expired.");

  const { error: memberError } = await supabase
    .from("workspace_members")
    .upsert({ workspace_id: invite.workspace_id, user_id: userId, role: invite.role }, { onConflict: "workspace_id,user_id" });
  if (memberError) throw new AppError("conflict", "Could not join the workspace.", { cause: memberError });

  await supabase.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
  return invite.workspace_id as string;
}
