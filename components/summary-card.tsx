"use client";

import { useState } from "react";
import { Spinner } from "@/components/spinner";

type Props = {
  aiEnabled: boolean;
  summary: { summary: string; model: string | null; created_at: string } | null;
  action: () => void | Promise<void>;
};

export function SummaryCard({ aiEnabled, summary, action }: Props) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="ai-summary-card">
      <div className="ai-head">
        <h4>AI summary</h4>
      </div>

      {summary ? (
        <>
          <p>{summary.summary}</p>
          <div className="confidence">
            <span>
              {summary.model ?? "model"} ·{" "}
              {new Date(summary.created_at).toLocaleDateString()}
            </span>
          </div>
        </>
      ) : (
        <p className="muted" style={{ fontSize: 12.5 }}>
          {aiEnabled
            ? "No summary yet — generate a grounded summary from this record."
            : "Grounded AI summaries activate in Phase 10, once API keys are added."}
        </p>
      )}

      {aiEnabled && (
        <form
          action={async () => {
            setBusy(true);
            try {
              await action();
            } finally {
              setBusy(false);
            }
          }}
          style={{ marginTop: 12 }}
        >
          <button
            type="submit"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            aria-busy={busy}
            style={{ width: "100%", justifyContent: "center" }}
          >
            {busy && <Spinner />}
            {summary ? "Regenerate" : "Generate summary"}
          </button>
        </form>
      )}
    </div>
  );
}
