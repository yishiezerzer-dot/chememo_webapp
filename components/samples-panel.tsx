"use client";

import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import { SAMPLE_RELATIONSHIP_TYPES, SAMPLE_EVENT_TYPES } from "@/lib/types";
import type {
  ActionResult,
  AnalysisRun,
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
import type { ConditionProgramTemplate } from "@/lib/types";
import {
  createRunAction,
  createResultAction,
  addPeakAction,
  getSampleRunsAction,
  getRunDetailAction,
  getResultPeaksAction,
} from "@/app/(app)/experiments/[id]/analysis-actions";
import {
  applyConditionProgramTemplateAction,
  createAdHocConditionProgramAction,
  getBatchConditionsAction,
  addConditionProgramCycleAction,
  saveEnvironmentalConditionsAction,
} from "@/app/(app)/experiments/[id]/conditions-actions";

type LotStockOption = { id: string; source_type: InputSourceType; label: string };
type MethodOption = { id: string; label: string };

// T2.6 — self-contained, like T2.5's AnalysisRunsSection: fetches/mutates
// its own data via the conditions actions directly rather than threading
// callback props two component levels deep.
function ConditionProgramSection({
  batchId,
  experimentId,
  templates,
  quantityKinds,
}: {
  batchId: string;
  experimentId: string;
  templates: ConditionProgramTemplate[];
  quantityKinds: QuantityKind[];
}) {
  // Renamed on the way in so the local run() below -- which adds this
  // panel's own re-fetch -- can keep the name every call site uses.
  const { run: runAction, load, pending, pendingKey } = useRunAction();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof getBatchConditionsAction>> | null>(null);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [showCycle, setShowCycle] = useState(false);
  const [showEnv, setShowEnv] = useState(false);
  const [name, setName] = useState("");
  const [cycleCount, setCycleCount] = useState("");
  const [atmosphere, setAtmosphere] = useState("");
  const [cycleIndex, setCycleIndex] = useState("");
  const [wetVolume, setWetVolume] = useState<Quantity | undefined>();
  const [aliquotVolume, setAliquotVolume] = useState<Quantity | undefined>();
  const [observation, setObservation] = useState("");
  const [atmosphereGas, setAtmosphereGas] = useState("");
  const [initialPh, setInitialPh] = useState("");
  const [finalPh, setFinalPh] = useState("");
  const [anaerobic, setAnaerobic] = useState(false);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    load(
      () => getBatchConditionsAction(batchId),
      (d) => {
        setData(d);
        setOpen(true);
      },
      "conditions"
    );
  }

  function run(action: () => Promise<ActionResult>, key: string, after?: () => void) {
    // The conditions block is this panel's own state rather than part of the
    // server tree, so it is re-fetched inside the action: one pending state
    // covers both awaits and the hook's catch guards them together.
    runAction(
      async () => {
        const res = await action();
        if (res.ok) setData(await getBatchConditionsAction(batchId));
        return res;
      },
      key,
      after
    );
  }

  const wetVolumeKind = quantityKinds.find((k) => k.key === "cycle_wet_volume");
  const aliquotVolumeKind = quantityKinds.find((k) => k.key === "aliquot_volume");

  return (
    <div className="act-row" style={{ flexDirection: "column", alignItems: "stretch", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="act-dot"></span>
        <span style={{ fontSize: 13 }}>Condition program &amp; environment</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          disabled={pending}
          aria-busy={pending && pendingKey === "conditions"}
          onClick={toggle}
        >
          {pending && pendingKey === "conditions" && <Spinner />}
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && data && (
        <div style={{ marginTop: 8, paddingLeft: 20 }}>
          {!data.program ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              {templates.length > 0 && (
                <>
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={pending || !templateId}
                    aria-busy={pending && pendingKey === "apply-template"}
                    onClick={() => run(() => applyConditionProgramTemplateAction(experimentId, batchId, templateId), "apply-template")}
                  >
                    {pending && pendingKey === "apply-template" && <Spinner />}
                    Apply template
                  </button>
                </>
              )}
              {!showAdHoc ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowAdHoc(true)}>
                  + Ad hoc program
                </button>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input placeholder="Program name" value={name} onChange={(e) => setName(e.target.value)} />
                  <input placeholder="Cycle count" type="number" value={cycleCount} onChange={(e) => setCycleCount(e.target.value)} style={{ width: 100 }} />
                  <input placeholder="Atmosphere" value={atmosphere} onChange={(e) => setAtmosphere(e.target.value)} />
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={pending || !name.trim()}
                    aria-busy={pending && pendingKey === "save-program"}
                    onClick={() =>
                      run(
                        () =>
                          createAdHocConditionProgramAction(
                            experimentId,
                            batchId,
                            name,
                            cycleCount ? Number(cycleCount) : 0,
                            atmosphere,
                            "",
                            "",
                            "",
                            "",
                            {},
                            ""
                          ),
                        "save-program",
                        () => {
                          setShowAdHoc(false);
                          setName("");
                          setCycleCount("");
                          setAtmosphere("");
                        }
                      )
                    }
                  >
                    {pending && pendingKey === "save-program" && <Spinner />}
                    Save program
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <b>{data.program.name}</b> <span className="chip">{data.program.cycle_count} cycles</span>
                {data.program.atmosphere && ` — ${data.program.atmosphere}`}
              </div>
              {/* A lightweight visual timeline: one row per cycle, wet/dry
                  phases as proportionally-sized colored bars. */}
              {data.cycles.map((c) => {
                const wetVal = c.quantities.cycle_wet_volume?.value ?? 1;
                return (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, fontSize: 12 }}>
                    <span className="muted" style={{ minWidth: 60 }}>
                      Cycle {c.cycle_index}
                    </span>
                    <div style={{ display: "flex", flex: 1, height: 10, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ flex: 2, background: "var(--teal, #3ee0c4)" }} title="Wet phase" />
                      <div style={{ flex: 1, background: "var(--amber, #ffd479)" }} title="Dry phase" />
                    </div>
                    {c.quantities.cycle_wet_volume && (
                      <span className="muted">
                        {wetVal} {c.quantities.cycle_wet_volume.unit_code}
                      </span>
                    )}
                    {c.observation && <span className="muted">— {c.observation}</span>}
                  </div>
                );
              })}
              {!showCycle ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCycle(true)}>
                  + Add cycle
                </button>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  <input placeholder="Cycle #" type="number" value={cycleIndex} onChange={(e) => setCycleIndex(e.target.value)} style={{ width: 80 }} />
                  <QuantityRowSmall label="Wet volume" kind={wetVolumeKind} value={wetVolume} onChange={setWetVolume} />
                  <QuantityRowSmall label="Aliquot removed" kind={aliquotVolumeKind} value={aliquotVolume} onChange={setAliquotVolume} />
                  <input placeholder="Observation" value={observation} onChange={(e) => setObservation(e.target.value)} />
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={pending || !cycleIndex}
                    aria-busy={pending && pendingKey === "save-cycle"}
                    onClick={() =>
                      run(
                        () => {
                          const quantities: Record<string, Quantity> = {};
                          if (wetVolume) quantities.cycle_wet_volume = wetVolume;
                          if (aliquotVolume) quantities.aliquot_volume = aliquotVolume;
                          return addConditionProgramCycleAction(
                            experimentId,
                            data.program!.id,
                            Number(cycleIndex),
                            "",
                            "",
                            "",
                            "",
                            quantities,
                            observation,
                            {}
                          );
                        },
                        "save-cycle",
                        () => {
                          setShowCycle(false);
                          setCycleIndex("");
                          setWetVolume(undefined);
                          setAliquotVolume(undefined);
                          setObservation("");
                        }
                      )
                    }
                  >
                    {pending && pendingKey === "save-cycle" && <Spinner />}
                    Save cycle
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowEnv((v) => !v)}>
              {showEnv ? "Hide environmental conditions" : data.environmental ? "Edit environmental conditions" : "+ Environmental conditions"}
            </button>
            {data.environmental && !showEnv && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {data.environmental.atmosphere_gas && `${data.environmental.atmosphere_gas} · `}
                {data.environmental.initial_ph != null && `pH ${data.environmental.initial_ph}`}
                {data.environmental.final_ph != null && `→${data.environmental.final_ph} · `}
                {data.environmental.anaerobic && "anaerobic"}
              </div>
            )}
            {showEnv && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                <input placeholder="Atmosphere/gas" value={atmosphereGas} onChange={(e) => setAtmosphereGas(e.target.value)} />
                <input placeholder="Initial pH" type="number" step="0.1" value={initialPh} onChange={(e) => setInitialPh(e.target.value)} style={{ width: 90 }} />
                <input placeholder="Final pH" type="number" step="0.1" value={finalPh} onChange={(e) => setFinalPh(e.target.value)} style={{ width: 90 }} />
                <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={anaerobic} onChange={(e) => setAnaerobic(e.target.checked)} /> Anaerobic
                </label>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={pending}
                  aria-busy={pending && pendingKey === "save-env"}
                  onClick={() =>
                    run(() =>
                      saveEnvironmentalConditionsAction(experimentId, batchId, {
                        atmosphere_gas: atmosphereGas.trim() || null,
                        pressure: null,
                        light_uv_exposure: null,
                        light_uv_wavelength: null,
                        mineral_surface_type: null,
                        ionic_strength: null,
                        buffer_identity: null,
                        water_activity: null,
                        heating_method: null,
                        freeze_thaw_cycles: null,
                        vessel_material: null,
                        initial_ph: initialPh ? Number(initialPh) : null,
                        final_ph: finalPh ? Number(finalPh) : null,
                        anaerobic,
                        quantities: {},
                        custom_fields: {},
                        notes: null,
                      }),
                      "save-env"
                    )
                  }
                >
                  {pending && pendingKey === "save-env" && <Spinner />}
                  Save
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function QuantityRowSmall({
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
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <span className="muted" style={{ fontSize: 12 }}>
        {label}
      </span>
      <input
        type="number"
        step="0.01"
        value={value?.value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : { value: Number(e.target.value), unit_code: value?.unit_code ?? kind.canonical_unit_code })
        }
        style={{ width: 80 }}
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

// T2.5 — self-contained: fetches/mutates its own data via the analysis
// actions directly, rather than requiring SamplesPanel to thread another
// half-dozen callback props down two component levels.
function AnalysisRunsSection({
  sampleId,
  experimentId,
  methodOptions,
  analysisStatuses,
  resultConfidences,
  assignmentConfidences,
}: {
  sampleId: string;
  experimentId: string;
  methodOptions: MethodOption[];
  analysisStatuses: string[];
  resultConfidences: string[];
  assignmentConfidences: string[];
}) {
  const { run, load, pending, pendingKey } = useRunAction();
  const [runs, setRuns] = useState<AnalysisRun[] | null>(null);
  const [open, setOpen] = useState(false);
  const [methodId, setMethodId] = useState("");
  const [status, setStatus] = useState(analysisStatuses[0] ?? "planned");
  const [operator, setOperator] = useState("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<Awaited<ReturnType<typeof getRunDetailAction>> | null>(null);
  const [resultConfidence, setResultConfidence] = useState(resultConfidences[0] ?? "");
  const [resultSummary, setResultSummary] = useState("");
  const [peaksByResult, setPeaksByResult] = useState<Record<string, Awaited<ReturnType<typeof getResultPeaksAction>>>>({});
  const [peakMz, setPeakMz] = useState("");
  const [peakConfidence, setPeakConfidence] = useState(assignmentConfidences[0] ?? "");

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    load(
      () => getSampleRunsAction(sampleId),
      (r) => {
        setRuns(r);
        setOpen(true);
      },
      "runs"
    );
  }

  function loadRunDetail(runId: string) {
    if (expandedRun === runId) {
      setExpandedRun(null);
      return;
    }
    load(
      () => getRunDetailAction(runId),
      (d) => {
        setRunDetail(d);
        setExpandedRun(runId);
      },
      `run-${runId}`
    );
  }

  // The un-guarded twin of loadPeaks, for the one call site that runs inside
  // an action already covered by run()'s pending state and catch.
  async function fetchPeaks(resultId: string) {
    const peaks = await getResultPeaksAction(resultId);
    setPeaksByResult((cur) => ({ ...cur, [resultId]: peaks }));
  }

  function loadPeaks(resultId: string) {
    load(
      () => getResultPeaksAction(resultId),
      (peaks) => setPeaksByResult((cur) => ({ ...cur, [resultId]: peaks })),
      `peaks-${resultId}`
    );
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line, #2a2a2a)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h4 style={{ fontSize: 12.5, color: "var(--ink-mute)", margin: 0 }}>Analysis runs</h4>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          disabled={pending}
          aria-busy={pending && pendingKey === "runs"}
          onClick={toggle}
        >
          {pending && pendingKey === "runs" && <Spinner />}
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 8 }}>
          {(runs ?? []).map((r) => {
            const method = methodOptions.find((m) => m.id === r.instrument_method_id);
            return (
              <div key={r.id} style={{ marginBottom: 8 }}>
                <div className="act-row">
                  <span className="act-dot"></span>
                  <span style={{ fontSize: 13 }}>
                    {method?.label ?? "Method"} <span className="chip">{r.status}</span>
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: "auto" }}
                    disabled={pending}
                    aria-busy={pending && pendingKey === `run-${r.id}`}
                    onClick={() => loadRunDetail(r.id)}
                  >
                    {pending && pendingKey === `run-${r.id}` && <Spinner />}
                    {expandedRun === r.id ? "Hide" : "Details"}
                  </button>
                </div>
                {expandedRun === r.id && runDetail && (
                  <div style={{ paddingLeft: 20 }}>
                    {runDetail.results.map((res) => (
                      <div key={res.id} style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 12.5 }}>
                          {res.summary || "(no summary)"} {res.result_confidence && <span className="chip">{res.result_confidence}</span>}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ marginLeft: 8 }}
                            disabled={pending}
                            aria-busy={pending && pendingKey === `peaks-${res.id}`}
                            onClick={() => loadPeaks(res.id)}
                          >
                            {pending && pendingKey === `peaks-${res.id}` && <Spinner />}
                            Peaks
                          </button>
                        </div>
                        {peaksByResult[res.id]?.map((p) => (
                          <div key={p.id} className="muted" style={{ fontSize: 12 }}>
                            m/z {p.observed_mz ?? p.expected_mz ?? "?"} — {p.assignment ?? "unassigned"} ({p.confidence ?? "?"})
                          </div>
                        ))}
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <input placeholder="m/z" value={peakMz} onChange={(e) => setPeakMz(e.target.value)} style={{ width: 80 }} />
                          <select value={peakConfidence} onChange={(e) => setPeakConfidence(e.target.value)}>
                            {assignmentConfidences.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={pending || !peakMz}
                            aria-busy={pending && pendingKey === `peak-${res.id}`}
                            onClick={() =>
                              run(async () => {
                                const res2 = await addPeakAction(experimentId, res.id, {
                                  expected_mz: null,
                                  observed_mz: Number(peakMz),
                                  ion_mode: null,
                                  adduct: null,
                                  charge: null,
                                  ppm_error: null,
                                  retention_time_min: null,
                                  ms_level: null,
                                  intensity: null,
                                  formula_candidate: null,
                                  assignment: null,
                                  confidence: peakConfidence || null,
                                  notes: null,
                                });
                                if (res2.ok) {
                                  setPeakMz("");
                                  await fetchPeaks(res.id);
                                }
                                return res2;
                              }, `peak-${res.id}`)
                            }
                          >
                            {pending && pendingKey === `peak-${res.id}` && <Spinner />}
                            + Peak
                          </button>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <select value={resultConfidence} onChange={(e) => setResultConfidence(e.target.value)}>
                        {resultConfidences.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <input placeholder="Summary" value={resultSummary} onChange={(e) => setResultSummary(e.target.value)} style={{ minWidth: 160 }} />
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={pending}
                        aria-busy={pending && pendingKey === `add-result-${r.id}`}
                        onClick={() =>
                          run(
                            () => createResultAction(experimentId, r.id, resultConfidence, resultSummary, {}),
                            `add-result-${r.id}`,
                            async () => {
                              setResultSummary("");
                              setRunDetail(await getRunDetailAction(r.id));
                            }
                          )
                        }
                      >
                        {pending && pendingKey === `add-result-${r.id}` && <Spinner />}
                        + Add result
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <select value={methodId} onChange={(e) => setMethodId(e.target.value)}>
              <option value="">Pick a method…</option>
              {methodOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {analysisStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input placeholder="Operator" value={operator} onChange={(e) => setOperator(e.target.value)} style={{ width: 100 }} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending || !methodId}
              aria-busy={pending && pendingKey === "new-run"}
              onClick={() =>
                run(
                  () => createRunAction(experimentId, sampleId, methodId, status, operator),
                  "new-run",
                  async () => {
                    setMethodId("");
                    setOperator("");
                    setRuns(await getSampleRunsAction(sampleId));
                  }
                )
              }
            >
              {pending && pendingKey === "new-run" && <Spinner />}
              + New run
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

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
  experimentId,
  methodOptions,
  analysisStatuses,
  resultConfidences,
  assignmentConfidences,
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
  experimentId: string;
  methodOptions: MethodOption[];
  analysisStatuses: string[];
  resultConfidences: string[];
  assignmentConfidences: string[];
}) {
  // Renamed on the way in so the local run() below -- which adds this row's
  // own re-fetch -- can keep the name every call site uses.
  const { run: runAction, load, pending, pendingKey } = useRunAction();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getDetail>> | null>(null);

  const [relTarget, setRelTarget] = useState("");
  const [relType, setRelType] = useState<SampleRelationshipType>("produced_from");
  const [toLocation, setToLocation] = useState("");
  const [aliasValue, setAliasValue] = useState("");
  const weightKind = quantityKinds.find((k) => k.key === "sample_weight");
  const [weight, setWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState(weightKind?.canonical_unit_code ?? "g");

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    load(
      () => getDetail(sample.id),
      (d) => {
        setDetail(d);
        setOpen(true);
      },
      "detail"
    );
  }

  function run(action: () => Promise<ActionResult>, key: string) {
    // The detail block is this row's own state rather than part of the server
    // tree, so it is re-fetched inside the action: one pending state covers
    // both awaits and the hook's catch guards them together.
    runAction(async () => {
      const res = await action();
      if (res.ok) setDetail(await getDetail(sample.id));
      return res;
    }, key);
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
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginLeft: "auto" }}
          disabled={pending}
          aria-busy={pending && pendingKey === "detail"}
          onClick={toggle}
        >
          {pending && pendingKey === "detail" && <Spinner />}
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
              aria-busy={pending && pendingKey === "alias"}
              onClick={() => {
                const v = aliasValue;
                setAliasValue("");
                run(() => addAlias(sample.id, v, ""), "alias");
              }}
            >
              {pending && pendingKey === "alias" && <Spinner />}
              + Alias
            </button>
          </div>

          {detail.relationships.length > 0 && (
            <div style={{ marginBottom: 6, fontSize: 12.5 }}>
              {detail.relationships.map((r) => (
                <div key={r.id}>
                  {r.relationship_type} {r.source_sample_id === sample.id ? "→" : "←"}{" "}
                  {allSamples.find((s) => s.id === (r.source_sample_id === sample.id ? r.target_sample_id : r.source_sample_id))?.vial_label ?? "?"}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginLeft: 8 }}
                    disabled={pending}
                    aria-busy={pending && pendingKey === `rel-${r.id}`}
                    onClick={() => run(() => deleteRelationship(r.id), `rel-${r.id}`)}
                  >
                    {pending && pendingKey === `rel-${r.id}` ? <Spinner /> : "×"}
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
              aria-busy={pending && pendingKey === "link"}
              onClick={() => run(() => createRelationship(sample.id, relTarget, relType), "link")}
            >
              {pending && pendingKey === "link" && <Spinner />}
              + Link
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input placeholder="Transfer to location" value={toLocation} onChange={(e) => setToLocation(e.target.value)} style={{ minWidth: 200 }} />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending || !toLocation.trim()}
              aria-busy={pending && pendingKey === "transfer"}
              onClick={() => {
                const v = toLocation;
                setToLocation("");
                run(() => recordEvent(sample.id, "transfer", { to_location_path: v }), "transfer");
              }}
            >
              {pending && pendingKey === "transfer" && <Spinner />}
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
              aria-busy={pending && pendingKey === "measurement"}
              onClick={() => {
                const v = weight;
                setWeight("");
                run(() => addMeasurement(sample.id, { sample_weight: { value: Number(v), unit_code: weightUnit } }, ""), "measurement");
              }}
            >
              {pending && pendingKey === "measurement" && <Spinner />}
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

          <AnalysisRunsSection
            sampleId={sample.id}
            experimentId={experimentId}
            methodOptions={methodOptions}
            analysisStatuses={analysisStatuses}
            resultConfidences={resultConfidences}
            assignmentConfidences={assignmentConfidences}
          />
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
  methodOptions,
  analysisStatuses,
  resultConfidences,
  assignmentConfidences,
  conditionProgramTemplates,
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
  methodOptions: MethodOption[];
  analysisStatuses: string[];
  resultConfidences: string[];
  assignmentConfidences: string[];
  conditionProgramTemplates: ConditionProgramTemplate[];
}) {
  const { run, pending, pendingKey } = useRunAction();
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

  return (
    <div className="obs-box glass">
      <h4>Samples &amp; batches</h4>

      {batches.map((b) => (
        <div key={b.id} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            {batches.length > 1 && <span className="chip" style={{ marginRight: 6 }}>{b.label}</span>}
          </div>
          <ConditionProgramSection
            batchId={b.id}
            experimentId={experimentId}
            templates={conditionProgramTemplates}
            quantityKinds={quantityKinds}
          />
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
              experimentId={experimentId}
              methodOptions={methodOptions}
              analysisStatuses={analysisStatuses}
              resultConfidences={resultConfidences}
              assignmentConfidences={assignmentConfidences}
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
                aria-busy={pending && pendingKey === "save-sample"}
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
                    "save-sample",
                    () => setAddingToBatch(null)
                  );
                }}
              >
                {pending && pendingKey === "save-sample" && <Spinner />}
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
              aria-busy={pending && pendingKey === "save-batch"}
              onClick={() =>
                run(() => createBatch(batchLabel, ""), "save-batch", () => {
                  setBatchLabel("");
                  setShowNewBatch(false);
                })
              }
            >
              {pending && pendingKey === "save-batch" && <Spinner />}
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
