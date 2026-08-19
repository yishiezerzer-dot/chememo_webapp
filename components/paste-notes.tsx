"use client";

import { useState } from "react";
import type { Experiment } from "@/lib/types";
import { Spinner } from "@/components/spinner";

type Extract = (notes: string) => Promise<Partial<Experiment> | null>;

export function PasteNotes({
  aiEnabled,
  extractAction,
  onExtract,
  onNotesChange,
  initialNotes,
}: {
  aiEnabled: boolean;
  extractAction: Extract;
  onExtract: (fields: Partial<Experiment>) => void;
  // T1.3 D7 — fired on every keystroke so the raw text can ride along with
  // the rest of the form's autosave, even though this textarea is a sibling
  // of <ExperimentForm>'s <form>, not a descendant of it.
  onNotesChange?: (text: string) => void;
  initialNotes?: string;
}) {
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const fields = await extractAction(notes);
      if (!fields || Object.keys(fields).length === 0) {
        setMsg("Couldn't extract fields from that text.");
        return;
      }
      onExtract(fields);
      setMsg("Fields pre-filled below — review and edit before saving.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fsec glass" style={{ marginBottom: 16 }}>
      <h3>
        <span className="sec-num">AI</span>Paste messy notes
      </h3>
      <p className="sec-sub">
        {aiEnabled
          ? "Paste raw lab notes and let AI pre-fill the form. You confirm and edit everything before saving — nothing is saved automatically."
          : "LLM-assisted entry activates in Phase 10, once API keys are added. For now, fill the form directly below."}
      </p>
      {/* Nothing sized this: it sits in .fsec, not .field, so the
          `.field textarea { width: 100% }` rule never reached it and the
          browser's ~20-column default applied — about 195px wide, with the
          placeholder truncated mid-sentence and a scrollbar after four lines.
          For the one input explicitly meant to receive a pasted page of bench
          notes, that was the worst possible default. */}
      <textarea
        rows={8}
        style={{ width: "100%" }}
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          onNotesChange?.(e.target.value);
        }}
        disabled={!aiEnabled || busy}
        placeholder="e.g. His + TGA + 5mM ZnCl2, pH 7, 60C dry-down x5 cycles, LC-MS neg, saw m/z 297, yellowing + precipitate on rehydration…"
      />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!aiEnabled || busy || !notes.trim()}
          aria-busy={busy}
          onClick={run}
        >
          {busy && <Spinner />}
          Extract fields
        </button>
        {msg && (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {msg}
          </span>
        )}
      </div>
    </div>
  );
}
