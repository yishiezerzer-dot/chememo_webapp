"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { SAMPLE_RELATIONSHIP_TYPES, SAMPLE_EVENT_TYPES } from "@/lib/types";
import type {
  ActionResult,
  Batch,
  InputSourceType,
  Quantity,
  QuantityKind,
  Sample,
  SampleAlias,
  SampleEvent,
  SampleEventType,
  SampleLocation,
  SampleRelationship,
  SampleRelationshipType,
} from "@/lib/types";
import type { SampleFields } from "@/lib/samples/service";

type LotStockOption = { id: string; source_type: InputSourceType; label: string };

function SampleRow({
  sample,
  allSamples,
  quantityKinds,
  getDetail,
  createRelationship,
  deleteRelationship,
  recordEvent,
  addMeasurement,
  addAlias,
}: {
  sample: Sample;
  allSamples: Sample[];
  quantityKinds: QuantityKind[];
  getDetail: (sampleId: string) => Promise<{
    aliases: SampleAlias[];
    relationships: SampleRelationship[];
    location: SampleLocation | null;
    events: SampleEvent[];
    measurements: { id: string; quantities: Record<string, Quantity>; measured_at: string; notes: string | null }[];
  }>;
  createRelationship: (sourceId: string, targetId: string, type: SampleRelationshipType) => Promise<ActionResult>;
  deleteRelationship: (id: string) => Promise<ActionResult>;
  recordEvent: (sampleId: string, type: SampleEventType, details: Record<string, unknown>) => Promise<ActionResult>;
  addMeasurement: (sampleId: string, quantities: Record<string, Quantity>, notes: string) => Promise<ActionResult>;
  addAlias: (sampleId: string, alias: string, note: string) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getDetail>> | null>(null);

  const [relTarget, setRelTarget] = useState("");
  const [relType, setRelType] = useState<SampleRelationshipType>("produced_from");
  const [toLocation, setToLocation] = useState("");
  const [aliasValue, setAliasValue] = useState("");
  const weightKind = quantityKinds.find((k) => k.key === "sample_weight");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState(weightKind?.canonical_unit_code ?? "g");

  async function load() {
    if (!open) setDetail(await getDetail(sample.id));
    setOpen((o) => !o);
  }

  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error, "error");
      else {
        router.refresh();
        setDetail(await getDetail(sample.id));
      }
    });
  }

  const otherSamples = allSamples.filter((s) => s.id !== sample.id);

  return (
    <div className="act-row" style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="act-dot"></span>
        <span style={{ fontSize: 13 }}>
          <b>{sample.vial_label}</b>
          {sample.sample_type && <span className="chip" style={{ marginLeft: 6 }}>{sample.sample_type}</span>}
          <span className="chip" style={{ marginLeft: 6 }}>{sample.status}</span>
        </span>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={load}>
          {open ? "Hide" : "Details"}
        </button>
      </div>

      {open && detail && (
        <div style={{ marginTop: 8, paddingLeft: 20 }}>
          <div style={{ fontSize: 12.5, marginBottom: 6 }}>
            <b>Location:</b> {detail.location?.location_path ?? "not recorded"}
            {detail.location?.status && ` (${detail.location.status})`}
          </div>

          {detail.aliases.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              {detail.aliases.map((a) => (
                <span key={a.id} className="chip" style={{ marginRight: 6 }}>
                  {a.alias}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input placeholder="Add alias" value={aliasValue} onChange={(e) => setAliasValue(e.target.value)} style={{ maxWidth: 140 }} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending || !aliasValue.trim()}
              onClick={() => {
                const v = aliasValue;
                setAliasValue("");
                run(() => addAlias(sample.id, v, ""));
              }}
            >
              + Alias
            </button>
          </div>

          {detail.relationships.length > 0 && (
            <div style={{ marginBottom: 6, fontSize: 12.5 }}>
              {detail.relationships.map((r) => (
                <div key={r.id}>
                  {r.relationship_type} {r.source_sample_id === sample.id ? "→" : "←"}{" "}
                  {allSamples.find((s) => s.id === (r.source_sample_id === sample.id ? r.target_sample_id : r.source_sample_id))?.vial_label ?? "?"}
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => run(() => deleteRelationship(r.id))}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <select value={relType} onChange={(e) => setRelType(e.target.value as SampleRelationshipType)}>
              {SAMPLE_RELATIONSHIP_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select value={relTarget} onChange={(e) => setRelTarget(e.target.value)}>
              <option value="">Pick another sample…</option>
              {otherSamples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.vial_label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending || !relTarget}
              onClick={() => run(() => createRelationship(sample.id, relTarget, relType))}
            >
              + Link
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input placeholder="Transfer to location" value={toLocation} onChange={(e) => setToLocation(e.target.value)} style={{ minWidth: 200 }} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending || !toLocation.trim()}
              onClick={() => {
                const v = toLocation;
                setToLocation("");
                run(() => recordEvent(sample.id, "transfer", { to_location_path: v }));
              }}
            >
              + Record transfer
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input type="number" step="0.01" placeholder="Weight" value={weight} onChange={(e) => setWeight(e.target.value)} style={{ width: 90 }} />
            <select value={weightUnit} onChange={(e) => setWeightUnit(e.target.value)}>
              {(weightKind?.compatible_units ?? []).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending || !weight}
              onClick={() => {
                const v = weight;
                setWeight("");
                run(() => addMeasurement(sample.id, { sample_weight: { value: Number(v), unit_code: weightUnit } }, ""));
              }}
            >
              + Log measurement
            </button>
          </div>
          {detail.measurements.length > 0 && (
            <div style={{ marginTop: 6, fontSize: 12.5 }}>
              {detail.measurements.map((m) => (
                <div key={m.id}>{Object.entries(m.quantities).map(([k, q]) => `${k}: ${q.value} ${q.unit_code}`).join(", ")}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SamplesPanel({
  experimentId,
  batches,
  samplesByBatch,
  lotStockOptions,
  sampleTypes,
  reactionModes,
  sampleStatuses,
  quantityKinds,
  createBatch,
  createSample,
  getDetail,
  createRelationship,
  deleteRelationship,
  recordEvent,
  addMeasurement,
  addAlias,
}: {
  experimentId: string;
  batches: Batch[];
  samplesByBatch: Record<string, Sample[]>;
  lotStockOptions: LotStockOption[];
  sampleTypes: string[];
  reactionModes: string[];
  sampleStatuses: string[];
  quantityKinds: QuantityKind[];
  createBatch: (label: string, notes: string) => Promise<ActionResult>;
  createSample: (
    batchId: string,
    fields: Omit<SampleFields, "origin_type" | "origin_id"> & { originType: InputSourceType | null; originId: string | null }
  ) => Promise<ActionResult>;
  getDetail: (sampleId: string) => Promise<{
    aliases: SampleAlias[];
    relationships: SampleRelationship[];
    location: SampleLocation | null;
    events: SampleEvent[];
    measurements: { id: string; quantities: Record<string, Quantity>; measured_at: string; notes: string | null }[];
  }>;
  createRelationship: (sourceId: string, targetId: string, type: SampleRelationshipType) => Promise<ActionResult>;
  deleteRelationship: (id: string) => Promise<ActionResult>;
  recordEvent: (sampleId: string, type: SampleEventType, details: Record<string, unknown>) => Promise<ActionResult>;
  addMeasurement: (sampleId: string, quantities: Record<string, Quantity>, notes: string) => Promise<ActionResult>;
  addAlias: (sampleId: string, alias: string, note: string) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const [showNewBatch, setShowNewBatch] = useState(false);
  const [batchLabel, setBatchLabel] = useState("");
  const [addingToBatch, setAddingToBatch] = useState<string | null>(null);
  const [sampleType, setSampleType] = useState(sampleTypes[0] ?? "");
  const [reactionMode, setReactionMode] = useState(reactionModes[0] ?? "");
  const [status, setStatus] = useState(sampleStatuses[0] ?? "planned");
  const [origin, setOrigin] = useState("");
  const [replicate, setReplicate] = useState("1");

  const allSamples = Object.values(samplesByBatch).flat();
  void SAMPLE_EVENT_TYPES;

  function run(action: () => Promise<ActionResult>, after?: () => void) {
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error, "error");
      else {
        router.refresh();
        after?.();
      }
    });
  }

  return (
    <div className="obs-box glass">
      <h4>Samples &amp; batches</h4>

      {batches.map((b) => (
        <div key={b.id} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            {batches.length > 1 && <span className="chip" style={{ marginRight: 6 }}>{b.label}</span>}
          </div>
          {(samplesByBatch[b.id] ?? []).map((s) => (
            <SampleRow
              key={s.id}
              sample={s}
              allSamples={allSamples}
              quantityKinds={quantityKinds}
              getDetail={getDetail}
              createRelationship={createRelationship}
              deleteRelationship={deleteRelationship}
              recordEvent={recordEvent}
              addMeasurement={addMeasurement}
              addAlias={addAlias}
            />
          ))}

          {addingToBatch === b.id ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              <select value={sampleType} onChange={(e) => setSampleType(e.target.value)}>
                {sampleTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select value={reactionMode} onChange={(e) => setReactionMode(e.target.value)}>
                {reactionModes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {sampleStatuses.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <select value={origin} onChange={(e) => setOrigin(e.target.value)}>
                <option value="">No origin</option>
                {lotStockOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <input type="number" min="1" value={replicate} onChange={(e) => setReplicate(e.target.value)} style={{ width: 70 }} placeholder="Replicate" />
              <button
                type="button"
                className="btn btn-sm"
                disabled={pending}
                onClick={() => {
                  const originOption = lotStockOptions.find((o) => o.id === origin);
                  run(
                    () =>
                      createSample(b.id, {
                        legacy_code: null,
                        sample_type: sampleType || null,
                        reaction_mode: reactionMode || null,
                        status,
                        originType: originOption?.source_type ?? null,
                        originId: originOption?.id ?? null,
                        replicate: Number(replicate) || 1,
                        notes: null,
                      }),
                    () => setAddingToBatch(null)
                  );
                }}
              >
                Save sample
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddingToBatch(null)}>
                Cancel
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddingToBatch(b.id)}>
              + New sample
            </button>
          )}
        </div>
      ))}

      {batches.length > 1 || showNewBatch ? (
        showNewBatch ? (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input placeholder="Batch label (e.g. B2)" value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending}
              onClick={() =>
                run(() => createBatch(batchLabel, ""), () => {
                  setBatchLabel("");
                  setShowNewBatch(false);
                })
              }
            >
              Save batch
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewBatch(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowNewBatch(true)}>
            + New batch (repeat preparation)
          </button>
        )
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setShowNewBatch(true)}>
          + New batch (repeat preparation)
        </button>
      )}
    </div>
  );
}
