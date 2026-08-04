import "server-only";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";

type Supabase = Awaited<ReturnType<typeof createClient>>;

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
  supabase: Supabase,
  experimentId: string,
  userId: string,
  file: File | null
): Promise<void> {
  if (!file || file.size === 0) throw new AppError("validation", "No file selected.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AppError("validation", "File is too large (max 10 MB).");
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError("validation", `.${ext || "(none)"} files aren't supported here.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const path = `${experimentId}/${Date.now()}_${sanitize(file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type || undefined });
  if (upErr) {
    throw new AppError("provider-unavailable", `Upload failed: ${upErr.message}`, {
      cause: upErr,
    });
  }

  const { error: rowErr } = await supabase.from("experiment_files").insert({
    experiment_id: experimentId,
    kind: "upload",
    file_type: inferFileType(file.name),
    label: file.name,
    storage_path: path,
    mime_type: file.type || null,
    byte_size: file.size,
    sha256,
    uploaded_by: userId,
  });
  if (rowErr) {
    // roll back the orphaned object so storage and the table stay consistent
    await supabase.storage.from(BUCKET).remove([path]);
    throw new AppError("conflict", `Upload failed: ${rowErr.message}`, { cause: rowErr });
  }
}

export async function addFileLink(
  supabase: Supabase,
  experimentId: string,
  userId: string,
  url: string,
  label: string | null,
  fileType: string
): Promise<void> {
  if (!url) throw new AppError("validation", "Enter a URL to link.");
  const urlCheck = validateLinkUrl(url);
  if (!urlCheck.ok) throw new AppError("validation", urlCheck.error);

  const { error } = await supabase.from("experiment_files").insert({
    experiment_id: experimentId,
    kind: "link",
    file_type: fileType,
    label: label || url,
    url,
    uploaded_by: userId,
  });
  if (error) {
    throw new AppError("conflict", `Could not add link: ${error.message}`, { cause: error });
  }
}

export async function removeFile(supabase: Supabase, fileId: string): Promise<void> {
  // RLS on experiment_files restricts deletion to the parent experiment's
  // owner — delete first and only touch storage once that's confirmed, so a
  // non-owner's (RLS-blocked) call can never remove the storage object.
  const { data: deleted, error } = await supabase
    .from("experiment_files")
    .delete()
    .eq("id", fileId)
    .select("kind, storage_path")
    .maybeSingle();
  if (error) {
    throw new AppError("conflict", `Could not remove file: ${error.message}`, { cause: error });
  }
  if (!deleted) {
    throw new AppError(
      "not-found",
      "File not found or you don't have permission to remove it."
    );
  }

  if (deleted.kind === "upload" && deleted.storage_path) {
    await supabase.storage.from(BUCKET).remove([deleted.storage_path]);
  }
}

// Audit §3 "soft delete orphans" — soft-deleting a draft experiment (the
// only status DeleteExperimentButton allows) left its files rows and
// storage objects behind forever. A draft has no real work invested yet,
// so removing its attachments outright (not just the experiment row) is
// safe and matches what "delete" means for that stage.
export async function deleteAllFiles(supabase: Supabase, experimentId: string): Promise<void> {
  const { data: deleted, error } = await supabase
    .from("experiment_files")
    .delete()
    .eq("experiment_id", experimentId)
    .select("kind, storage_path");
  if (error) {
    throw new AppError("conflict", `Could not remove attached files: ${error.message}`, { cause: error });
  }
  const paths = (deleted ?? [])
    .filter((f) => f.kind === "upload" && f.storage_path)
    .map((f) => f.storage_path as string);
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths);
  }
}
