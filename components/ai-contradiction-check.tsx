"use client";

import { useState, useTransition } from "react";
import type { Experiment } from "@/lib/types";
import type { CitedAnswer } from "@/lib/llm";
import { CitedAnswerView } from "@/components/cited-answer";
import { Spinner } from "@/components/spinner";

// T3.6 D3 — two parts: (a) missing controls, deterministic and free — any
// experiment in the set with zero recorded controls, straight from the
// controlsCounts data both comparison pages already fetch (a disclosed
// simplification of T2.6's full per-program-type requiredControlsPresent,
// which needs a hasConditionProgram signal neither page currently plumbs);
// (b) contradictions, an opt-in AI pass over the same experiment set,
// reusing T3.2's exact citation scheme/validation. Both are gated behind the
// same "checked" click (not shown ambiently on load) — consistent with D4's
// "opt-in, nothing renders automatically" design, and avoids duplicating an
// experiment ID's exact visible text that ComparisonTable's own ID column
// already renders on the same page.
export function AiContradictionCheck({
  experiments,
  controlsCounts,
  action,
}: {
  experiments: Experiment[];
  controlsCounts: Record<string, number>;
  action: (ids: string[]) => Promise<CitedAnswer | null>;
}) {
  const [result, setResult] = useState<CitedAnswer | null>(null);
  const [checked, setChecked] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  const missingControls = experiments.filter((e) => (controlsCounts[e.id] ?? 0) === 0);

  return (
    <div style={{ margin: "4px 0 18px" }}>
      {checked && missingControls.length > 0 && (
        <div className="ai-summary-card" style={{ marginBottom: 12, borderColor: "var(--amber)" }}>
          <div className="ai-head">
            <span className="eyebrow" style={{ color: "var(--amber)" }}>
              Missing controls
            </span>
          </div>
          <p style={{ fontSize: 12.5, marginTop: 6 }}>
            No controls recorded for:{" "}
            {missingControls.map((e, i) => (
              <span key={e.id}>
                {i > 0 && ", "}
                <a href={`/experiments/${e.id}`} className="td-id">
                  {e.id}
                </a>
              </span>
            ))}
          </p>
        </div>
      )}

      {result ? (
        <div className="ai-summary-card" style={{ marginBottom: 18 }}>
          <div className="ai-head">
            <span className="eyebrow">Contradiction check</span>
          </div>
          <CitedAnswerView answer={result} />
        </div>
      ) : checked ? (
        <p className="muted" style={{ fontSize: 12.5 }}>
          {failed ? "Couldn't run the contradiction check right now." : "No apparent contradictions found."}
        </p>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending || experiments.length < 2}
          aria-busy={pending}
          onClick={() =>
            start(async () => {
              setFailed(false);
              const r = await action(experiments.map((e) => e.id));
              setChecked(true);
              if (r) setResult(r);
              else setFailed(true);
            })
          }
        >
          {pending && <Spinner />}
          Check for contradictions & missing controls
        </button>
      )}
    </div>
  );
}
