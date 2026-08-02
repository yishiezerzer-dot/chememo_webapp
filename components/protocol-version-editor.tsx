"use client";

import { useState } from "react";
import type { CriticalParameter, KnownFailureMode, ProtocolStep, Quantity, QuantityKind } from "@/lib/types";

type StepDraft = {
  instruction: string;
  target_ph: number | null;
  target_quantities: Record<string, Quantity>;
  target_atmosphere: string | null;
  required_material: string | null;
  safety_note: string | null;
};

function blankStep(): StepDraft {
  return {
    instruction: "",
    target_ph: null,
    target_quantities: {},
    target_atmosphere: null,
    required_material: null,
    safety_note: null,
  };
}

// §9.1's critical-parameters/known-failure-modes tables (T1.5 D2), edited as
// dynamic add/remove row lists — same convention ControlsChecklist/
// SampleMatrixEditor already established — serialized as one hidden JSON
// input each.
function ParameterTable<T extends Record<string, string>>({
  name,
  columns,
  initial,
  blank,
}: {
  name: string;
  columns: { key: keyof T; label: string }[];
  initial: T[];
  blank: T;
}) {
  const [rows, setRows] = useState<T[]>(initial);

  function update(i: number, key: keyof T, value: string) {
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  return (
    <div className="field">
      <input type="hidden" name={name} value={JSON.stringify(rows)} />
      <div style={{ overflowX: "auto" }}>
        <table className="matrix-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={String(c.key)}>{c.label}</th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={String(c.key)}>
                    <input value={row[c.key] ?? ""} onChange={(e) => update(i, c.key, e.target.value)} />
                  </td>
                ))}
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
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRows((cur) => [...cur, blank])} style={{ marginTop: 8 }}>
        + Add row
      </button>
    </div>
  );
}

function StepQuantity({
  label,
  kind,
  value,
  onChange,
}: {
  label: string;
  kind: QuantityKind | undefined;
  value: Quantity | undefined;
  onChange: (q: Quantity | undefined) => void;
}) {
  if (!kind) return null;
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <span style={{ minWidth: 90, fontSize: 13 }}>{label}</span>
      <input
        type="number"
        step="0.1"
        value={value?.value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") onChange(undefined);
          else onChange({ value: Number(v), unit_code: value?.unit_code ?? kind.canonical_unit_code });
        }}
        style={{ maxWidth: 100 }}
      />
      <select
        value={value?.unit_code ?? kind.canonical_unit_code}
        onChange={(e) => onChange(value ? { ...value, unit_code: e.target.value } : undefined)}
      >
        {kind.compatible_units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}

