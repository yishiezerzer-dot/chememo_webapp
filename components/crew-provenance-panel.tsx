"use client";

import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type { ActionResult } from "@/lib/types";
import type { CrewProvenance } from "@/lib/ai/crew/provenance";
import type { AiSuggestion } from "@/lib/ai/suggestions";

// Mirrors lib/llm.ts's AI_SUGGESTIBLE_FIELDS (D8) — duplicated here, not
// imported, since that module pulls in server-only provider SDKs
// (openai/@anthropic-ai/sdk) that have no reason to reach the client bundle.
// Keep both lists in sync by hand, same convention as the migration's own
// CHECK constraint copy.
const AI_SUGGESTIBLE_FIELDS = new Set([
  "scientific_question", "hypothesis", "rationale", "primary_outcome",
  "secondary_outcomes", "data_analysis_plan", "risks_failure_modes",
  "conclusion", "next_steps", "observations",
]);

// T3.8 — shown only when a provenance row exists (a hand-authored experiment
// has none at all, per D8). The badge is not colour-only (amber background +
// explicit text) per T1.10; the checklist has aria-live on resolve.
// Badge persistence resolved with Yishi (2026-08-10): stays forever, softened
// once the experiment leaves draft rather than disappearing.
export function CrewProvenancePanel({
  experimentId,
  provenance,
  isDraft,
  isOwner,
  isLocked,
  resolveAction,
  aiSuggestionsByItemId,
  generateAiResolutionAction,
  resolveAiSuggestionAction,
}: {
  experimentId: string;
  provenance: CrewProvenance;
  isDraft: boolean;
  isOwner: boolean;
  // AI Field Suggestions (Feature 2, "Resolve with AI") — see
  // ChemMemo_Feature_AIFieldSuggestions_Spec.md. Optional so this component
  // still works with only the manual resolveAction wired, matching how a
  // hand-authored experiment simply omits it entirely.
  isLocked?: boolean;
  resolveAction: (experimentId: string, itemIndex: number) => Promise<ActionResult>;
  // Keyed by the unresolved item's own id, never by field name — a field can
  // legitimately appear on several items at once.
  aiSuggestionsByItemId?: Map<string, AiSuggestion>;
  generateAiResolutionAction?: (experimentId: string, itemId: string) => Promise<ActionResult>;
  resolveAiSuggestionAction?: (experimentId: string, suggestionId: string, accept: boolean) => Promise<ActionResult>;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  // pendingKey says which specific button is in flight -- `pending` alone is
  // shared by every button in this list (one hook for the whole panel), so
  // without it every button would show a spinner whenever ANY of them was
  // clicked (bug found 2026-08-17: Yishi wanted only the pressed button to
  // spin).
  const { run, pending, pendingKey } = useRunAction();

  function resolve(index: number) {
    run(() => resolveAction(experimentId, index), `resolve-${index}`);
  }

  function generateAiResolution(itemId: string) {
    run(() => generateAiResolutionAction!(experimentId, itemId), `ai-${itemId}`);
  }

  function resolveAiSuggestion(suggestionId: string, accept: boolean) {
    run(() => resolveAiSuggestionAction!(experimentId, suggestionId, accept), `${suggestionId}-${accept ? "agree" : "dismiss"}`);
  }

  return (
    <div className="obs-box glass">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          className="chip"
          style={{ background: "rgba(255,212,121,.15)", border: "1px solid var(--amber)", color: "var(--amber)" }}
        >
          {isDraft ? "AI-authored — not yet reviewed" : "AI-assisted — reviewed"}
        </span>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {provenance.model} · crew v{provenance.crewVersion}
        </span>
      </div>

      <div aria-live="polite">
        {provenance.unresolved.length === 0 ? (
          <p className="muted" style={{ fontSize: 12.5 }}>
            No open items from the AI-generated plan.
          </p>
        ) : (
          <>
            <h4 style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>
              Needs your input · {provenance.unresolved.length}
            </h4>
            <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              {provenance.unresolved.map((u, i) => {
                const aiSuggestion = aiSuggestionsByItemId?.get(u.id);
                const resolveBusy = pending && pendingKey === `resolve-${i}`;
                const aiBusy = pending && pendingKey === `ai-${u.id}`;
                return (
                  <li key={u.id}>
                    <strong>{u.field}</strong> — {u.issue}
                    {u.candidates.length > 0 && (
                      <span className="muted"> (candidates: {u.candidates.join(", ")})</span>
                    )}
                    {isOwner && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pending}
                        aria-busy={resolveBusy}
                        onClick={() => resolve(i)}
                        style={{ marginLeft: 8 }}
                      >
                        {resolveBusy && <Spinner />}
                        Resolve
                      </button>
                    )}
                    {isOwner && generateAiResolutionAction && !aiSuggestion && AI_SUGGESTIBLE_FIELDS.has(u.field) && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pending || isLocked}
                        aria-busy={aiBusy}
                        title={isLocked ? "This experiment is locked; nothing can be applied here." : undefined}
                        onClick={() => generateAiResolution(u.id)}
                        style={{ marginLeft: 8 }}
                      >
                        {aiBusy && <Spinner />}
                        Resolve with AI
                      </button>
                    )}
                    {aiSuggestion && (
                      <div className="obs-box" style={{ marginTop: 6, padding: 10 }}>
                        <p style={{ margin: "0 0 4px", fontSize: 13 }}>{aiSuggestion.suggestedValue}</p>
                        <span className="muted" style={{ fontSize: 12 }}>{aiSuggestion.rationale}</span>
                        <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                          <button
                            type="button"
                            className="btn btn-sm"
                            disabled={pending}
                            aria-busy={pending && pendingKey === `${aiSuggestion.id}-agree`}
                            onClick={() => resolveAiSuggestion(aiSuggestion.id, true)}
                          >
                            {pending && pendingKey === `${aiSuggestion.id}-agree` && <Spinner />}
                            Agree
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={pending}
                            aria-busy={pending && pendingKey === `${aiSuggestion.id}-dismiss`}
                            onClick={() => resolveAiSuggestion(aiSuggestion.id, false)}
                          >
                            {pending && pendingKey === `${aiSuggestion.id}-dismiss` && <Spinner />}
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {provenance.normalization.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>Recommended — not applied</h4>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {provenance.normalization.map((r, i) => (
              <li key={i} style={{ fontSize: 13 }}>
                <strong>{r.field}</strong>: {r.suggestion}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRawOpen((v) => !v)}>
          {rawOpen ? "Hide" : "Show"} captured input
        </button>
        {rawOpen && (
          <p className="muted" style={{ whiteSpace: "pre-wrap", fontSize: 12.5, marginTop: 8 }}>
            {provenance.rawSource}
          </p>
        )}
      </div>
    </div>
  );
}
