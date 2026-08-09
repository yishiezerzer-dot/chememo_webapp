"use client";

import { useState } from "react";
import type { Experiment } from "@/lib/types";
import type { MatchExplanation } from "@/lib/rag";

// T3.4 D3 — T3.2/T3.3 already show a citation chip + one-line "why it
// matched" per CITED source. This shows the FULL retrieved set, including
// records the model considered but didn't cite — reusing meta.results/
// meta.explanations, already fully computed server-side; no new data path.
export function EvidenceInspector({
  results,
  explanations,
}: {
  results: Experiment[];
  explanations: Record<string, MatchExplanation>;
}) {
  const [open, setOpen] = useState(false);
  if (results.length === 0) return null;

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? "Hide" : "Show"} evidence inspector · {results.length} retrieved
      </button>
      {open && (
        <div className="glass" style={{ padding: "12px 16px", marginTop: 8 }}>
          {results.map((e) => {
            const ex = explanations[e.id];
            if (!ex) return null;
            return (
              <div
                key={e.id}
                style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.08)" }}
              >
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  [{e.id}] {e.name}
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  matched via {ex.matchedVia}
                  {ex.appliedFilters.length > 0 && ` · filters: ${ex.appliedFilters.join(", ")}`}
                  {ex.semanticScore !== null && ` · semantic score ${ex.semanticScore.toFixed(3)}`}
                  {ex.sourceType && ` · source: ${ex.sourceType}/${ex.sectionType}`}
                </div>
                {ex.snippet && (
                  <p style={{ fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap" }}>{ex.snippet}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
