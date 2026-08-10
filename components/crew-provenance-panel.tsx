"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import type { ActionResult } from "@/lib/types";
import type { CrewProvenance } from "@/lib/ai/crew/provenance";

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
  resolveAction,
}: {
  experimentId: string;
  provenance: CrewProvenance;
  isDraft: boolean;
  isOwner: boolean;
  resolveAction: (experimentId: string, itemIndex: number) => Promise<ActionResult>;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function resolve(index: number) {
    start(async () => {
      const res = await resolveAction(experimentId, index);
      if (!res.ok) showToast(res.error, "error");
      else router.refresh();
    });
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
              {provenance.unresolved.map((u, i) => (
                <li key={i}>
                  <strong>{u.field}</strong> — {u.issue}
                  {u.candidates.length > 0 && (
                    <span className="muted"> (candidates: {u.candidates.join(", ")})</span>
                  )}
                  {isOwner && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={pending}
                      onClick={() => resolve(i)}
                      style={{ marginLeft: 8 }}
                    >
                      Resolve
                    </button>
                  )}
                </li>
              ))}
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
