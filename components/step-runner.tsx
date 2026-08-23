"use client";

import { useRef, useState } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type { ActionResult, Quantity, QuantityKind } from "@/lib/types";
import type { StepDetail, DeviationInput } from "@/lib/experiment-steps/service";

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not started",
  ready: "Ready",
  in_progress: "In progress",
  blocked: "Blocked",
  waiting: "Waiting",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

function StepQuantityInput({
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
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>{label}</span>
      <input
        type="number"
        step="0.1"
        value={value?.value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? undefined : { value: Number(v), unit_code: value?.unit_code ?? kind.canonical_unit_code });
        }}
        style={{ maxWidth: 90 }}
      />
      <select value={value?.unit_code ?? kind.canonical_unit_code} onChange={(e) => onChange(value ? { ...value, unit_code: e.target.value } : undefined)}>
        {kind.compatible_units.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </select>
    </div>
  );
}

// The native <form> here submits to a plain client function (React 19's form
// action supports that, distinct from a server action) so this component can
// parse the FormData into a plain DeviationInput itself; the resulting
// object — not a FormData — is what actually crosses to the server action
// (T1.5 direct-call convention, steps-actions.ts).
function DeviationForm({
  deviationCategories,
  onSubmit,
}: {
  deviationCategories: string[];
  onSubmit: (input: DeviationInput) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        + Add deviation
      </button>
    );
  }
  return (
    <form
      action={(fd) => {
        const str = (k: string) => {
          const v = (fd.get(k) as string | null)?.trim();
          return v ? v : null;
        };
        onSubmit({
          category: str("category") ?? "",
          what_happened: str("what_happened") ?? "",
          how_discovered: str("how_discovered"),
          likely_impact: str("likely_impact"),
          sample_still_usable: fd.get("sample_still_usable") === "true" ? true : null,
          corrective_action: str("corrective_action"),
          preventive_action: str("preventive_action"),
          affected_samples: str("affected_samples"),
        });
        setOpen(false);
      }}
      style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}
    >
      <select name="category" required defaultValue="">
        <option value="" disabled>
          Deviation category…
        </option>
        {deviationCategories.map((c) => (
          <option key={c} value={c}>
            {c.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <textarea name="what_happened" placeholder="What happened?" rows={2} required />
      <input name="how_discovered" placeholder="How was it discovered?" />
      <input name="likely_impact" placeholder="Likely impact" />
      <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
        <input type="checkbox" name="sample_still_usable" value="true" /> Sample still usable
      </label>
      <input name="corrective_action" placeholder="Corrective action" />
      <input name="preventive_action" placeholder="Preventive action" />
      <input name="affected_samples" placeholder="Affected samples" />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-sm">
          Save deviation
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function StepCard({
  detail,
  quantityKinds,
  deviationCategories,
  updateStatus,
  recordObservation,
  recordDeviation,
}: {
  detail: StepDetail;
  quantityKinds: QuantityKind[];
  deviationCategories: string[];
  updateStatus: (
    stepId: string,
    status: string,
    actual: { ph: number | null; quantities: Record<string, Quantity>; atmosphere: string | null }
  ) => Promise<ActionResult>;
  recordObservation: (stepId: string, note: string) => Promise<ActionResult>;
  recordDeviation: (stepId: string, input: DeviationInput) => Promise<ActionResult>;
}) {
  const { step, protocolStep, observations, deviations } = detail;
  const { run, pending } = useRunAction();
  const [ph, setPh] = useState<number | null>(step.actual_ph);
  const [quantities, setQuantities] = useState<Record<string, Quantity>>(step.actual_quantities);
  const [atmosphere, setAtmosphere] = useState(step.actual_atmosphere ?? "");
  const noteRef = useRef<HTMLInputElement>(null);
  const temperatureKind = quantityKinds.find((k) => k.key === "temperature");
  const durationKind = quantityKinds.find((k) => k.key === "duration");

  return (
    <div className="obs-box glass" style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <b>
            Step {protocolStep.step_number}: {protocolStep.instruction}
          </b>
          <p className="sec-sub" style={{ margin: "4px 0 0" }}>
            {protocolStep.target_ph !== null && `Target pH ${protocolStep.target_ph}. `}
            {protocolStep.target_quantities.temperature &&
              `Target temp ${protocolStep.target_quantities.temperature.value} ${protocolStep.target_quantities.temperature.unit_code}. `}
            {protocolStep.target_quantities.duration &&
              `Target duration ${protocolStep.target_quantities.duration.value} ${protocolStep.target_quantities.duration.unit_code}. `}
            {protocolStep.target_atmosphere && `Atmosphere: ${protocolStep.target_atmosphere}. `}
          </p>
        </div>
        <span className="chip">{STATUS_LABEL[step.status] ?? step.status}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, margin: "10px 0" }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>Actual pH</span>
          <input
            type="number"
            step="0.1"
            value={ph ?? ""}
            onChange={(e) => setPh(e.target.value === "" ? null : Number(e.target.value))}
            style={{ maxWidth: 90 }}
          />
        </div>
        <StepQuantityInput
          label="Actual temp"
          kind={temperatureKind}
          value={quantities.temperature}
          onChange={(q) =>
            setQuantities((cur) => (q ? { ...cur, temperature: q } : Object.fromEntries(Object.entries(cur).filter(([k]) => k !== "temperature"))))
          }
        />
        <StepQuantityInput
          label="Actual duration"
          kind={durationKind}
          value={quantities.duration}
          onChange={(q) =>
            setQuantities((cur) => (q ? { ...cur, duration: q } : Object.fromEntries(Object.entries(cur).filter(([k]) => k !== "duration"))))
          }
        />
        <input
          placeholder="Actual atmosphere"
          value={atmosphere}
          onChange={(e) => setAtmosphere(e.target.value)}
          style={{ maxWidth: 160 }}
        />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          aria-busy={pending}
          onClick={() => run(() => updateStatus(step.id, "in_progress", { ph, quantities, atmosphere: atmosphere || null }))}
        >
          {pending && <Spinner />}
          Start
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          aria-busy={pending}
          onClick={() => run(() => updateStatus(step.id, "completed", { ph, quantities, atmosphere: atmosphere || null }))}
        >
          {pending && <Spinner />}
          Complete
        </button>
      </div>

      {observations.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {observations.map((o) => (
            <p key={o.id} className="sec-sub" style={{ margin: "2px 0" }}>
              {new Date(o.observed_at).toLocaleString()} — {o.note}
            </p>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input ref={noteRef} placeholder="Add an observation…" style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          aria-busy={pending}
          onClick={() => {
            const note = noteRef.current?.value.trim();
            if (!note) return;
            run(async () => {
              const res = await recordObservation(step.id, note);
              if (res.ok && noteRef.current) noteRef.current.value = "";
              return res;
            });
          }}
        >
          {pending && <Spinner />}
          Add
        </button>
      </div>

      {deviations.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {deviations.map((d) => (
            <p key={d.id} className="sec-sub" style={{ margin: "2px 0" }}>
              {d.category.replace(/_/g, " ")}: {d.what_happened}
            </p>
          ))}
        </div>
      )}
      <DeviationForm
        deviationCategories={deviationCategories}
        onSubmit={(input) => run(() => recordDeviation(step.id, input))}
      />
    </div>
  );
}

export function StepRunner({
  steps,
  quantityKinds,
  deviationCategories,
  instantiate,
  updateStatus,
  recordObservation,
  recordDeviation,
}: {
  steps: StepDetail[];
  quantityKinds: QuantityKind[];
  deviationCategories: string[];
  instantiate?: () => Promise<ActionResult>;
  updateStatus: (
    stepId: string,
    status: string,
    actual: { ph: number | null; quantities: Record<string, Quantity>; atmosphere: string | null }
  ) => Promise<ActionResult>;
  recordObservation: (stepId: string, note: string) => Promise<ActionResult>;
  recordDeviation: (stepId: string, input: DeviationInput) => Promise<ActionResult>;
}) {
  const { run, pending } = useRunAction();

  if (steps.length === 0) {
    if (!instantiate) return null;
    return (
      <button
        type="button"
        className="btn btn-sm"
        disabled={pending}
        aria-busy={pending}
        onClick={() => run(instantiate)}
      >
        {pending && <Spinner />}
        Instantiate steps
      </button>
    );
  }

  return (
    <div>
      {steps.map((detail) => (
        <StepCard
          key={detail.step.id}
          detail={detail}
          quantityKinds={quantityKinds}
          deviationCategories={deviationCategories}
          updateStatus={updateStatus}
          recordObservation={recordObservation}
          recordDeviation={recordDeviation}
        />
      ))}
    </div>
  );
}
