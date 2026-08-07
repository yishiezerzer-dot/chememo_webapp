"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as filesService from "@/lib/files/service";
import * as analyticalService from "@/lib/analytical/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, FileRole, FileRetentionState } from "@/lib/types";

export async function uploadFile(
  experimentId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const file = formData.get("file") as File | null;

  try {
    await filesService.uploadFile(supabase, experimentId, user.id, file);
  } catch (e) {
    return toActionResult("uploadFile", e);
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function addFileLink(
  experimentId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const url = (formData.get("url") as string | null)?.trim() ?? "";
  const label = (formData.get("label") as string | null)?.trim() || null;
  const fileType = (formData.get("file_type") as string | null)?.trim() || "folder";

  try {
    await filesService.addFileLink(supabase, experimentId, user.id, url, label, fileType);
  } catch (e) {
    return toActionResult("addFileLink", e);
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function removeFile(
  fileId: string,
  experimentId: string
): Promise<ActionResult> {
  const { supabase } = await requireUser();

  try {
    await filesService.removeFile(supabase, fileId);
  } catch (e) {
    return toActionResult("removeFile", e);
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function replaceFileAction(
  experimentId: string,
  experimentFileId: string,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const file = formData.get("file") as File | null;

  try {
    await filesService.replaceFile(supabase, experimentId, user.id, experimentFileId, file);
  } catch (e) {
    return toActionResult("replaceFileAction", e);
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function listVersionsAction(experimentFileId: string) {
  return filesService.listVersions(experimentFileId);
}

export async function updateFileMetadataAction(
  experimentId: string,
  fileId: string,
  fileRole: FileRole | null,
  sourceInstrument: string,
  acquisitionTimestamp: string,
  parsedMetadata: Record<string, unknown>,
  retentionState: FileRetentionState
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await filesService.updateFileMetadata(supabase, fileId, {
      file_role: fileRole,
      source_instrument: sourceInstrument.trim() || null,
      acquisition_timestamp: acquisitionTimestamp || null,
      parsed_metadata: parsedMetadata,
      retention_state: retentionState,
    });
  } catch (e) {
    return toActionResult("updateFileMetadataAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function listUnlinkedFilesAction(experimentId: string) {
  return filesService.listUnlinkedFiles(experimentId);
}

export async function linkFileToRunAction(experimentId: string, fileId: string, analysisRunId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await filesService.linkFileToRun(supabase, fileId, analysisRunId);
  } catch (e) {
    return toActionResult("linkFileToRunAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function unlinkFileFromRunAction(experimentId: string, fileId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await filesService.unlinkFileFromRun(supabase, fileId);
  } catch (e) {
    return toActionResult("unlinkFileFromRunAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function listRunsForFileLinkAction(experimentId: string) {
  return analyticalService.listRunsForExperiment(experimentId);
}
