"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import { totalVolumeLiters } from "@/lib/stoichiometry/calculate";
import type {
  ActionResult,
  ExperimentMaterialInput,
  ExperimentMaterialOutput,
  InputSourceType,
  Material,
  Quantity,
  QuantityKind,
} from "@/lib/types";

type LotStockOption = { id: string; source_type: InputSourceType; label: string };

// T2.4 D4 — molar ratio for the reactant/substrate-role inputs, e.g.
// "L-Lac:L-Pro = 5:1 mol/mol" (§6.6). Computed live from each input's
// already-stored moles, normalized against the smallest value — never
// persisted, so there's no separate cache to keep in sync.
function molarRatioLabel(inputs: ExperimentMaterialInput[], lotStockOptions: LotStockOption[]): string | null {
  const consumed = inputs.filter((i) => (i.role === "reactant" || i.role === "substrate") && i.moles !== null && i.moles > 0);
  if (consumed.length < 2) return null;
  const minMoles = Math.min(...consumed.map((i) => i.moles!));
  const parts = consumed.map((i) => {
    const label = lotStockOptions.find((o) => o.id === i.source_id)?.label ?? i.source_id;
    const shortLabel = label.split(" — ")[0];
    return { shortLabel, ratio: i.moles! / minMoles };
  });
  return parts.map((p) => `${p.shortLabel}`).join(":") + " = " + parts.map((p) => p.ratio.toFixed(2)).join(":") + " mol/mol";
}

