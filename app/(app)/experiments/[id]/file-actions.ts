"use server";

import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

const BUCKET = "experiment-files";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // matches the bucket's file_size_limit
const ALLOWED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "tif", "tiff",
  "xls", "xlsx", "csv",
  "pdf",
  "fid", "nmr", "mzml", "raw",
]);

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

// https-only, no embedded credentials — javascript:/data:/file: links would
// otherwise render as a clickable <a href> and execute in another lab
// member's session when clicked.
function validateLinkUrl(raw: string): { ok: true } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: "Enter a valid URL." };
  }
  if (parsed.protocol !== "https:") return { ok: false, error: "Only https:// links are allowed." };
  if (parsed.username || parsed.password) {
    return { ok: false, error: "URLs with embedded credentials are not allowed." };
  }
  return { ok: true };
}

export async function uploadFile(
  experimentId: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No file selected." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "File is too large (max 10 MB)." };
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { ok: false, error: `.${ext || "(none)"} files aren't supported here.` };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const path = `${experimentId}/${Date.now()}_${sanitize(file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type || undefined });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const { error: rowErr } = await supabase.from("experiment_files").insert({
    experiment_id: experimentId,
    kind: "upload",
    file_type: inferFileType(file.name),
    label: file.name,
    storage_path: path,
    mime_type: file.type || null,
    byte_size: file.size,
    sha256,
    uploaded_by: user.id,
  });
  if (rowErr) {
    // roll back the orphaned object so storage and the table stay consistent
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: `Upload failed: ${rowErr.message}` };
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function addFileLink(
  experimentId: string,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const url = (formData.get("url") as string | null)?.trim();
  const label = (formData.get("label") as string | null)?.trim();
  const fileType = (formData.get("file_type") as string | null)?.trim() || "folder";
  if (!url) return { ok: false, error: "Enter a URL to link." };

  const urlCheck = validateLinkUrl(url);
  if (!urlCheck.ok) return { ok: false, error: urlCheck.error };

  const { error } = await supabase.from("experiment_files").insert({
    experiment_id: experimentId,
    kind: "link",
    file_type: fileType,
    label: label || url,
    url,
    uploaded_by: user.id,
  });
  if (error) return { ok: false, error: `Could not add link: ${error.message}` };

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function removeFile(
  fileId: string,
  experimentId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS on experiment_files restricts deletion to the parent experiment's
  // owner — delete first and only touch storage once that's confirmed, so a
  // non-owner's (RLS-blocked) call can never remove the storage object.
  const { data: deleted, error } = await supabase
    .from("experiment_files")
    .delete()
    .eq("id", fileId)
    .select("kind, storage_path")
    .maybeSingle();
  if (error) return { ok: false, error: `Could not remove file: ${error.message}` };
  if (!deleted) return { ok: false, error: "File not found or you don't have permission to remove it." };

  if (deleted.kind === "upload" && deleted.storage_path) {
    await supabase.storage.from(BUCKET).remove([deleted.storage_path]);
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