// §9.1's ordered procedure steps (T1.5 D3) — each step's target temperature/
// duration reuses T1.4's quantity_kinds registry rather than bespoke numeric
// columns. Serialized as one hidden JSON input; step_number is assigned
// server-side from array order (lib/protocols/service.ts).
function StepsEditor({ name, initial, quantityKinds }: { name: string; initial: StepDraft[]; quantityKinds: QuantityKind[] }) {
  const [steps, setSteps] = useState<StepDraft[]>(initial);
  const temperatureKind = quantityKinds.find((k) => k.key === "temperature");
  const durationKind = quantityKinds.find((k) => k.key === "duration");

  function update(i: number, patch: Partial<StepDraft>) {
    setSteps((cur) => cur.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function move(i: number, dir: -1 | 1) {
    setSteps((cur) => {
      const next = [...cur];
      const j = i + dir;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <div className="field">
      <input type="hidden" name={name} value={JSON.stringify(steps)} />
      {steps.map((step, i) => (
        <div key={i} className="obs-box" style={{ marginBottom: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <b>Step {i + 1}</b>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0}>
                ↑
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, 1)} disabled={i === steps.length - 1}>
                ↓
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSteps((cur) => cur.filter((_, idx) => idx !== i))}>
                Remove
              </button>
            </div>
          </div>
          <textarea
            placeholder="Instruction — e.g. 'Added 250 µL ACN to the dry residue.'"
            rows={2}
            value={step.instruction}
            onChange={(e) => update(i, { instruction: e.target.value })}
            style={{ width: "100%", marginBottom: 8 }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ minWidth: 90, fontSize: 13 }}>Target pH</span>
              <input
                type="number"
                step="0.1"
                value={step.target_ph ?? ""}
                onChange={(e) => update(i, { target_ph: e.target.value === "" ? null : Number(e.target.value) })}
                style={{ maxWidth: 100 }}
              />
            </div>
            <StepQuantity
              label="Temperature"
              kind={temperatureKind}
              value={step.target_quantities.temperature}
              onChange={(q) =>
                update(i, {
                  target_quantities: q
                    ? { ...step.target_quantities, temperature: q }
                    : Object.fromEntries(Object.entries(step.target_quantities).filter(([k]) => k !== "temperature")),
                })
              }
            />
            <StepQuantity
              label="Duration"
              kind={durationKind}
              value={step.target_quantities.duration}
              onChange={(q) =>
                update(i, {
                  target_quantities: q
                    ? { ...step.target_quantities, duration: q }
                    : Object.fromEntries(Object.entries(step.target_quantities).filter(([k]) => k !== "duration")),
                })
              }
            />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <input
              placeholder="Target atmosphere"
              value={step.target_atmosphere ?? ""}
              onChange={(e) => update(i, { target_atmosphere: e.target.value || null })}
            />
            <input
              placeholder="Required material"
              value={step.required_material ?? ""}
              onChange={(e) => update(i, { required_material: e.target.value || null })}
            />
            <input
              placeholder="Safety note"
              value={step.safety_note ?? ""}
              onChange={(e) => update(i, { safety_note: e.target.value || null })}
            />
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSteps((cur) => [...cur, blankStep()])}>
        + Add step
      </button>
    </div>
  );
}

export function ProtocolVersionEditor({
  initial,
  quantityKinds,
}: {
  initial: {
    purpose: string | null;
    scope: string | null;
    required_materials: string | null;
    equipment: string | null;
    safety_notes: string | null;
    qc_checks: string | null;
    critical_parameters: CriticalParameter[];
    known_failure_modes: KnownFailureMode[];
    steps: ProtocolStep[];
  };
  quantityKinds: QuantityKind[];
}) {
  return (
    <>
      <div className="field">
        <label>Purpose</label>
        <textarea name="purpose" rows={2} defaultValue={initial.purpose ?? ""} />
      </div>
      <div className="field">
        <label>Scope</label>
        <textarea name="scope" rows={2} defaultValue={initial.scope ?? ""} />
      </div>
      <div className="field">
        <label>Required materials</label>
        <textarea name="required_materials" rows={2} defaultValue={initial.required_materials ?? ""} />
      </div>
      <div className="field">
        <label>Equipment</label>
        <textarea name="equipment" rows={2} defaultValue={initial.equipment ?? ""} />
      </div>
      <div className="field">
        <label>Critical parameters</label>
        <ParameterTable
          name="critical_parameters"
          initial={initial.critical_parameters}
          blank={{ parameter: "", target: "", acceptable_range: "", action_if_outside: "" }}
          columns={[
            { key: "parameter", label: "Parameter" },
            { key: "target", label: "Target" },
            { key: "acceptable_range", label: "Acceptable range" },
            { key: "action_if_outside", label: "Action if outside range" },
          ]}
        />
      </div>
      <div className="field">
        <label>Safety notes</label>
        <textarea name="safety_notes" rows={2} defaultValue={initial.safety_notes ?? ""} />
      </div>
      <div className="field">
        <label>Quality-control checks</label>
        <textarea name="qc_checks" rows={2} defaultValue={initial.qc_checks ?? ""} />
      </div>
      <div className="field">
        <label>Known failure modes</label>
        <ParameterTable
          name="known_failure_modes"
          initial={initial.known_failure_modes}
          blank={{ failure_mode: "", evidence: "", likely_cause: "", corrective_action: "" }}
          columns={[
            { key: "failure_mode", label: "Failure mode" },
            { key: "evidence", label: "Evidence" },
            { key: "likely_cause", label: "Likely cause" },
            { key: "corrective_action", label: "Corrective action" },
          ]}
        />
      </div>
      <div className="field">
        <label>Steps (§9.6 — record the order as performed)</label>
        <StepsEditor
          name="steps"
          initial={initial.steps.map((s) => ({
            instruction: s.instruction,
            target_ph: s.target_ph,
            target_quantities: s.target_quantities,
            target_atmosphere: s.target_atmosphere,
            required_material: s.required_material,
            safety_note: s.safety_note,
          }))}
          quantityKinds={quantityKinds}
        />
      </div>
    </>
  );
}
