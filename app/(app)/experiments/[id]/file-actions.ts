"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "experiment-files";

// Map a filename/extension to the icon category the detail UI understands.
function inferFileType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "tif", "tiff"].includes(ext)) return "image";
  if (["xls", "xlsx", "csv"].includes(ext)) return "excel";
  if (["pdf"].includes(ext)) return "report";
  if (["fid", "nmr", "mzml", "raw"].includes(ext)) return "spectra";
  return "image";
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function uploadFile(experimentId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;

  const path = `${experimentId}/${Date.now()}_${sanitize(file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined });
  if (upErr) throw upErr;

  const { error: rowErr } = await supabase.from("experiment_files").insert({
    experiment_id: experimentId,
    kind: "upload",
    file_type: inferFileType(file.name),
    label: file.name,
    storage_path: path,
  });
  if (rowErr) {
    // roll back the orphaned object so storage and the table stay consistent
    await supabase.storage.from(BUCKET).remove([path]);
    throw rowErr;
  }

  revalidatePath(`/experiments/${experimentId}`);
}

export async function addFileLink(experimentId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const url = (formData.get("url") as string | null)?.trim();
  const label = (formData.get("label") as string | null)?.trim();
  const fileType = (formData.get("file_type") as string | null)?.trim() || "folder";
  if (!url) return;

  const { error } = await supabase.from("experiment_files").insert({
    experiment_id: experimentId,
    kind: "link",
    file_type: fileType,
    label: label || url,
    url,
  });
  if (error) throw error;

  revalidatePath(`/experiments/${experimentId}`);
}

export async function removeFile(fileId: string, experimentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: row } = await supabase
    .from("experiment_files")
    .select("kind, storage_path")
    .eq("id", fileId)
    .maybeSingle();

  if (row?.kind === "upload" && row.storage_path) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
  }
  // RLS on experiment_files restricts deletion to the parent experiment's owner.
  const { error } = await supabase.from("experiment_files").delete().eq("id", fileId);
  if (error) throw error;

  revalidatePath(`/experiments/${experimentId}`);
}
