"use client";

import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type { ConditionProgramTemplate, QuantityKind, Quantity } from "@/lib/types";
import { createConditionProgramTemplateAction } from "@/app/(app)/condition-programs/actions";

function QuantityRow({
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
    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
      <span style={{ minWidth: 160, fontSize: 13 }}>{label}</span>
      <input
        type="number"
        step="0.01"
        value={value?.value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : { value: Number(e.target.value), unit_code: value?.unit_code ?? kind.canonical_unit_code })
        }
        style={{ width: 110 }}
      />
      <select
        value={value?.unit_code ?? kind.canonical_unit_code}
        onChange={(e) => onChange(value ? { ...value, unit_code: e.target.value } : { value: 0, unit_code: e.target.value })}
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

export function ConditionProgramsClient({
  templates,
  quantityKinds,
}: {
  templates: ConditionProgramTemplate[];
  quantityKinds: QuantityKind[];
}) {
  const { run, pending } = useRunAction();
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [cycleCount, setCycleCount] = useState("");
  const [atmosphere, setAtmosphere] = useState("");
  const [humidity, setHumidity] = useState("");
  const [vessel, setVessel] = useState("");
  const [agitation, setAgitation] = useState("");
  const [samplingPoints, setSamplingPoints] = useState("");
  const [notes, setNotes] = useState("");
  const [wetTemp, setWetTemp] = useState<Quantity | undefined>();
  const [dryTemp, setDryTemp] = useState<Quantity | undefined>();
  const [wetDuration, setWetDuration] = useState<Quantity | undefined>();
  const [dryDuration, setDryDuration] = useState<Quantity | undefined>();
  const [startingVolume, setStartingVolume] = useState<Quantity | undefined>();
  const [rehydrationVolume, setRehydrationVolume] = useState<Quantity | undefined>();

  const kind = (key: string) => quantityKinds.find((k) => k.key === key);

  function reset() {
    setName("");
    setCycleCount("");
    setAtmosphere("");
    setHumidity("");
    setVessel("");
    setAgitation("");
    setSamplingPoints("");
    setNotes("");
    setWetTemp(undefined);
    setDryTemp(undefined);
    setWetDuration(undefined);
    setDryDuration(undefined);
    setStartingVolume(undefined);
    setRehydrationVolume(undefined);
  }

  function save() {
    const quantities: Record<string, Quantity> = {};
    if (wetTemp) quantities.wet_temperature = wetTemp;
    if (dryTemp) quantities.dry_temperature = dryTemp;
    if (wetDuration) quantities.wet_duration = wetDuration;
    if (dryDuration) quantities.dry_duration = dryDuration;
    if (startingVolume) quantities.starting_volume = startingVolume;
    if (rehydrationVolume) quantities.rehydration_volume = rehydrationVolume;

    run(
      () =>
        createConditionProgramTemplateAction(
          name,
          cycleCount ? Number(cycleCount) : 0,
          atmosphere,
          humidity,
          vessel,
          agitation,
          samplingPoints,
          quantities,
          notes
        ),
      undefined,
      () => {
        reset();
        setShowNew(false);
      }
    );
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div className="detail-head" style={{ marginBottom: 12 }}>
        <h4 style={{ margin: 0 }}>Condition program templates</h4>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNew((v) => !v)}>
          {showNew ? "Cancel" : "+ New template"}
        </button>
      </div>

      {showNew && (
        <div className="obs-box glass" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <input placeholder="Template name" value={name} onChange={(e) => setName(e.target.value)} required />
            <input placeholder="Cycle count" type="number" value={cycleCount} onChange={(e) => setCycleCount(e.target.value)} style={{ width: 110 }} />
            <input placeholder="Atmosphere" value={atmosphere} onChange={(e) => setAtmosphere(e.target.value)} />
            <input placeholder="Humidity / drying method" value={humidity} onChange={(e) => setHumidity(e.target.value)} />
            <input placeholder="Vessel" value={vessel} onChange={(e) => setVessel(e.target.value)} />
            <input placeholder="Agitation" value={agitation} onChange={(e) => setAgitation(e.target.value)} />
            <input placeholder="Sampling points" value={samplingPoints} onChange={(e) => setSamplingPoints(e.target.value)} />
          </div>
          <QuantityRow label="Wet-phase temperature" kind={kind("wet_temperature")} value={wetTemp} onChange={setWetTemp} />
          <QuantityRow label="Dry-phase temperature" kind={kind("dry_temperature")} value={dryTemp} onChange={setDryTemp} />
          <QuantityRow label="Wet-phase duration" kind={kind("wet_duration")} value={wetDuration} onChange={setWetDuration} />
          <QuantityRow label="Dry-phase duration" kind={kind("dry_duration")} value={dryDuration} onChange={setDryDuration} />
          <QuantityRow label="Starting volume" kind={kind("starting_volume")} value={startingVolume} onChange={setStartingVolume} />
          <QuantityRow label="Rehydration volume" kind={kind("rehydration_volume")} value={rehydrationVolume} onChange={setRehydrationVolume} />
          <textarea placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} style={{ marginTop: 8, width: "100%" }} />
          <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} disabled={pending || !name.trim()} aria-busy={pending} onClick={save}>
            {pending && <Spinner />}
            Save template
          </button>
        </div>
      )}

      {templates.length === 0 ? (
        <p className="muted">No condition program templates yet.</p>
      ) : (
        templates.map((t) => (
          <div key={t.id} className="act-row">
            <span className="act-dot"></span>
            <span style={{ fontSize: 13 }}>
              {t.name} <span className="chip">{t.cycle_count} cycles</span>
              {t.atmosphere && ` — ${t.atmosphere}`}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
