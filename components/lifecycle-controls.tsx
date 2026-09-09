"use client";

import { useRef, useState } from "react";
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

// §8.6 permits committing to *not* pre-committing, so long as you do it before
// seeing the data and it is then locked like any other answer. The old form's
// placeholder already said "None — exploratory", but the trigger demands
// non-blank, so an honest exploratory experiment had to write prose to satisfy
// a gate. One button, same guarantee.
const EXPLORATORY = "Exploratory — no pre-specified acceptance criteria.";

// The one-question prompt that replaces a disabled button and a tooltip
// telling you to go and find a field on another page.
function GatePrompt({
  question,
  hint,
  cta,
  pending,
  onSubmit,
  onCancel,
  extraAction,
  onDraft,
}: {
  question: string;
  hint: string;
  cta: string;
  pending: boolean;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  extraAction?: { label: string; onClick: () => void };
  /** Absent without an AI key — the box is then simply empty, as it always was. */
  onDraft?: () => Promise<string | null>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [drafting, setDrafting] = useState(false);
  return (
    // No aria-label on the wrapper: the textarea below carries it, and
    // duplicating it here made the accessible name ambiguous (two elements
    // answering to the same label).
    <div className="obs-box glass" style={{ marginTop: 8, maxWidth: 560 }}>
      <b style={{ fontSize: 13.5 }}>{question}</b>
      <p className="sec-sub" style={{ margin: "2px 0 6px" }}>{hint}</p>
      <textarea ref={ref} rows={2} aria-label={question} style={{ width: "100%" }} autoFocus />
      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          aria-busy={pending}
          onClick={() => onSubmit(ref.current?.value ?? "")}
        >
          {pending && <Spinner />}
          {cta}
        </button>
        {onDraft && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending || drafting}
            aria-busy={drafting}
            onClick={async () => {
              setDrafting(true);
              try {
                // Fills the box. Never submits: the answer to "how will you
                // know this worked" is a commitment, and one nobody
                // consciously made is worthless.
                const draft = await onDraft();
                if (draft && ref.current) ref.current.value = draft;
              } finally {
                setDrafting(false);
              }
            }}
          >
            {drafting && <Spinner />}
            Draft from the log
          </button>
        )}
        {extraAction && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={extraAction.onClick}>
            {extraAction.label}
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function LifecycleControls({
  hasConclusion,
  hasAcceptanceCriteria = true,
  unresolvedOpenCount = 0,
  setStatusAction,
  startAction,
  completeAction,
  reviewAction,
  draftGateAnswer,
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
  startAction: (criteria?: string) => Promise<ActionResult>;
  completeAction: (conclusion?: string) => Promise<ActionResult>;
  reviewAction: () => Promise<ActionResult>;
  draftGateAnswer?: (field: "acceptance_criteria" | "conclusion") => Promise<string | null>;
}) {
  const { run, pending } = useRunAction();
  const { status, patch } = useExperimentView();
  const [asking, setAsking] = useState<null | "start" | "complete">(null);

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
        const isStart = m.next === "in_progress";
        return (
          <button
            key={m.next}
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending || gated}
            aria-busy={pending}
            title={
              gated
                ? `This experiment has ${unresolvedOpenCount} unresolved item${unresolvedOpenCount === 1 ? "" : "s"} from its AI-generated plan. Resolve them before starting.`
                : undefined
            }
            onClick={() => {
              // Starting used to be disabled with a tooltip telling you to go
              // to Edit and find the acceptance-criteria field among thirty
              // others, so the rule was discoverable only by failing at it.
              // Now the button asks the question.
              if (isStart && !hasAcceptanceCriteria) {
                setAsking("start");
                return;
              }
              if (isStart) {
                run(() => startAction(), undefined, () => patch({ status: "in_progress" }));
                return;
              }
              run(() => setStatusAction(m.next), undefined, () => patch({ status: m.next }));
            }}
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
          onClick={() => {
            if (!hasConclusion) {
              setAsking("complete");
              return;
            }
            run(() => completeAction(), undefined, () => patch({ status: "completed" }));
          }}
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

      {asking === "start" && (
        <GatePrompt
          question="How will you know this worked?"
          hint="Locked once you start — this is the goalpost, and it cannot be moved after you see the result (§8.6)."
          cta="Start"
          pending={pending}
          onDraft={draftGateAnswer ? () => draftGateAnswer("acceptance_criteria") : undefined}
          onCancel={() => setAsking(null)}
          extraAction={{
            label: "No pre-set criteria — exploratory",
            onClick: () =>
              run(() => startAction(EXPLORATORY), undefined, () => {
                setAsking(null);
                patch({ status: "in_progress" });
              }),
          }}
          onSubmit={(text) =>
            run(() => startAction(text), undefined, () => {
              setAsking(null);
              patch({ status: "in_progress" });
            })
          }
        />
      )}

      {asking === "complete" && (
        <GatePrompt
          question="What did you find?"
          hint="Required to complete (§15.2). One or two sentences is plenty — the detail is in the log."
          cta="Complete"
          pending={pending}
          onDraft={draftGateAnswer ? () => draftGateAnswer("conclusion") : undefined}
          onCancel={() => setAsking(null)}
          onSubmit={(text) =>
            run(() => completeAction(text), undefined, () => {
              setAsking(null);
              patch({ status: "completed" });
            })
          }
        />
      )}
    </div>
  );
}
