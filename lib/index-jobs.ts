import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncExperimentEmbedding } from "@/lib/sync-embedding";
import { embeddingModel, EMBEDDING_DIM, isEmbeddingEnabled } from "@/lib/embeddings";
import { logError, logInfo } from "@/lib/logger";

// T0.5 — durable indexing job queue. A DB trigger (see migration
// 20260725120000_index_jobs.sql) upserts a pending index_jobs row in the
// same transaction as every experiment insert/update, so the job survives
// even if this process crashes before the fire-and-forget embed call below
// finishes. runIndexJob is the single entry point both the immediate
// fast-path attempt (new/actions.ts) and the safety-net poller use, so a
// job's status always reflects the true outcome of the last attempt.

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MINUTES = 30;

export async function runIndexJob(experimentId: string): Promise<void> {
  const admin = createAdminClient();

  if (!isEmbeddingEnabled()) {
    // Nothing to do — mark done so the poller doesn't keep retrying a no-op.
    await admin
      .from("index_jobs")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("experiment_id", experimentId);
    return;
  }

  try {
    await syncExperimentEmbedding(experimentId);
    await admin
      .from("index_jobs")
      .update({
        status: "done",
        embedding_model: embeddingModel(),
        embedding_dimensions: EMBEDDING_DIM,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("experiment_id", experimentId);
  } catch (e) {
    const { data: row } = await admin
      .from("index_jobs")
      .select("attempts")
      .eq("experiment_id", experimentId)
      .maybeSingle();
    const attempts = (row?.attempts ?? 0) + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    const backoffMinutes = Math.min(2 ** attempts, MAX_BACKOFF_MINUTES);
    await admin
      .from("index_jobs")
      .update({
        status: failed ? "failed" : "pending",
        attempts,
        last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        next_attempt_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("experiment_id", experimentId);
    logError("index-jobs", `job ${experimentId} failed (attempt ${attempts})`, { error: e });
  }
}

async function pollOnce(): Promise<void> {
  const admin = createAdminClient();
  const { data: jobs, error } = await admin
    .from("index_jobs")
    .select("experiment_id")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .limit(20);
  if (error) {
    logError("index-jobs", "poll query failed", { error });
    return;
  }
  for (const job of jobs ?? []) {
    await admin
      .from("index_jobs")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("experiment_id", job.experiment_id);
    await runIndexJob(job.experiment_id);
  }
}

let pollerStarted = false;

// Called once from instrumentation.ts on server startup. Guarded so a
// dev-mode module reload (or an accidental second import) never starts a
// second interval in the same process.
export function startIndexJobPoller(): void {
  if (pollerStarted) return;
  pollerStarted = true;
  logInfo("index-jobs", "poller started", { intervalMs: POLL_INTERVAL_MS });
  setInterval(() => {
    void pollOnce().catch((e) => logError("index-jobs", "poll cycle failed", { error: e }));
  }, POLL_INTERVAL_MS);
}
