import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getExperiment,
  getExperimentSummary,
  signedUrlsFor,
} from "@/lib/experiments/service";
import { listTimeline } from "@/lib/experiments/timeline";
import { listProjects } from "@/lib/projects/service";
import { listControlledVocab } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { listVersionOptions } from "@/lib/protocols/service";
import { listStepDetails } from "@/lib/experiment-steps/service";
import { listRelationships } from "@/lib/relationships/service";
import { listSeries, listSeriesForExperiment } from "@/lib/series/service";
import * as materialsService from "@/lib/materials/service";
import { addInputAction, removeInputAction, addOutputAction, removeOutputAction, recalculateStoichiometryAction } from "./inputs-actions";
import * as samplesService from "@/lib/samples/service";
import * as analyticalService from "@/lib/analytical/service";
import * as conditionsService from "@/lib/conditions/service";
import {
  createBatchAction,
  createSampleAction,
  getSampleDetailAction,
  createSampleRelationshipAction,
  deleteSampleRelationshipAction,
  recordSampleEventAction,
  addMeasurementAction,
  addAliasAction,
} from "./samples-actions";
import { softDeleteExperiment } from "@/app/(app)/new/actions";
import { uploadFile, addFileLink, removeFile } from "./file-actions";
import { generateSummary } from "./summary-actions";
import { setStatus, completeExperiment, reviewExperiment, archiveExperiment } from "./lifecycle-actions";
import {
  instantiateStepsAction,
  updateStepStatusAction,
  recordObservationAction,
  recordDeviationAction,
} from "./steps-actions";
import { createRelationshipAction, deleteRelationshipAction } from "./relationships-actions";
import { restoreRevisionAction } from "./restore-actions";
import { addExperimentToSeriesAction, removeExperimentFromSeriesAction } from "@/app/(app)/series/actions";
import { listComments } from "@/lib/comments/service";
import { listTasks } from "@/lib/tasks/service";
import { createCommentAction, resolveCommentAction, reopenCommentAction } from "@/app/(app)/comments-actions";
import { createTaskAction, updateTaskStatusAction } from "@/app/(app)/tasks-actions";
import { exportExperimentMarkdownAction } from "./export-actions";
import { resolveUnresolvedItemAction } from "./provenance-actions";
import { getCrewProvenance } from "@/lib/ai/crew/provenance";
import { isLlmEnabled } from "@/lib/llm";
import { DeleteExperimentButton } from "@/components/delete-experiment-button";
import { FileList, UnlinkedFilesInbox } from "@/components/file-list";
import { FileManager } from "@/components/file-manager";
import { SummaryCard } from "@/components/summary-card";
import { RelationshipsPanel } from "@/components/relationships-panel";
import { InputsOutputsPanel } from "@/components/inputs-outputs-panel";
import { SamplesPanel } from "@/components/samples-panel";
import { ControlsPanel } from "@/components/controls-panel";
import { HistoryPanel } from "@/components/history-panel";
import { StatusBadge } from "@/components/status-badge";
import { CrewProvenancePanel } from "@/components/crew-provenance-panel";
import { LifecycleControls } from "@/components/lifecycle-controls";
import { StepRunner } from "@/components/step-runner";
import { CommentThread } from "@/components/comment-thread";
import { TasksPanel } from "@/components/tasks-panel";
import { ExportMarkdownButton } from "@/components/export-markdown-button";

const fmtDateTime = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—");

