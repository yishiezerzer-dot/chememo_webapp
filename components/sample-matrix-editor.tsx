"use client";

import { useState } from "react";
import type { SampleMatrixRow } from "@/lib/types";

// §8.2's 19 required columns, in the standard's own order. sample_type/
// reaction_mode/status are the three columns backed by a controlled
// vocabulary (T1.2 D2) — everything else is free text, same as the rest of
// the experiment form pending T1.4's unit work.
const TEXT_COLUMNS: { key: keyof SampleMatrixRow; label: string }[] = [
  { key: "sample_id", label: "Sample ID" },
  { key: "vial_label", label: "Vial label" },
  { key: "legacy_code", label: "Legacy code" },
  { key: "batch", label: "Batch" },
  { key: "replicate", label: "Replicate" },
  { key: "component_1", label: "Component 1" },
  { key: "amount_1", label: "Amount 1" },
  { key: "component_2", label: "Component 2" },
  { key: "amount_2", label: "Amount 2" },
  { key: "ratio", label: "Ratio" },
  { key: "initial_volume", label: "Initial volume" },
  { key: "temperature", label: "Temperature" },
  { key: "duration", label: "Duration" },
  { key: "atmosphere", label: "Atmosphere" },
  { key: "treatment", label: "Treatment" },
  { key: "planned_analysis", label: "Planned analysis" },
];

const BLANK_ROW: SampleMatrixRow = {
  sample_id: "",
  vial_label: "",
  legacy_code: "",
  batch: "",
  replicate: "",
  sample_type: "",
  component_1: "",
  amount_1: "",
  component_2: "",
  amount_2: "",
  ratio: "",
  initial_volume: "",
  reaction_mode: "",
  temperature: "",
  duration: "",
  atmosphere: "",
  treatment: "",
  planned_analysis: "",
  status: "",
};

export function SampleMatrixEditor({
  name,
  initial,
  sampleTypes,
  reactionModes,
  sampleStatuses,
}: {
  name: string;
  initial: SampleMatrixRow[];
  sampleTypes: string[];
  reactionModes: string[];
  sampleStatuses: string[];
}) {
  const [rows, setRows] = useState<SampleMatrixRow[]>(initial.length ? initial : []);

  function update(i: number, key: keyof SampleMatrixRow, value: string) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  return (
    <div className="field">
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      <div
        className="table-scroll-inner"
        tabIndex={0}
        role="region"
        aria-label="Sample matrix, scrollable"
        style={{ overflowX: "auto" }}
      >
        <table className="sample-matrix-table">
          <thead>
            <tr>
              {TEXT_COLUMNS.slice(0, 5).map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>Sample type</th>
              {TEXT_COLUMNS.slice(5, 11).map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>Reaction mode</th>
              {TEXT_COLUMNS.slice(11).map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {TEXT_COLUMNS.slice(0, 5).map((c) => (
                  <td key={c.key}>
                    <input value={row[c.key]} onChange={(e) => update(i, c.key, e.target.value)} />
                  </td>
                ))}
                <td>
                  <select value={row.sample_type} onChange={(e) => update(i, "sample_type", e.target.value)}>
                    <option value="">—</option>
                    {sampleTypes.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                {TEXT_COLUMNS.slice(5, 11).map((c) => (
                  <td key={c.key}>
                    <input value={row[c.key]} onChange={(e) => update(i, c.key, e.target.value)} />
                  </td>
                ))}
                <td>
                  <select value={row.reaction_mode} onChange={(e) => update(i, "reaction_mode", e.target.value)}>
                    <option value="">—</option>
                    {reactionModes.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                {TEXT_COLUMNS.slice(11).map((c) => (
                  <td key={c.key}>
                    <input value={row[c.key]} onChange={(e) => update(i, c.key, e.target.value)} />
                  </td>
                ))}
                <td>
                  <select value={row.status} onChange={(e) => update(i, "status", e.target.value)}>
                    <option value="">—</option>
                    {sampleStatuses.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRows((cur) => cur.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        style={{ marginTop: 8 }}
        onClick={() => setRows((cur) => [...cur, { ...BLANK_ROW }])}
      >
        + Add sample row
      </button>
    </div>
  );
}
