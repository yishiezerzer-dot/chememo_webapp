"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
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
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  // Already archived: nothing left for this control to do.
  if (status === "archived") return null;

  function runArchive(endedAs?: "completed" | "failed" | "cancelled") {
    start(async () => {
      const res = await archiveAction(endedAs);
      if (!res.ok) showToast(res.error, "error");
      else {
        showToast("Archived.", "success");
        router.refresh();
      }
    });
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
      <form action={deleteAction} style={{ display: "inline-flex", gap: 8 }}>
        <button
          type="submit"
          className="btn btn-sm"
          style={{ borderColor: "var(--rose)", color: "var(--rose)" }}
        >
          Confirm delete
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("idle")}>
          Cancel
        </button>
      </form>
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
        <button type="button" className="btn btn-sm" disabled={pending} onClick={() => runArchive()}>
          {pending ? "Archiving…" : "Confirm archive"}
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
        title={hasConclusion ? undefined : "A conclusion is required to complete (standard §15.2)."}
        onClick={() => runArchive("completed")}
      >
        Completed
      </button>
      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => runArchive("failed")}>
        Failed
      </button>
      <button type="button" className="btn btn-sm" disabled={pending} onClick={() => runArchive("cancelled")}>
        Cancelled
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMode("idle")}>
        Cancel
      </button>
    </div>
  );
}
