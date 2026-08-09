import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedText, embeddingModel, EMBEDDING_DIM, isEmbeddingEnabled } from "@/lib/embeddings";
import { logError, logInfo } from "@/lib/logger";

// T3.1 D4 — reuses T0.5/T2.7's queue pattern (status enum, attempts/
// next_attempt_at backoff, a setInterval poller registered once from
// instrumentation.ts) but each evidence_chunks row only ever needs one job
// (embed this content), so the queue columns live directly on the row
// rather than a separate jobs table. Rows are enqueued by a DB trigger on
// each of the 10 source tables (see migration 20260818120000_evidence_chunks.sql).

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MINUTES = 30;
const EMBEDDING_VERSION = 1;

export async function runEvidenceChunkJob(chunkId: string): Promise<void> {
  const admin = createAdminClient();

  if (!isEmbeddingEnabled()) {
    // Nothing to do — mark done so the poller doesn't keep retrying a no-op.
    await admin
      .from("evidence_chunks")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", chunkId);
    return;
  }

  const { data: chunk, error: chunkErr } = await admin
    .from("evidence_chunks")
    .select("content")
    .eq("id", chunkId)
    .maybeSingle();
  if (chunkErr || !chunk) return;

  try {
    const embedding = await embedText(chunk.content);
    if (!embedding) {
      await admin
        .from("evidence_chunks")
        .update({ status: "done", updated_at: new Date().toISOString() })
        .eq("id", chunkId);
      return;
    }
    await admin
      .from("evidence_chunks")
      .update({
        status: "done",
        embedding: JSON.stringify(embedding),
        embedding_model: embeddingModel(),
        embedding_dimensions: EMBEDDING_DIM,
        embedding_version: EMBEDDING_VERSION,
        indexed_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chunkId);
  } catch (e) {
    const { data: row } = await admin
      .from("evidence_chunks")
      .select("attempts")
      .eq("id", chunkId)
      .maybeSingle();
    const attempts = (row?.attempts ?? 0) + 1;
    const failed = attempts >= MAX_ATTEMPTS;
    const backoffMinutes = Math.min(2 ** attempts, MAX_BACKOFF_MINUTES);
    await admin
      .from("evidence_chunks")
      .update({
        status: failed ? "failed" : "pending",
        attempts,
        last_error: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        next_attempt_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", chunkId);
    logError("evidence-chunks", `job ${chunkId} failed (attempt ${attempts})`, { error: e });
  }
}

async function pollOnce(): Promise<void> {
  const admin = createAdminClient();
  const { data: chunks, error } = await admin
    .from("evidence_chunks")
    .select("id")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .limit(20);
  if (error) {
    logError("evidence-chunks", "poll query failed", { error });
    return;
  }
  for (const chunk of chunks ?? []) {
    await admin
      .from("evidence_chunks")
      .update({ status: "processing", updated_at: new Date().toISOString() })
      .eq("id", chunk.id);
    await runEvidenceChunkJob(chunk.id);
  }
}

let pollerStarted = false;

// Called once from instrumentation.ts on server startup, alongside
// startIndexJobPoller()/startFileJobsPoller(). Guarded so a dev-mode module
// reload never starts a second interval in the same process.
export function startEvidenceChunkPoller(): void {
  if (pollerStarted) return;
  pollerStarted = true;
  logInfo("evidence-chunks", "poller started", { intervalMs: POLL_INTERVAL_MS });
  setInterval(() => {
    void pollOnce().catch((e) => logError("evidence-chunks", "poll cycle failed", { error: e }));
  }, POLL_INTERVAL_MS);
}
