"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as filesService from "@/lib/files/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

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
