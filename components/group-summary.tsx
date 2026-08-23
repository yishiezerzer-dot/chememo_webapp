"use client";

import { useState } from "react";
import { CitedAnswerView } from "@/components/cited-answer";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type { CitedAnswer } from "@/lib/llm";

export function GroupSummary({
  ids,
  action,
}: {
  ids: string[];
  action: (ids: string[]) => Promise<CitedAnswer | null>;
}) {
  const [summary, setSummary] = useState<CitedAnswer | null>(null);
  const [failed, setFailed] = useState(false);
  const { load, pending } = useRunAction();

  if (summary) {
    return (
      <div className="ai-summary-card" style={{ marginBottom: 18 }}>
        <div className="ai-head">
          <span className="eyebrow">Group summary · {ids.length} experiments</span>
        </div>
        <CitedAnswerView answer={summary} />
      </div>
    );
  }

  return (
    <div style={{ margin: "4px 0 18px" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          setFailed(false);
          load(
            () => action(ids),
            (s) => {
              if (s) setSummary(s);
              else setFailed(true);
            }
          );
        }}
      >
        {pending && <Spinner />}
        {pending ? "Summarising…" : `Summarise these ${ids.length} experiments`}
      </button>
      {failed && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          Couldn&rsquo;t generate a summary right now.
        </p>
      )}
    </div>
  );
}
