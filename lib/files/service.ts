import "server-only";
import { createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { Json } from "@/lib/database.types";
import type { ExperimentFile, FileRole, FileRetentionState, FileVersion } from "@/lib/types";

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

  const { data: fileRow, error: rowErr } = await supabase
    .from("experiment_files")
    .insert({
      experiment_id: experimentId,
      kind: "upload",
      file_type: inferFileType(file.name),
      label: file.name,
      storage_path: path,
      mime_type: file.type || null,
      byte_size: file.size,
      sha256,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (rowErr) {
    // roll back the orphaned object so storage and the table stay consistent
    await supabase.storage.from(BUCKET).remove([path]);
    throw new AppError("conflict", `Upload failed: ${rowErr.message}`, { cause: rowErr });
  }

  // T2.7 D1 — every upload's first physical copy is version 1. Insert-then-
  // backfill-the-pointer, same order T1.5 used for protocols/protocol_versions.
  const { data: versionRow, error: versionErr } = await supabase
    .from("file_versions")
    .insert({
      experiment_file_id: fileRow.id,
      version_number: 1,
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type || null,
      byte_size: file.size,
      sha256,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (versionErr) throw new AppError("conflict", `Upload failed: ${versionErr.message}`, { cause: versionErr });
  await supabase.from("experiment_files").update({ current_version_id: versionRow.id }).eq("id", fileRow.id);
}

// T2.7 D2 — "replace with new version": inserts a new file_versions row and
// moves current_version_id forward. The prior version's row and storage
// object are never touched, per §16.4 "never overwrite raw instrument files."
export async function replaceFile(
  supabase: Supabase,
  experimentId: string,
  userId: string,
  experimentFileId: string,
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

  const { data: existingVersions, error: listErr } = await supabase
    .from("file_versions")
    .select("version_number")
    .eq("experiment_file_id", experimentFileId)
    .order("version_number", { ascending: false })
    .limit(1);
  if (listErr) throw new AppError("conflict", `Could not replace file: ${listErr.message}`, { cause: listErr });
  const nextVersion = (existingVersions?.[0]?.version_number ?? 0) + 1;

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const path = `${experimentId}/${Date.now()}_${sanitize(file.name)}`;
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: file.type || undefined });
  if (upErr) throw new AppError("provider-unavailable", `Upload failed: ${upErr.message}`, { cause: upErr });

  const { data: versionRow, error: versionErr } = await supabase
    .from("file_versions")
    .insert({
      experiment_file_id: experimentFileId,
      version_number: nextVersion,
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type || null,
      byte_size: file.size,
      sha256,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (versionErr) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw new AppError("conflict", `Could not replace file: ${versionErr.message}`, { cause: versionErr });
  }

  const { error: updateErr } = await supabase
    .from("experiment_files")
    .update({
      current_version_id: versionRow.id,
      storage_path: path,
      mime_type: file.type || null,
      byte_size: file.size,
      sha256,
    })
    .eq("id", experimentFileId);
  if (updateErr) throw new AppError("conflict", `Could not replace file: ${updateErr.message}`, { cause: updateErr });
}

export async function listVersions(experimentFileId: string): Promise<FileVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("file_versions")
    .select("*")
    .eq("experiment_file_id", experimentFileId)
    .order("version_number", { ascending: false });
  if (error) throw error;
  return (data ?? []) as FileVersion[];
}

export type FileMetadataFields = {
  file_role: FileRole | null;
  source_instrument: string | null;
  acquisition_timestamp: string | null;
  parsed_metadata: Record<string, unknown>;
  retention_state: FileRetentionState;
};

export async function updateFileMetadata(supabase: Supabase, fileId: string, fields: FileMetadataFields): Promise<void> {
  const { error } = await supabase
    .from("experiment_files")
    .update({ ...fields, parsed_metadata: fields.parsed_metadata as Json })
    .eq("id", fileId);
  if (error) throw new AppError("conflict", `Could not update file metadata: ${error.message}`, { cause: error });
}

// T2.7 D5 — tags an experiment-level file as evidence for a specific
// analysis run, without touching T2.5's separate analysis_files table.
export async function linkFileToRun(supabase: Supabase, fileId: string, analysisRunId: string): Promise<void> {
  const { error } = await supabase.from("experiment_files").update({ analysis_run_id: analysisRunId }).eq("id", fileId);
  if (error) throw new AppError("conflict", `Could not link file to run: ${error.message}`, { cause: error });
}

export async function unlinkFileFromRun(supabase: Supabase, fileId: string): Promise<void> {
  const { error } = await supabase.from("experiment_files").update({ analysis_run_id: null }).eq("id", fileId);
  if (error) throw new AppError("conflict", `Could not unlink file: ${error.message}`, { cause: error });
}

// T2.7 D6 — "unlinked file inbox": a computed view, not a stored flag.
export async function listUnlinkedFiles(experimentId: string): Promise<ExperimentFile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiment_files")
    .select("*")
    .eq("experiment_id", experimentId)
    .eq("kind", "upload")
    .is("analysis_run_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExperimentFile[];
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
  // T2.7: a file may now have multiple versions, each its own Storage
  // object — fetch every version's path before deleting, since the FK
  // cascade removes the file_versions DB rows but not their Storage objects.
  const { data: versions } = await supabase.from("file_versions").select("storage_path").eq("experiment_file_id", fileId);

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

  if (deleted.kind === "upload") {
    const paths = new Set((versions ?? []).map((v) => v.storage_path).filter(Boolean) as string[]);
    if (deleted.storage_path) paths.add(deleted.storage_path);
    if (paths.size > 0) await supabase.storage.from(BUCKET).remove([...paths]);
  }
}

// Audit §3 "soft delete orphans" — soft-deleting a draft experiment (the
// only status DeleteExperimentButton allows) left its files rows and
// storage objects behind forever. A draft has no real work invested yet,
// so removing its attachments outright (not just the experiment row) is
// safe and matches what "delete" means for that stage.
export async function deleteAllFiles(supabase: Supabase, experimentId: string): Promise<void> {
  const { data: fileRows } = await supabase.from("experiment_files").select("id").eq("experiment_id", experimentId).eq("kind", "upload");
  const fileIds = (fileRows ?? []).map((f) => f.id);
  const { data: versions } =
    fileIds.length > 0
      ? await supabase.from("file_versions").select("storage_path").in("experiment_file_id", fileIds)
      : { data: [] as { storage_path: string }[] };

  const { data: deleted, error } = await supabase
    .from("experiment_files")
    .delete()
    .eq("experiment_id", experimentId)
    .select("kind, storage_path");
  if (error) {
    throw new AppError("conflict", `Could not remove attached files: ${error.message}`, { cause: error });
  }
  const paths = new Set<string>();
  for (const f of deleted ?? []) {
    if (f.kind === "upload" && f.storage_path) paths.add(f.storage_path);
  }
  for (const v of versions ?? []) {
    if (v.storage_path) paths.add(v.storage_path);
  }
  if (paths.size > 0) {
    await supabase.storage.from(BUCKET).remove([...paths]);
  }
}
