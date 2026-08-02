"use client";

import { useState } from "react";
import type { Quantity, QuantityKind } from "@/lib/types";

// T1.4 D1/D4 — replaces the plain temperature/concentration text inputs.
// Temperature is a single value+unit pair; concentration is a list of named
// kinds (§13.2 — a bare number isn't a concentration, the basis must be
// picked first), since the old single free-text field could never honestly
// hold what's actually several distinct facts at once.
export function QuantitiesEditor({
  initial,
  kinds,
}: {
  initial: Record<string, Quantity>;
  kinds: QuantityKind[];
}) {
  const [quantities, setQuantities] = useState<Record<string, Quantity>>(initial);
  const temperatureKind = kinds.find((k) => k.key === "temperature");
  const concentrationKinds = kinds.filter((k) => k.category === "concentration");
  const activeConcentrationKeys = Object.keys(quantities).filter((k) =>
    concentrationKinds.some((ck) => ck.key === k)
  );
  const availableToAdd = concentrationKinds.filter((k) => !activeConcentrationKeys.includes(k.key));

  function setQuantity(key: string, value: number | null, unitCode: string) {
    setQuantities((cur) => {
      const next = { ...cur };
      if (value === null || Number.isNaN(value)) delete next[key];
      else next[key] = { value, unit_code: unitCode };
      return next;
    });
  }

  function removeQuantity(key: string) {
    setQuantities((cur) => {
      const next = { ...cur };
      delete next[key];
      return next;
    });
  }

  return (
    <>
      <input type="hidden" name="quantities" value={JSON.stringify(quantities)} />
      {temperatureKind && (
        <div className="field">
          <label>Temperature</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="number"
              step="0.1"
              value={quantities.temperature?.value ?? ""}
              onChange={(e) =>
                setQuantity(
                  "temperature",
                  e.target.value === "" ? null : Number(e.target.value),
                  quantities.temperature?.unit_code ?? temperatureKind.canonical_unit_code
                )
              }
              placeholder="60"
            />
            <select
              value={quantities.temperature?.unit_code ?? temperatureKind.canonical_unit_code}
              onChange={(e) => setQuantity("temperature", quantities.temperature?.value ?? null, e.target.value)}
            >
              {temperatureKind.compatible_units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="field">
        <label>Concentrations</label>
        {activeConcentrationKeys.map((key) => {
          const kind = concentrationKinds.find((k) => k.key === key)!;
          const q = quantities[key];
          return (
            <div key={key} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
              <span style={{ minWidth: 220 }}>{kind.label}</span>
              <input
                type="number"
                step="0.01"
                value={q.value}
                onChange={(e) => setQuantity(key, Number(e.target.value), q.unit_code)}
              />
              <select value={q.unit_code} onChange={(e) => setQuantity(key, q.value, e.target.value)}>
                {kind.compatible_units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeQuantity(key)}>
                Remove
              </button>
            </div>
          );
        })}
        {availableToAdd.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const kind = availableToAdd.find((k) => k.key === e.target.value);
              if (kind) setQuantities((cur) => ({ ...cur, [kind.key]: { value: 0, unit_code: kind.canonical_unit_code } }));
            }}
          >
            <option value="">+ Add a concentration…</option>
            {availableToAdd.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </>
  );
}
