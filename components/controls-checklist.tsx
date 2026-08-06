"use client";

import { useState } from "react";
import type { ControlItem } from "@/lib/types";

// §8.5's checklist shape (T1.2 D3) — a template's defaults seed this list,
// but the experiment form always lets the user add ad hoc items beyond it,
// since a real bench run turns up controls no template anticipated.
export function ControlsChecklist({
  name,
  initial,
  readOnly = false,
}: {
  name: string;
  initial: ControlItem[];
  // T2.6 D6 — once an experiment has real `controls` rows, this checklist
  // becomes display-only (mirrors T2.2 D7's compounds/metals cutover): the
  // value still submits via the hidden input, but new controls are expected
  // to go through the Controls panel below instead.
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<ControlItem[]>(initial);
  const [draft, setDraft] = useState("");

  function toggle(i: number) {
    if (readOnly) return;
    setItems((cur) => cur.map((c, idx) => (idx === i ? { ...c, checked: !c.checked } : c)));
  }

  function add() {
    const label = draft.trim();
    if (!label) return;
    setItems((cur) => [...cur, { label, checked: false }]);
    setDraft("");
  }

  return (
    <div className="field">
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      <div className="controls-checklist">
        {items.map((item, i) => (
          <label key={i} className={`method-opt${item.checked ? " on" : ""}`}>
            <input type="checkbox" checked={item.checked} onChange={() => toggle(i)} style={{ display: "none" }} />
            <span className="box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" width="12" height="12">
                <path d="M5 12l4 4 10-10" />
              </svg>
            </span>
            {item.label}
            {!readOnly && (
              <b
                onClick={(e) => {
                  e.preventDefault();
                  setItems((cur) => cur.filter((_, idx) => idx !== i));
                }}
                style={{ marginLeft: 6 }}
              >
                ×
              </b>
            )}
          </label>
        ))}
      </div>
      {!readOnly && (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Add a control…"
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={add}>
            Add
          </button>
        </div>
      )}
      {readOnly && (
        <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
          Display only — use the Controls panel below to add real controls.
        </p>
      )}
    </div>
  );
}
