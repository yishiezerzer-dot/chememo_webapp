"use client";

import { useActionState } from "react";
import { createWorkspaceAction } from "../../workspaces-actions";
import type { ActionResult } from "@/lib/types";

export default function NewWorkspacePage() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(createWorkspaceAction, null);

  return (
    <div>
      <span className="eyebrow">Workspaces</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>New workspace</h2>
      <p className="muted" style={{ maxWidth: 480, marginBottom: 16 }}>
        A workspace is its own private space — only people you invite can see anything inside it. You become its owner.
      </p>
      <form action={formAction} className="obs-box glass" style={{ maxWidth: 480 }}>
        {state && !state.ok && (
          <p className="field-error" role="alert">
            {state.error}
          </p>
        )}
        <div className="field">
          <label>Workspace name *</label>
          <input name="name" required placeholder="Moran Lab" />
        </div>
        <button type="submit" className="btn btn-primary">
          Create workspace
        </button>
      </form>
    </div>
  );
}
