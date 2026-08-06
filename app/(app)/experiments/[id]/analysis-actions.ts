"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as analyticalService from "@/lib/analytical/service";
import { listControlledVocab } from "@/lib/experiments/service";
import { validateAnalysisStatus, validateResultConfidence, validateAssignmentConfidence } from "@/lib/schemas";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, AnalysisFileRole } from "@/lib/types";
import type { PeakFields } from "@/lib/analytical/service";

export async function createRunAction(
  experimentId: string,
  sampleId: string,
  instrumentMethodId: string,
  status: string,
  operator: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const allowed = await listControlledVocab("analysis_status");
  const err = validateAnalysisStatus(status, allowed);
  if (err) return { ok: false, error: err };

  try {
    await analyticalService.createRun(supabase, user.id, sampleId, instrumentMethodId, status, operator.trim() || null);
  } catch (e) {
    return toActionResult("createRunAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function addFileAction(
  experimentId: string,
  analysisRunId: string,
  fileRole: AnalysisFileRole,
  filename: string,
  url: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  try {
    await analyticalService.addFile(supabase, user.id, analysisRunId, fileRole, filename.trim() || null, url.trim() || null);
  } catch (e) {
    return toActionResult("addFileAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function createResultAction(
  experimentId: string,
  analysisRunId: string,
  resultConfidence: string,
  summary: string,
  details: Record<string, unknown>
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  if (resultConfidence) {
    const allowed = await listControlledVocab("result_confidence");
    const err = validateResultConfidence(resultConfidence, allowed);
    if (err) return { ok: false, error: err };
  }

  try {
    await analyticalService.createResult(supabase, user.id, analysisRunId, resultConfidence || null, summary.trim() || null, details);
  } catch (e) {
    return toActionResult("createResultAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function addPeakAction(experimentId: string, analysisResultId: string, fields: PeakFields): Promise<ActionResult> {
  const { supabase } = await requireUser();

  if (fields.confidence) {
    const allowed = await listControlledVocab("assignment_confidence");
    const err = validateAssignmentConfidence(fields.confidence, allowed);
    if (err) return { ok: false, error: err };
  }

  try {
    await analyticalService.addPeak(supabase, analysisResultId, fields);
  } catch (e) {
    return toActionResult("addPeakAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function getSampleRunsAction(sampleId: string) {
  return analyticalService.listRuns(sampleId);
}

export async function getRunDetailAction(runId: string) {
  const [files, results] = await Promise.all([analyticalService.listFiles(runId), analyticalService.listResults(runId)]);
  return { files, results };
}

export async function getResultPeaksAction(resultId: string) {
  return analyticalService.listPeaks(resultId);
}
