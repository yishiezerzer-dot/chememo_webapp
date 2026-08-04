import { requireWorkspace } from "@/lib/authorization/policies";
import { listMembers, listInvitations } from "@/lib/workspaces/service";
import { MembersClient } from "@/components/members-client";

export default async function WorkspaceMembersPage() {
  const { supabase, user, workspaceId, memberships } = await requireWorkspace();
  const [members, invitations] = await Promise.all([
    listMembers(supabase, workspaceId),
    listInvitations(supabase, workspaceId),
  ]);
  const activeName = memberships.find((m) => m.id === workspaceId)?.name ?? "Workspace";
  const myRole = members.find((m) => m.userId === user.id)?.role ?? "viewer";
  const isAdmin = myRole === "owner" || myRole === "admin";

  return (
    <div>
      <span className="eyebrow">Workspace</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        {activeName} — Members
      </h2>
      <MembersClient members={members} invitations={invitations} currentUserId={user.id} isAdmin={isAdmin} />
    </div>
  );
}
