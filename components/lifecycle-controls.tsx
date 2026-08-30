"use client";

import { Spinner } from "@/components/spinner";
import { useExperimentView } from "@/components/experiment-view";
import { useRunAction } from "@/lib/use-run-action";
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
  hasConclusion,
  hasAcceptanceCriteria = true,
  unresolvedOpenCount = 0,
  setStatusAction,
  completeAction,
  reviewAction,
}: {
  hasConclusion: boolean;
  // Defaults to true so a caller that hasn't been updated keeps today's
  // behaviour (the trigger still refuses), rather than silently disabling
  // Start everywhere.
  hasAcceptanceCriteria?: boolean;
  // T3.8 D4 — a crew-authored draft's own moves off 'draft' are disabled
  // here as the user-facing explanation; the DB trigger (branch g) is the
  // real backstop. Cancel is not gated: rejecting a bad AI proposal is
  // exactly what an open item should never block.
  unresolvedOpenCount?: number;
  setStatusAction: (next: ExperimentStatus) => Promise<ActionResult>;
  completeAction: () => Promise<ActionResult>;
  reviewAction: () => Promise<ActionResult>;
}) {
  const { run, pending } = useRunAction();
  const { status, patch } = useExperimentView();

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
        // §8.6 is enforced by the DB trigger, which refuses the transition
        // with a clear sentence — but only after the click. The button looked
        // perfectly available, so the rule was discoverable solely by failing
        // at it. Surfaced up front the same way the unresolved-items gate
        // already is; the trigger remains the real backstop either way.
        const needsCriteria = m.next === "in_progress" && !hasAcceptanceCriteria;
        const blocked = gated || needsCriteria;
        return (
          <button
            key={m.next}
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending || blocked}
            aria-busy={pending}
            title={
              gated
                ? `This experiment has ${unresolvedOpenCount} unresolved item${unresolvedOpenCount === 1 ? "" : "s"} from its AI-generated plan. Resolve them before starting.`
                : needsCriteria
                  ? "Write the acceptance criteria before starting — what result would count as success (standard section 8.6). Add them from Edit."
                  : undefined
            }
            onClick={() => run(() => setStatusAction(m.next), undefined, () => patch({ status: m.next }))}
          >
            {pending && <Spinner />}
            {m.label}
          </button>
        );
      })}
      {canComplete && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          aria-busy={pending}
          title={hasConclusion ? undefined : "A conclusion is required to complete (standard §15.2)."}
          onClick={() => run(completeAction, undefined, () => patch({ status: "completed" }))}
        >
          {pending && <Spinner />}
          Complete
        </button>
      )}
      {canReview && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          aria-busy={pending}
          onClick={() => run(reviewAction, undefined, () => patch({ status: "reviewed" }))}
        >
          {pending && <Spinner />}
          Mark reviewed
        </button>
      )}
    </div>
  );
}
