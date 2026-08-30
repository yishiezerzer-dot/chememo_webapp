"use client";

import Link from "next/link";
import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type { WorkspaceMembership } from "@/lib/types";
import { switchWorkspaceAction } from "@/app/(app)/workspaces-actions";

export function WorkspaceSwitcher({ memberships, activeId }: { memberships: WorkspaceMembership[]; activeId: string }) {
  const [open, setOpen] = useState(false);
  const { run, pending, pendingKey: pendingId } = useRunAction();
  const active = memberships.find((m) => m.id === activeId);

  function switchTo(id: string) {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    // switchWorkspaceAction resolves to void, so there is no ActionResult to
    // report -- it either sets the cookie or throws.
    run(
      async () => {
        await switchWorkspaceAction(id);
        return { ok: true };
      },
      id,
      () => setOpen(false)
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ width: "100%", justifyContent: "space-between" }}
        disabled={pending}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {active?.name ?? "Workspace"}
        </span>
        <span style={{ opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <div
          className="obs-box glass"
          style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4, padding: 6 }}
        >
          {memberships.map((m) => (
            <button
              key={m.id}
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ width: "100%", justifyContent: "flex-start", fontWeight: m.id === activeId ? 600 : 400 }}
              disabled={pending}
              aria-busy={pending && pendingId === m.id}
              onClick={() => switchTo(m.id)}
            >
              {pending && pendingId === m.id && <Spinner />}
              {m.name} <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>{m.role}</span>
            </button>
          ))}
          <Link href="/workspaces/new" className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "flex-start", marginTop: 4 }}>
            + New workspace
          </Link>
          <Link href="/workspaces/members" className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "flex-start" }}>
            Manage members
          </Link>
        </div>
      )}
    </div>
  );
}