export default async function ExperimentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [
    result,
    projects,
    summary,
    quantityKinds,
    deviationCategories,
    protocolVersions,
    relationships,
    allSeries,
    memberSeries,
    materialInputs,
    materialOutputs,
    lotStockOptions,
    materials,
    materialRoles,
    outputRoles,
    batches,
    sampleTypes,
    reactionModes,
    sampleStatuses,
    methodOptions,
    analysisStatuses,
    resultConfidences,
    assignmentConfidences,
    conditionProgramTemplates,
    controls,
  ] = await Promise.all([
    getExperiment(id),
    listProjects(),
    getExperimentSummary(id),
    listQuantityKinds(),
    listControlledVocab("deviation_category"),
    listVersionOptions(),
    listRelationships(id),
    listSeries(),
    listSeriesForExperiment(id),
    materialsService.listInputs(id),
    materialsService.listOutputs(id),
    materialsService.listLotAndStockOptions(),
    materialsService.listMaterials(),
    listControlledVocab("material_role"),
    listControlledVocab("output_role"),
    samplesService.listBatches(id),
    listControlledVocab("sample_type"),
    listControlledVocab("reaction_mode"),
    listControlledVocab("sample_status"),
    analyticalService.listAllMethodOptions(),
    listControlledVocab("analysis_status"),
    listControlledVocab("result_confidence"),
    listControlledVocab("assignment_confidence"),
    conditionsService.listConditionProgramTemplates(),
    conditionsService.listControls(id),
  ]);
  const samplesByBatchEntries = await Promise.all(batches.map(async (b) => [b.id, await samplesService.listSamples(b.id)] as const));
  const samplesByBatch = Object.fromEntries(samplesByBatchEntries);
  const batchConditionPrograms = await Promise.all(batches.map((b) => conditionsService.getBatchConditionProgram(b.id)));
  const hasConditionProgram = batchConditionPrograms.some((p) => p !== null);
  if (!result) notFound();
  const aiEnabled = isLlmEnabled();
  const { experiment: e, files } = result;
  const [timeline, stepDetails] = await Promise.all([
    listTimeline(id, e, files),
    e.protocol_version_id ? listStepDetails(e.id) : Promise.resolve([]),
  ]);
  const protocolVersionLabel = protocolVersions.find((v) => v.id === e.protocol_version_id)?.label;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = !!user && user.id === e.owner_id;
  const crewProvenance = await getCrewProvenance(supabase, e.id);

  const projectLabel = projects.find((p) => p.id === e.project)?.label ?? e.project;

  // Uploads live in a private bucket → resolve short-lived signed URLs; links
  // carry their own external URL. Both become the clickable `href`.
  const uploadPaths = files
    .filter((f) => f.kind === "upload" && f.storage_path)
    .map((f) => f.storage_path as string);
  const signed = await signedUrlsFor(uploadPaths);
  const fileItems = files.map((f) => ({
    ...f,
    href: f.kind === "link" ? f.url : f.storage_path ? signed[f.storage_path] ?? null : null,
  }));

  // T1.4 — structured quantities.temperature wins once set; the legacy free
  // text (pre-T1.4) still displays for records that predate this (D4).
  const temperatureQty = e.quantities.temperature;
  const concentrationEntries = Object.entries(e.quantities).filter(([k]) => k !== "temperature" && k !== "duration" && k !== "volume");

  const specs: { k: string; v: string; big?: boolean }[] = [
    { k: "pH", v: e.ph !== null ? String(e.ph) : "—", big: true },
    { k: "Cycles", v: e.cycles !== null ? String(e.cycles) : "—", big: true },
    { k: "Date", v: e.date ?? "—" },
    { k: "Researcher", v: e.researcher ?? "—" },
    {
      k: "Temperature",
      v: temperatureQty ? `${temperatureQty.value} ${temperatureQty.unit_code}` : e.temperature ?? "—",
    },
    ...(concentrationEntries.length > 0
      ? concentrationEntries.map(([key, q]) => ({
          k: key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
          v: `${q.value} ${q.unit_code}`,
        }))
      : [{ k: "Concentration", v: e.concentration ?? "—" }]),
  ];

  return (
    <div>
      <Link href="/experiments" className="muted" style={{ fontSize: 13 }}>
        ← All experiments
      </Link>

      <div className="detail-head" style={{ marginTop: 12 }}>
        <div>
          <div className="id">{e.id}</div>
          <h2>{e.name}</h2>
          <div className="detail-meta" style={{ marginBottom: 8 }}>
            <StatusBadge status={e.status} />
          </div>
          <div className="detail-meta">
            {projectLabel && <span className="chip">{projectLabel}</span>}
            {e.reaction_type && <span className="chip">{e.reaction_type}</span>}
            {e.metals.map((m) => (
              <span key={m} className="chip">
                {m}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <ExportMarkdownButton experimentId={e.id} exportMarkdown={exportExperimentMarkdownAction.bind(null, e.id)} />
          {isOwner && (
            <>
              <Link href={`/experiments/${e.id}/edit`} className="btn btn-ghost btn-sm">
                Edit
              </Link>
              <DeleteExperimentButton
                status={e.status}
                hasConclusion={!!e.conclusion?.trim()}
                deleteAction={softDeleteExperiment.bind(null, e.id)}
                archiveAction={archiveExperiment.bind(null, e.id)}
              />
            </>
          )}
        </div>
      </div>

      {isOwner && (
        <LifecycleControls
          status={e.status}
          hasConclusion={!!e.conclusion?.trim()}
          unresolvedOpenCount={crewProvenance?.unresolvedOpenCount ?? 0}
          setStatusAction={setStatus.bind(null, e.id)}
          completeAction={completeExperiment.bind(null, e.id)}
          reviewAction={reviewExperiment.bind(null, e.id)}
        />
      )}

      {crewProvenance && (
        <CrewProvenancePanel
          experimentId={e.id}
          provenance={crewProvenance}
          isDraft={e.status === "draft"}
          isOwner={isOwner}
          resolveAction={resolveUnresolvedItemAction}
        />
      )}

      <div className="detail-grid">
        <div>
          <div className="spec-grid">
            {specs.map((s) => (
              <div key={s.k} className="spec">
                <div className="k">{s.k}</div>
                <div className={`v${s.big ? " big" : ""}`}>{s.v}</div>
              </div>
            ))}
          </div>

          <div className="obs-box glass">
            <h4>Lifecycle</h4>
            <div className="spec-grid">
              <div className="spec">
                <div className="k">Planned start</div>
                <div className="v">{fmtDateTime(e.planned_start_at)}</div>
              </div>
              <div className="spec">
                <div className="k">Started</div>
                <div className="v">{fmtDateTime(e.started_at)}</div>
              </div>
              <div className="spec">
                <div className="k">Planned end</div>
                <div className="v">{fmtDateTime(e.planned_end_at)}</div>
              </div>
              <div className="spec">
                <div className="k">Completed</div>
                <div className="v">{fmtDateTime(e.completed_at)}</div>
              </div>
            </div>
            {e.locked_at && (
              <p className="muted" style={{ fontSize: 13, margin: "12px 0 0" }}>
                {/* completed_at/by are only a true account of the CURRENT lock
                    when status is still completed/reviewed -- a record can
                    reopen and later reach a locked state again via failed/
                    cancelled/archived, and those stamps are never cleared by
                    reopen, so showing them there would misreport how the
                    record actually got locked this time (found via a live
                    smoke test on prod, 2026-07-29). */}
                {e.status === "completed" || e.status === "reviewed" ? (
                  <>
                    Locked{e.completed_by === user?.id ? " — completed by you" : ""}
                    {e.completed_at ? ` on ${fmtDateTime(e.completed_at)}` : ""}.
                  </>
                ) : (
                  "Locked."
                )}{" "}
                Reopen it from the Edit page with a documented reason to change it (standard §18.5).
              </p>
            )}
          </div>

          {e.protocol_version_id && (
            <div className="obs-box glass">
              <h4>Protocol &amp; steps</h4>
              {protocolVersionLabel && (
                <p className="sec-sub" style={{ margin: "0 0 12px" }}>
                  {protocolVersionLabel}
                </p>
              )}
              {isOwner ? (
                <StepRunner
                  steps={stepDetails}
                  quantityKinds={quantityKinds}
                  deviationCategories={deviationCategories}
                  instantiate={
                    stepDetails.length === 0
                      ? instantiateStepsAction.bind(null, e.id, e.protocol_version_id)
                      : undefined
                  }
                  updateStatus={updateStepStatusAction.bind(null, e.id)}
                  recordObservation={recordObservationAction.bind(null, e.id)}
                  recordDeviation={recordDeviationAction.bind(null, e.id)}
                />
              ) : (
                stepDetails.length > 0 && (
                  <div className="activity">
                    {stepDetails.map(({ step, protocolStep }) => (
                      <div key={step.id} className="act-row">
                        <span className="act-dot"></span>
                        <span style={{ fontSize: 13 }}>
                          Step {protocolStep.step_number}: {protocolStep.instruction}
                        </span>
                        <span className="chip" style={{ marginLeft: "auto" }}>
                          {step.status.replace(/_/g, " ")}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          <RelationshipsPanel
            experimentId={e.id}
            relationships={relationships}
            allSeries={allSeries}
            memberSeries={memberSeries}
            createRelationship={createRelationshipAction.bind(null, e.id)}
            deleteRelationship={deleteRelationshipAction.bind(null, e.id)}
            addToSeries={addExperimentToSeriesAction.bind(null, e.id)}
            removeFromSeries={removeExperimentFromSeriesAction.bind(null, e.id)}
          />

          <InputsOutputsPanel
            inputs={materialInputs}
            outputs={materialOutputs}
            lotStockOptions={lotStockOptions}
            materials={materials}
            materialRoles={materialRoles}
            outputRoles={outputRoles}
            quantityKinds={quantityKinds}
            addInput={addInputAction.bind(null, e.id)}
            removeInput={removeInputAction.bind(null, e.id)}
            addOutput={addOutputAction.bind(null, e.id)}
            removeOutput={removeOutputAction.bind(null, e.id)}
            recalculate={recalculateStoichiometryAction.bind(null, e.id)}
          />

          <SamplesPanel
            experimentId={e.id}
            batches={batches}
            samplesByBatch={samplesByBatch}
            lotStockOptions={lotStockOptions}
            sampleTypes={sampleTypes}
            reactionModes={reactionModes}
            sampleStatuses={sampleStatuses}
            quantityKinds={quantityKinds}
            createBatch={createBatchAction.bind(null, e.id)}
            createSample={createSampleAction.bind(null, e.id)}
            getDetail={getSampleDetailAction}
            createRelationship={createSampleRelationshipAction.bind(null, e.id)}
            deleteRelationship={deleteSampleRelationshipAction.bind(null, e.id)}
            recordEvent={recordSampleEventAction.bind(null, e.id)}
            addMeasurement={addMeasurementAction.bind(null, e.id)}
            addAlias={addAliasAction.bind(null, e.id)}
            methodOptions={methodOptions}
            analysisStatuses={analysisStatuses}
            resultConfidences={resultConfidences}
            assignmentConfidences={assignmentConfidences}
            conditionProgramTemplates={conditionProgramTemplates}
          />

          <ControlsPanel experimentId={e.id} controls={controls} hasConditionProgram={hasConditionProgram} />

          <Suspense fallback={<div className="obs-box glass"><h4>Tasks</h4><p className="muted">Loading…</p></div>}>
            <TasksSection experimentId={e.id} />
          </Suspense>

          <Suspense fallback={<div className="obs-box glass"><h4>Comments</h4><p className="muted">Loading…</p></div>}>
            <CommentsSection experimentId={e.id} />
          </Suspense>

          {(e.scientific_question || e.conclusion) && (
            <div className="obs-box glass">
              <h4>Planning &amp; conclusions</h4>
              {e.scientific_question && (
                <>
                  <h4 style={{ marginTop: 0, fontSize: 12.5, color: "var(--ink-mute)" }}>Scientific question</h4>
                  <p>{e.scientific_question}</p>
                </>
              )}
              {e.hypothesis && (
                <>
                  <h4 style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>Hypothesis</h4>
                  <p>{e.hypothesis}</p>
                </>
              )}
              {e.conclusion && (
                <>
                  <h4 style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>Conclusion</h4>
                  <p>{e.conclusion}</p>
                </>
              )}
              {e.next_steps && (
                <>
                  <h4 style={{ fontSize: 12.5, color: "var(--ink-mute)" }}>Next steps</h4>
                  <p>{e.next_steps}</p>
                </>
              )}
            </div>
          )}

          {e.compounds.length > 0 && (
            <div className="obs-box glass">
              <h4>Compounds</h4>
              <div className="detail-meta">
                {e.compounds.map((c) => (
                  <span key={c} className="chip">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {e.mz.length > 0 && (
            <div className="obs-box glass">
              <h4>m/z peaks</h4>
              <div className="mz-list">
                {e.mz.map((m) => (
                  <span key={m} className="mz">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="obs-box glass">
            <h4>Observations</h4>
            <p>{e.observations || "No observations recorded."}</p>
            {e.notes && (
              <>
                <h4 style={{ marginTop: 16 }}>Notes</h4>
                <p>{e.notes}</p>
              </>
            )}
          </div>
        </div>

        <aside className="detail-aside">
          <div className="panel glass">
            <h4 style={{ fontFamily: "var(--display)", margin: "0 0 12px" }}>
              Files{fileItems.length > 0 ? ` (${fileItems.length})` : ""}
            </h4>
            <FileList
              files={fileItems}
              isOwner={isOwner}
              experimentId={e.id}
              removeAction={isOwner ? removeFile : undefined}
            />
          </div>

          <UnlinkedFilesInbox experimentId={e.id} />

          {isOwner && (
            <FileManager
              uploadAction={uploadFile.bind(null, e.id)}
              linkAction={addFileLink.bind(null, e.id)}
            />
          )}

          <SummaryCard
            aiEnabled={aiEnabled}
            summary={summary}
            action={generateSummary.bind(null, e.id)}
          />

          <HistoryPanel
            entries={timeline}
            isOwner={isOwner}
            restoreRevision={restoreRevisionAction.bind(null, e.id)}
          />
        </aside>
      </div>
    </div>
  );
}

// Streamed in its own Suspense boundary rather than joining the page's main
// Promise.all — every lifecycle/step-runner action calls router.refresh(),
// which re-runs that whole load, and folding tasks in there would slow down
// every one of those refreshes for data that isn't part of the transition
// being confirmed (the T1.8 listTimeline duplicate-query bug was the same
// shape of mistake).
async function TasksSection({ experimentId }: { experimentId: string }) {
  const tasks = await listTasks("experiment", experimentId);
  return (
    <TasksPanel
      tasks={tasks}
      createTask={createTaskAction.bind(null, experimentId, "experiment", experimentId)}
      updateStatus={updateTaskStatusAction.bind(null, experimentId)}
    />
  );
}

async function CommentsSection({ experimentId }: { experimentId: string }) {
  const comments = await listComments("experiment", experimentId);
  return (
    <div className="obs-box glass">
      <h4>Comments</h4>
      <CommentThread
        comments={comments}
        createComment={createCommentAction.bind(null, experimentId, "experiment", experimentId)}
        resolveComment={resolveCommentAction.bind(null, experimentId)}
        reopenComment={reopenCommentAction.bind(null, experimentId)}
      />
    </div>
  );
}
