import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError, logInfo } from "@/lib/logger";

// T2.7 D4 — a durable file-processing queue, reusing T0.5's index_jobs
// PATTERN (status enum, attempts/next_attempt_at backoff, a setInterval
// poller registered once from instrumentation.ts) but a new table, since
// index_jobs is keyed 1:1 by experiment_id for a single job type and can't
// hold multiple concurrent job types per file version. Rows are enqueued by
// a DB trigger (see migration 20260816120000_file_versions.sql) in the same
// transaction as every file_versions insert.

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MINUTES = 30;
const BUCKET = "experiment-files";

// Only CSV has a real extractor this pass — a plain UTF-8 decode, no new
// dependency. XLSX/PDF text_extract and every thumbnail job resolve
// 'not_applicable' (Yishi's explicit choice: prove the queue end-to-end now,
// a future worker just adds the real processor for these mime types).
const CSV_MIME_TYPES = new Set(["text/csv"]);
const TEXT_EXTRACT_PREVIEW_CHARS = 2000;

export async function runFileJob(jobId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: job, error: jobErr } = await admin.from("file_jobs").select("*").eq("id", jobId).maybeSingle();
  if (jobErr || !job) return;

  const { data: version, error: versionErr } = await admin
    .from("file_versions")
    .select("id, storage_path, mime_type")
    .eq("id", job.file_version_id)
    .maybeSingle();
  if (versionErr || !version) {
    await admin.from("file_jobs").update({ status: "failed", last_error: "File version not found.", updated_at: new Date().toISOString() }).eq("id", jobId);
    return;
  }

  try {
    if (job.job_type === "text_extract" && version.mime_type && CSV_MIME_TYPES.has(version.mime_type)) {
      const { data: blob, error: downloadErr } = await admin.storage.from(BUCKET).download(version.storage_path);
      if (downloadErr) throw downloadErr;
      const text = (await blob.text()).slice(0, TEXT_EXTRACT_PREVIEW_CHARS);
      await admin
        .from("file_jobs")
        .update({ status: "done", result: { text }, last_error: null, updated_at: new Date().toISOString() })
        .eq("id", jobId);
      await admin.from("file_versions").update({ processing_state: "done" }).eq("id", version.id);
      return;
    }

    // No processor implemented yet for this job_type/mime_type combination.
    await admin
      .from("file_jobs")
      .update({
        status: "not_applicable",
        last_error: `No ${job.job_type} processor implemented yet for ${version.mime_type ?? "this file type"}.`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    await admin.from("file_versions").update({ processing_state: "not_applicable" }).eq("id", version.id);
  } catch (e) {
    const attempts = job.attempts + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    const backoffMinutes = Math.min(2 ** attempts, MAX_BACKOFF_MINUTES);
    await admin
      .from("file_jobs")
      .update({
        status: failed ? "failed" : "pending",
        attempts,
        last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        next_attempt_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    if (failed) await admin.from("file_versions").update({ processing_state: "failed" }).eq("id", version.id);
    logError("file-jobs", `job ${jobId} failed (attempt ${attempts})`, { error: e });
  }
}

async function pollOnce(): Promise<void> {
  const admin = createAdminClient();

  // See lib/evidence-chunks.ts — same stranded-'processing' flaw, same fix:
  // nothing but this poller ever looks at these rows, and it only selects
  // 'pending', so a worker that dies mid-job orphans the row permanently.
  const { data: reclaimed, error: reclaimError } = await admin.rpc("reclaim_stale_queue_rows", {
    p_table: "file_jobs",
  });
  if (reclaimError) logError("file-jobs", "reclaim failed", { error: reclaimError });
  else if (reclaimed) logInfo("file-jobs", "reclaimed stale processing rows", { count: reclaimed });

  const { data: jobs, error } = await admin
    .from("file_jobs")
    .select("id")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .limit(20);
  if (error) {
    logError("file-jobs", "poll query failed", { error });
    return;
  }
  for (const job of jobs ?? []) {
    await admin.from("file_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", job.id);
    await runFileJob(job.id);
  }
}

let pollerStarted = false;

// Called once from instrumentation.ts on server startup, alongside
// startIndexJobPoller(). Guarded so a dev-mode module reload never starts a
// second interval in the same process.
export function startFileJobsPoller(): void {
  if (pollerStarted) return;
  pollerStarted = true;
  logInfo("file-jobs", "poller started", { intervalMs: POLL_INTERVAL_MS });
  setInterval(() => {
    void pollOnce().catch((e) => logError("file-jobs", "poll cycle failed", { error: e }));
  }, POLL_INTERVAL_MS);
}
