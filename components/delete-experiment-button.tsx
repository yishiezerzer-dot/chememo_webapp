"use client";

import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type { ActionResult, ExperimentStatus } from "@/lib/types";

const TERMINAL: ExperimentStatus[] = ["completed", "reviewed", "failed", "cancelled"];

type Mode = "idle" | "confirm-delete" | "confirm-archive" | "close-out";

// D12 — archive is the primary affordance; soft delete narrows to drafts.
export function DeleteExperimentButton({
  status,
  hasConclusion,
  deleteAction,
  archiveAction,
}: {
  status: ExperimentStatus | null;
  hasConclusion: boolean;
  deleteAction: () => void | Promise<void>;
  archiveAction: (endedAs?: "completed" | "failed" | "cancelled") => Promise<ActionResult>;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const { run, pending } = useRunAction();
  const { showToast } = useToast();

  // Already archived: nothing left for this control to do.
  if (status === "archived") return null;

  function runArchive(endedAs?: "completed" | "failed" | "cancelled") {
    run(() => archiveAction(endedAs), undefined, () => showToast("Archived.", "success"));
  }

  // draft — the only status that may still be soft-deleted (§18.2, narrowed).
  if (status === "draft") {
    if (mode !== "confirm-delete") {
      return (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("confirm-delete")}>
          Delete draft
        </button>
      );
    }
    return (
      <div style={{ display: "inline-flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          aria-busy={pending}
          style={{ borderColor: "var(--rose)", color: "var(--rose)" }}
          onClick={() =>
            // deleteAction navigates away from this record rather than
            // returning an ActionResult, so there is nothing to report.
            run(async () => {
              await deleteAction();
              return { ok: true };
            })
          }
        >
          {pending && <Spinner />}
          Confirm delete
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setMode("idle")}>
          Cancel
        </button>
      </div>
    );
  }

  // Already terminal (completed/reviewed/failed/cancelled) — one move to archived.
  if (status !== null && TERMINAL.includes(status)) {
    if (mode !== "confirm-archive") {
      return (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("confirm-archive")}>
          Archive
        </button>
      );
    }
    return (
      <div style={{ display: "inline-flex", gap: 8 }}>
        <button type="button" className="btn btn-sm" disabled={pending} aria-busy={pending} onClick={() => runArchive()}>
          {pending && <Spinner />}
          Confirm archive
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("idle")}>
          Cancel
        </button>
      </div>
    );
  }

  // Not yet terminal (planned/in_progress/paused, or a legacy null-status
  // row) — close it out: pick how it ended, then archive in one action.
  if (mode !== "close-out") {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("close-out")}>
        Close out…
      </button>
    );
  }
  return (
    <div className="panel glass" style={{ marginTop: 8, display: "inline-flex", gap: 8, alignItems: "center" }}>
      <span className="sec-sub" style={{ margin: 0 }}>
        How did it end?
      </span>
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending || !hasConclusion}
        aria-busy={pending}
        title={hasConclusion ? undefined : "A conclusion is required to complete (standard §15.2)."}
        onClick={() => runArchive("completed")}
      >
        {pending && <Spinner />}
        Completed
      </button>
      <button type="button" className="btn btn-sm" disabled={pending} aria-busy={pending} onClick={() => runArchive("failed")}>
        {pending && <Spinner />}
        Failed
      </button>
      <button type="button" className="btn btn-sm" disabled={pending} aria-busy={pending} onClick={() => runArchive("cancelled")}>
        {pending && <Spinner />}
        Cancelled
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("idle")}>
        Cancel
      </button>
    </div>
  );
}
