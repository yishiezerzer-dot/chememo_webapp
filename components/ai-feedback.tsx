"use client";

import { useState } from "react";

// T3.4 D4 — thumbs up/down + optional note on a specific Ask answer, written
// to ai_feedback via the server action passed in. Only rendered when the
// caller has a real requestId (grounded lab-mode answers only this pass —
// streamed general-knowledge answers don't have one; see route.ts).
export function AiFeedback({
  requestId,
  action,
}: {
  requestId: string;
  action: (
    requestId: string,
    rating: "up" | "down",
    note?: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [submitted, setSubmitted] = useState<"up" | "down" | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState("");
  const [failed, setFailed] = useState(false);

  async function send(rating: "up" | "down") {
    setFailed(false);
    const res = await action(requestId, rating, note.trim() || undefined);
    if (res.ok) setSubmitted(rating);
    else setFailed(true);
  }

  if (submitted) {
    return (
      <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
        Thanks for the feedback.
      </p>
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 11.5 }}>
          Was this answer helpful?
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => send("up")}>
          Helpful
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => send("down")}>
          Not helpful
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNote((s) => !s)}>
          {showNote ? "Hide note" : "Add a note"}
        </button>
      </div>
      {showNote && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What was wrong or right about this answer? (optional)"
          rows={2}
          style={{ fontSize: 12.5, width: "100%", maxWidth: 480, marginTop: 6 }}
        />
      )}
      {failed && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
          Couldn&rsquo;t save feedback. Please try again.
        </p>
      )}
    </div>
  );
}