export function InputsOutputsPanel({
  inputs,
  outputs,
  lotStockOptions,
  materials,
  materialRoles,
  outputRoles,
  quantityKinds,
  addInput,
  removeInput,
  addOutput,
  removeOutput,
  recalculate,
}: {
  inputs: ExperimentMaterialInput[];
  outputs: ExperimentMaterialOutput[];
  lotStockOptions: LotStockOption[];
  materials: Material[];
  materialRoles: string[];
  outputRoles: string[];
  quantityKinds: QuantityKind[];
  addInput: (sourceType: InputSourceType, sourceId: string, role: string, quantities: Record<string, Quantity>, notes: string) => Promise<ActionResult>;
  removeInput: (inputId: string) => Promise<ActionResult>;
  addOutput: (materialId: string | null, materialName: string, role: string, quantities: Record<string, Quantity>, notes: string) => Promise<ActionResult>;
  removeOutput: (outputId: string) => Promise<ActionResult>;
  recalculate: () => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  const massKind = quantityKinds.find((k) => k.key === "input_amount_mass");
  const volumeKind = quantityKinds.find((k) => k.key === "input_amount_volume");
  const purityKind = quantityKinds.find((k) => k.key === "purity");

  const [inputSource, setInputSource] = useState("");
  const [inputRole, setInputRole] = useState(materialRoles[0] ?? "");
  const [inputAmountValue, setInputAmountValue] = useState("");
  const [inputAmountUnit, setInputAmountUnit] = useState(massKind?.canonical_unit_code ?? "g");
  const [inputPurity, setInputPurity] = useState("");

  const [outputMaterial, setOutputMaterial] = useState("");
  const [outputName, setOutputName] = useState("");
  const [outputRole, setOutputRole] = useState(outputRoles[0] ?? "product");
  const [outputAmountValue, setOutputAmountValue] = useState("");
  const [outputAmountUnit, setOutputAmountUnit] = useState(massKind?.canonical_unit_code ?? "g");

  function run(action: () => Promise<ActionResult>, key: string) {
    setPendingKey(key);
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error, "error");
      else router.refresh();
    });
  }

  const amountUnitOptions = [...(massKind?.compatible_units ?? []), ...(volumeKind?.compatible_units ?? [])];

  function amountQuantities(value: string, unit: string): Record<string, Quantity> {
    if (!value) return {};
    const isMass = massKind?.compatible_units.includes(unit);
    return { [isMass ? "input_amount_mass" : "input_amount_volume"]: { value: Number(value), unit_code: unit } };
  }

  const ratioLabel = molarRatioLabel(inputs, lotStockOptions);
  // null when an input's unit could not be converted: the total is then
  // unknown rather than zero, and showing nothing beats showing too little.
  const totalVolumeL = totalVolumeLiters(inputs);
  const showVolume = totalVolumeL !== null && totalVolumeL > 0;

  return (
    <div className="obs-box glass">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ margin: 0 }}>Inputs &amp; outputs</h4>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} aria-busy={pending && pendingKey === "recalculate"} onClick={() => run(recalculate, "recalculate")}>
          {pending && pendingKey === "recalculate" && <Spinner />}
          Recalculate stoichiometry
        </button>
      </div>
      {(ratioLabel || showVolume) && (
        <p className="muted" style={{ fontSize: 12.5, margin: "6px 0 12px" }}>
          {ratioLabel && <>{ratioLabel}</>}
          {ratioLabel && showVolume && " · "}
          {showVolume && <>Total volume: {(totalVolumeL * 1000).toFixed(3)} mL</>}
        </p>
      )}

      {inputs.length === 0 ? (
        <p className="muted" style={{ margin: "0 0 12px" }}>
          No inputs recorded.
        </p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {inputs.map((i) => {
            const option = lotStockOptions.find((o) => o.id === i.source_id);
            const amount = i.quantities?.input_amount_mass ?? i.quantities?.input_amount_volume;
            return (
              <div key={i.id} className="act-row">
                <span className="act-dot"></span>
                <span style={{ fontSize: 13 }}>
                  <b>{i.role}</b>: {option?.label ?? i.source_id}
                  {amount && ` — ${amount.value} ${amount.unit_code}`}
                  {i.quantities?.purity && ` (${i.quantities.purity.value}% purity)`}
                  {i.moles !== null && ` — ${i.moles.toPrecision(4)} mol`}
                  {i.equivalents !== null && ` (${i.equivalents.toFixed(2)} eq)`}
                </span>
                {i.is_limiting_reagent && <span className="chip">limiting reagent</span>}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: "auto" }}
                  disabled={pending}
                  aria-busy={pending && pendingKey === i.id}
                  onClick={() => run(() => removeInput(i.id), i.id)}
                >
                  {pending && pendingKey === i.id && <Spinner />}
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={inputSource} onChange={(e) => setInputSource(e.target.value)}>
          <option value="">Pick a lot or stock…</option>
          {lotStockOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={inputRole} onChange={(e) => setInputRole(e.target.value)}>
          {materialRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input type="number" step="0.01" placeholder="Amount" value={inputAmountValue} onChange={(e) => setInputAmountValue(e.target.value)} style={{ width: 90 }} />
        <select value={inputAmountUnit} onChange={(e) => setInputAmountUnit(e.target.value)}>
          {amountUnitOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <input type="number" step="0.1" placeholder="Purity %" value={inputPurity} onChange={(e) => setInputPurity(e.target.value)} style={{ width: 90 }} />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending || !inputSource}
          aria-busy={pending && pendingKey === "add-input"}
          onClick={() => {
            const option = lotStockOptions.find((o) => o.id === inputSource);
            if (!option) return;
            const quantities = amountQuantities(inputAmountValue, inputAmountUnit);
            if (inputPurity && purityKind) quantities.purity = { value: Number(inputPurity), unit_code: "%" };
            run(async () => {
              const res = await addInput(option.source_type, option.id, inputRole, quantities, "");
              if (res.ok) {
                setInputSource("");
                setInputAmountValue("");
                setInputPurity("");
              }
              return res;
            }, "add-input");
          }}
        >
          {pending && pendingKey === "add-input" && <Spinner />}
          + Add input
        </button>
      </div>

      <h4 style={{ fontSize: 13, color: "var(--ink-mute)", margin: "0 0 8px" }}>Outputs</h4>
      {outputs.length === 0 ? (
        <p className="muted" style={{ margin: "0 0 12px" }}>
          No outputs recorded.
        </p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {outputs.map((o) => {
            const amount = o.quantities?.input_amount_mass ?? o.quantities?.input_amount_volume;
            return (
              <div key={o.id} className="act-row">
                <span className="act-dot"></span>
                <span style={{ fontSize: 13 }}>
                  <b>{o.role}</b>: {o.material_name ?? materials.find((m) => m.id === o.material_id)?.preferred_name ?? "Material"}
                  {amount && ` — ${amount.value} ${amount.unit_code}`}
                  {o.theoretical_yield_mass !== null && ` — theoretical ${o.theoretical_yield_mass.toPrecision(4)} g`}
                  {o.percent_yield !== null && ` (${o.percent_yield.toFixed(1)}% yield)`}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: "auto" }}
                  disabled={pending}
                  aria-busy={pending && pendingKey === o.id}
                  onClick={() => run(() => removeOutput(o.id), o.id)}
                >
                  {pending && pendingKey === o.id && <Spinner />}
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={outputMaterial} onChange={(e) => setOutputMaterial(e.target.value)}>
          <option value="">Registered material…</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.preferred_name}
            </option>
          ))}
        </select>
        <input placeholder="or free-text name" value={outputName} onChange={(e) => setOutputName(e.target.value)} style={{ maxWidth: 160 }} />
        <select value={outputRole} onChange={(e) => setOutputRole(e.target.value)}>
          {outputRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <input type="number" step="0.01" placeholder="Amount" value={outputAmountValue} onChange={(e) => setOutputAmountValue(e.target.value)} style={{ width: 90 }} />
        <select value={outputAmountUnit} onChange={(e) => setOutputAmountUnit(e.target.value)}>
          {amountUnitOptions.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending || (!outputMaterial && !outputName.trim())}
          aria-busy={pending && pendingKey === "add-output"}
          onClick={() =>
            run(async () => {
              const res = await addOutput(
                outputMaterial || null,
                outputName,
                outputRole,
                amountQuantities(outputAmountValue, outputAmountUnit),
                ""
              );
              if (res.ok) {
                setOutputMaterial("");
                setOutputName("");
                setOutputAmountValue("");
              }
              return res;
            }, "add-output")
          }
        >
          {pending && pendingKey === "add-output" && <Spinner />}
          + Add output
        </button>
      </div>
    </div>
  );
}
