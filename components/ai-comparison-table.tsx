"use client";

import { useState, useTransition } from "react";
import type { ComparisonTableSuggestion } from "@/lib/llm";

// T3.6 D2 — condition/result table generation. Same opt-in button pattern as
// GroupSummary: nothing generates until the human clicks, and the output is
// display-only (never auto-saved) — that click IS the "confirmation" the
// acceptance criterion asks for (see the spec's D4).
export function AiComparisonTable({
  ids,
  action,
}: {
  ids: string[];
  action: (ids: string[]) => Promise<ComparisonTableSuggestion | null>;
}) {
  const [table, setTable] = useState<ComparisonTableSuggestion | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  if (table) {
    return (
      <div className="ai-summary-card" style={{ marginBottom: 18 }}>
        <div className="ai-head">
          <span className="eyebrow">AI comparison table</span>
        </div>
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <div className="table-scroll-inner" tabIndex={0} role="region" aria-label="AI-generated comparison table, scrollable">
            <table className="exp-table">
              <thead>
                <tr>
                  <th>Experiment</th>
                  {table.columns.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r) => (
                  <tr key={r.experimentId}>
                    <td className="td-id">
                      <a href={`/experiments/${r.experimentId}`}>{r.experimentId}</a>
                    </td>
                    {table.columns.map((_, i) => (
                      <td key={i}>{r.values[i] ?? "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ margin: "4px 0 18px" }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setFailed(false);
            const t = await action(ids);
            if (t) setTable(t);
            else setFailed(true);
          })
        }
      >
        {pending ? "Generating…" : "Generate comparison table"}
      </button>
      {failed && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
          Couldn&rsquo;t generate a comparison table right now.
        </p>
      )}
    </div>
  );
}
