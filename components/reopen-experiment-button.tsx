"use client";

import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type { ActionResult } from "@/lib/types";

// §18.5 — reopening a locked record requires a documented reason. The dialog
// only enables submit once a reason is typed; reopenExperiment re-validates
// it server-side regardless (a client check is a convenience, not the gate).
export function ReopenExperimentButton({
  action,
}: {
  action: (reason: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { run, pending } = useRunAction();

  if (!open) {
    return (
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
        Reopen…
      </button>
    );
  }

  return (
    <div className="panel glass" style={{ marginTop: 16, maxWidth: 480 }}>
      <div className="field">
        <label>Reason for reopening (standard §18.5)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Why does this record need to change after completion?"
        />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending || !reason.trim()}
          aria-busy={pending}
          onClick={() => run(() => action(reason))}
        >
          {pending && <Spinner />}
          Confirm reopen
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
