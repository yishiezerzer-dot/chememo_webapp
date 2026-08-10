"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import type { ActionResult, ExperimentStatus } from "@/lib/types";

// Mirrors the DB trigger's legal-transition table (migration
// 20260730120000_experiment_lifecycle.sql) so the buttons shown are never a
// move the trigger would reject — but the trigger remains the real gate.
const NEXT_MOVES: Record<ExperimentStatus, { label: string; next: ExperimentStatus }[]> = {
  draft: [
    { label: "Plan", next: "planned" },
    { label: "Start", next: "in_progress" },
    { label: "Cancel", next: "cancelled" },
  ],
  planned: [
    { label: "Back to draft", next: "draft" },
    { label: "Start", next: "in_progress" },
    { label: "Cancel", next: "cancelled" },
  ],
  in_progress: [
    { label: "Pause", next: "paused" },
    { label: "Mark failed", next: "failed" },
  ],
  paused: [
    { label: "Resume", next: "in_progress" },
    { label: "Mark failed", next: "failed" },
    { label: "Cancel", next: "cancelled" },
  ],
  completed: [],
  reviewed: [],
  archived: [],
  failed: [],
  cancelled: [],
};

export function LifecycleControls({
  status,
  hasConclusion,
  unresolvedOpenCount = 0,
  setStatusAction,
  completeAction,
  reviewAction,
}: {
  status: ExperimentStatus | null;
  hasConclusion: boolean;
  // T3.8 D4 — a crew-authored draft's own moves off 'draft' are disabled
  // here as the user-facing explanation; the DB trigger (branch g) is the
  // real backstop. Cancel is not gated: rejecting a bad AI proposal is
  // exactly what an open item should never block.
  unresolvedOpenCount?: number;
  setStatusAction: (next: ExperimentStatus) => Promise<ActionResult>;
  completeAction: () => Promise<ActionResult>;
  reviewAction: () => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error, "error");
      // revalidatePath (called server-side by the action) only marks the
      // route stale; a direct action call (not a <form action> submit)
      // needs this to actually re-fetch and show the new status.
      else router.refresh();
    });
  }

  // A legacy null-status row is classified through the Edit page's first
  // save, not here (§19.4 — name the gap rather than guessing a state).
  if (status === null) return null;

  const moves = NEXT_MOVES[status];
  const canComplete = status === "in_progress";
  const canReview = status === "completed";
  if (moves.length === 0 && !canComplete && !canReview) return null;

  return (
    <div className="filter-chips">
      {moves.map((m) => {
        const gated = status === "draft" && m.next !== "cancelled" && unresolvedOpenCount > 0;
        return (
          <button
            key={m.next}
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending || gated}
            title={
              gated
                ? `This experiment has ${unresolvedOpenCount} unresolved item${unresolvedOpenCount === 1 ? "" : "s"} from its AI-generated plan. Resolve them before starting.`
                : undefined
            }
            onClick={() => run(() => setStatusAction(m.next))}
          >
            {m.label}
          </button>
        );
      })}
      {canComplete && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          title={hasConclusion ? undefined : "A conclusion is required to complete (standard §15.2)."}
          onClick={() => run(completeAction)}
        >
          Complete
        </button>
      )}
      {canReview && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={() => run(reviewAction)}
        >
          Mark reviewed
        </button>
      )}
    </div>
  );
}
