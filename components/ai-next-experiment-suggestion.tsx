"use client";

import { useState, useTransition } from "react";
import type { CitedAnswer } from "@/lib/llm";
import { CitedAnswerView } from "@/components/cited-answer";

// T3.6 D6 — reactive gap-spotting for a single experiment: opt-in (a click,
// never ambient) and display-only (never persisted), same D4 pattern as
// AiComparisonTable/AiContradictionCheck.
export function AiNextExperimentSuggestion({
  experimentId,
  action,
}: {
  experimentId: string;
  action: (experimentId: string) => Promise<CitedAnswer | null>;
}) {
  const [result, setResult] = useState<CitedAnswer | null>(null);
  const [checked, setChecked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="obs-box glass">
      <h4>Suggest a next experiment</h4>
      {result ? (
        <CitedAnswerView answer={result} />
      ) : checked ? (
        <p className="muted" style={{ fontSize: 12.5 }}>
          {failed ? "Couldn't generate a suggestion right now." : "No suggestion available."}
        </p>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setFailed(false);
              const r = await action(experimentId);
              setChecked(true);
              if (r) setResult(r);
              else setFailed(true);
            })
          }
        >
          {pending ? "Thinking…" : "Suggest a next experiment"}
        </button>
      )}
    </div>
  );
}
