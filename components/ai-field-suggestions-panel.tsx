"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import type { ActionResult } from "@/lib/types";
import type { AiSuggestion } from "@/lib/ai/suggestions";

const FIELD_LABELS: Record<string, string> = {
  scientific_question: "Scientific question",
  hypothesis: "Hypothesis",
  rationale: "Rationale",
  primary_outcome: "Primary outcome",
  secondary_outcomes: "Secondary outcomes",
  data_analysis_plan: "Data-analysis plan",
  risks_failure_modes: "Risks and failure modes",
  conclusion: "Conclusion",
  next_steps: "Next steps",
  observations: "Observations",
};

// AI Field Suggestions (Feature 1) — see ChemMemo_Feature_AIFieldSuggestions_Spec.md.
// Shown to the owner on every experiment, not just crew-authored ones (D4).
// Opt-in, on click, never automatic (D1/D7) — matches ai-comparison-table.tsx
// and ai-next-experiment-suggestion.tsx's established "generate on click"
// convention, extended here with per-item Agree/Dismiss since a suggestion
// writes to a real field once agreed (D3), unlike those display-only assists.
export function AiFieldSuggestionsPanel({
  experimentId,
  suggestions,
  isOwner,
  isLocked,
  generateAction,
  resolveAction,
}: {
  experimentId: string;
  suggestions: AiSuggestion[];
  isOwner: boolean;
  isLocked: boolean;
  generateAction: (experimentId: string) => Promise<ActionResult>;
  resolveAction: (experimentId: string, suggestionId: string, accept: boolean) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  if (!isOwner) return null;

  function generate() {
    start(async () => {
      const res = await generateAction(experimentId);
      if (!res.ok) showToast(res.error, "error");
      else router.refresh();
    });
  }

  function resolve(suggestionId: string, accept: boolean) {
    start(async () => {
      const res = await resolveAction(experimentId, suggestionId, accept);
      if (!res.ok) showToast(res.error, "error");
      else router.refresh();
    });
  }

  return (
    <div className="obs-box glass">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <h4 style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: 0 }}>AI suggestions</h4>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending || isLocked}
          aria-busy={pending}
          title={isLocked ? "This experiment is locked; nothing can be applied here." : undefined}
          onClick={generate}
        >
          {pending && <Spinner />}
          Check for missing details
        </button>
      </div>

      <div aria-live="polite" style={{ marginTop: suggestions.length > 0 ? 10 : 0 }}>
        {suggestions.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {suggestions.map((s) => (
              <li key={s.id}>
                <strong>{FIELD_LABELS[s.field] ?? s.field}</strong>
                <p style={{ margin: "4px 0", fontSize: 13 }}>{s.suggestedValue}</p>
                <span className="muted" style={{ fontSize: 12 }}>{s.rationale}</span>
                <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={pending}
                    aria-busy={pending}
                    onClick={() => resolve(s.id, true)}
                  >
                    {pending && <Spinner />}
                    Agree
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    aria-busy={pending}
                    onClick={() => resolve(s.id, false)}
                  >
                    {pending && <Spinner />}
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
