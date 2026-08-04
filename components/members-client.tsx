"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { WORKSPACE_ROLES } from "@/lib/types";
import type { WorkspaceRole } from "@/lib/types";
import type { InvitationView, MemberView } from "@/lib/workspaces/service";
import { inviteMemberAction, updateMemberRoleAction, removeMemberAction } from "@/app/(app)/workspaces-actions";

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "Owner", admin: "Admin", pi: "PI", researcher: "Researcher", student: "Student", viewer: "Viewer",
};

export function MembersClient({
  members,
  invitations,
  currentUserId,
  isAdmin,
}: {
  members: MemberView[];
  invitations: InvitationView[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("researcher");
  const [lastLink, setLastLink] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error ?? "Something went wrong.", "error");
      else router.refresh();
    });
  }

  return (
    <div>
      <div className="obs-box glass" style={{ marginBottom: 16 }}>
        <h4>Members</h4>
        {members.map((m) => (
          <div key={m.userId} className="act-row">
            <span className="act-dot"></span>
            <span style={{ fontSize: 13.5 }}>
              <b>{m.fullName || m.initials || "Someone"}</b>
              {m.userId === currentUserId && <span className="muted"> (you)</span>}
            </span>
            {isAdmin ? (
              <select
                value={m.role}
                disabled={pending}
                style={{ marginLeft: "auto" }}
                onChange={(e) => run(() => updateMemberRoleAction(m.userId, e.target.value as WorkspaceRole))}
              >
                {WORKSPACE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            ) : (
              <span className="chip" style={{ marginLeft: "auto" }}>{ROLE_LABEL[m.role]}</span>
            )}
            {isAdmin && m.userId !== currentUserId && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pending}
                onClick={() => run(() => removeMemberAction(m.userId))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {isAdmin && (
        <div className="obs-box glass">
          <h4>Invite a member</h4>
          <p className="muted" style={{ fontSize: 12.5, margin: "0 0 12px" }}>
            No email is sent — copy the link and share it yourself.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <input ref={emailRef} type="email" placeholder="name@lab.edu" style={{ flex: 1, minWidth: 200 }} />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}>
              {WORKSPACE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-sm"
              disabled={pending}
              onClick={() => {
                const email = emailRef.current?.value.trim();
                if (!email) return;
                start(async () => {
                  const res = await inviteMemberAction(email, inviteRole);
                  if (!res.ok) {
                    showToast(res.error, "error");
                    return;
                  }
                  if (emailRef.current) emailRef.current.value = "";
                  router.refresh();
                });
              }}
            >
              + Invite
            </button>
          </div>

          {invitations.length > 0 && (
            <div>
              {invitations.map((inv) => {
                const link = typeof window !== "undefined" ? `${window.location.origin}/invite/${inv.token}` : `/invite/${inv.token}`;
                return (
                  <div key={inv.id} className="act-row">
                    <span className="act-dot"></span>
                    <span style={{ fontSize: 13 }}>
                      {inv.email} <span className="chip" style={{ marginLeft: 6 }}>{ROLE_LABEL[inv.role]}</span>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: "auto" }}
                      onClick={() => {
                        navigator.clipboard.writeText(link);
                        setLastLink(inv.id);
                        showToast("Invite link copied.", "success");
                      }}
                    >
                      {lastLink === inv.id ? "Copied" : "Copy link"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
