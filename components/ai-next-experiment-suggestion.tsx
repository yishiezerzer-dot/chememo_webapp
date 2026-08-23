"use client";

import { useState } from "react";
import type { CitedAnswer } from "@/lib/llm";
import { CitedAnswerView } from "@/components/cited-answer";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";

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
  const { load, pending } = useRunAction();

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
          aria-busy={pending}
          onClick={() => {
            setFailed(false);
            load(
              () => action(experimentId),
              (r) => {
                setChecked(true);
                if (r) setResult(r);
                else setFailed(true);
              }
            );
          }}
        >
          {pending && <Spinner />}
          Suggest a next experiment
        </button>
      )}
    </div>
  );
}
