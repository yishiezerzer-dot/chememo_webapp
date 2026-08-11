import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

export type HealthSnapshot = {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  db: { ok: boolean };
  indexJobs: { pending: number; failed: number };
  evidenceChunks: { pending: number; failed: number };
  ai: { recentSampleSize: number; recentErrorRate: number };
};

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const admin = createAdminClient();

  // head:true count-only requests return an exact count via a header, never
  // row bodies -- unlike a plain .select() (previously used here), they
  // aren't subject to Supabase/PostgREST's ~1000-row response cap, so these
  // stay accurate no matter how large index_jobs/evidence_chunks get.
  const [dbCheck, pendingJobsCheck, failedJobsCheck, pendingChunksCheck, failedChunksCheck, aiCheck] =
    await Promise.all([
      admin.from("experiments").select("id").limit(1),
      admin.from("index_jobs").select("id", { count: "exact", head: true }).in("status", ["pending", "processing"]),
      admin.from("index_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      admin
        .from("evidence_chunks")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "processing"]),
      admin.from("evidence_chunks").select("id", { count: "exact", head: true }).eq("status", "failed"),
      admin
        .from("ai_requests")
        .select("status")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const dbOk = !dbCheck.error;
  if (dbCheck.error) logError("health-service", "db check failed", { error: dbCheck.error });

  const pendingJobs = pendingJobsCheck.count ?? 0;
  const failedJobs = failedJobsCheck.count ?? 0;

  const pendingChunks = pendingChunksCheck.count ?? 0;
  const failedChunks = failedChunksCheck.count ?? 0;

  const aiRows = aiCheck.data ?? [];
  const aiErrors = aiRows.filter((r) => r.status === "error").length;

  return {
    status: !dbOk ? "down" : failedJobs > 0 || failedChunks > 0 ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    db: { ok: dbOk },
    indexJobs: { pending: pendingJobs, failed: failedJobs },
    evidenceChunks: { pending: pendingChunks, failed: failedChunks },
    ai: {
      recentSampleSize: aiRows.length,
      recentErrorRate: aiRows.length ? aiErrors / aiRows.length : 0,
    },
  };
}

export type FailedIndexJob = {
  experimentId: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
};

export async function getFailedIndexJobs(): Promise<FailedIndexJob[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("index_jobs")
    .select("experiment_id, attempts, last_error, next_attempt_at")
    .eq("status", "failed")
    .order("next_attempt_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((j) => ({
    experimentId: j.experiment_id,
    attempts: j.attempts,
    lastError: j.last_error,
    nextAttemptAt: j.next_attempt_at,
  }));
}

export type IndexVersionStatus = {
  model: string | null;
  dimensions: number | null;
  indexedCount: number;
  totalExperiments: number;
};

// T3.1 retired new writes to index_jobs/experiment_embeddings (superseded by
// evidence_chunks below) — this function and its backing tables are now a
// frozen historical snapshot, not deleted. See getEvidenceChunkIndexStatus
// for the real, currently-updating index status.
export async function getIndexVersionStatus(): Promise<IndexVersionStatus> {
  const admin = createAdminClient();
  const [{ data: latest }, { count: indexedCount }, { count: totalExperiments }] = await Promise.all([
    admin
      .from("index_jobs")
      .select("embedding_model, embedding_dimensions")
      .eq("status", "done")
      .not("embedding_model", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("experiment_embeddings")
      .select("experiment_id, experiments!inner(deleted_at)", { count: "exact", head: true })
      .is("experiments.deleted_at", null),
    admin.from("experiments").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);
  return {
    model: latest?.embedding_model ?? null,
    dimensions: latest?.embedding_dimensions ?? null,
    indexedCount: indexedCount ?? 0,
    totalExperiments: totalExperiments ?? 0,
  };
}

export type RecentAiError = {
  endpoint: string;
  model: string | null;
  createdAt: string | null;
};

export async function getRecentAiErrors(): Promise<RecentAiError[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("ai_requests")
    .select("endpoint, model, created_at")
    .eq("status", "error")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((r) => ({ endpoint: r.endpoint, model: r.model, createdAt: r.created_at }));
}

export type EvidenceChunkIndexStatus = {
  totalChunks: number;
  byStatus: Record<string, number>;
  bySourceType: Record<string, number>;
  model: string | null;
  dimensions: number | null;
  embeddingVersion: number | null;
  indexedAtRange: { earliest: string | null; latest: string | null };
};

// T3.1 D6 — the real, currently-updating index status, replacing
// getIndexVersionStatus's now-frozen index_jobs-derived placeholder above.
export async function getEvidenceChunkIndexStatus(): Promise<EvidenceChunkIndexStatus> {
  const admin = createAdminClient();

  // A plain .select() caps out at Supabase/PostgREST's ~1000-row response
  // limit, silently returning an incomplete (and non-obviously incomplete --
  // no error, no truncation flag) slice of the table once evidence_chunks
  // grows past it. Page through with .range() to see every row.
  const pageSize = 1000;
  const rows: { status: string; source_type: string; embedding_model: string | null; embedding_dimensions: number | null; embedding_version: number | null; indexed_at: string | null }[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data: page } = await admin
      .from("evidence_chunks")
      .select("status, source_type, embedding_model, embedding_dimensions, embedding_version, indexed_at")
      .range(from, from + pageSize - 1);
    if (!page || page.length === 0) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  const byStatus: Record<string, number> = {};
  const bySourceType: Record<string, number> = {};
  let model: string | null = null;
  let dimensions: number | null = null;
  let embeddingVersion: number | null = null;
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    bySourceType[r.source_type] = (bySourceType[r.source_type] ?? 0) + 1;
    if (r.indexed_at) {
      if (!earliest || r.indexed_at < earliest) earliest = r.indexed_at;
      if (!latest || r.indexed_at > latest) latest = r.indexed_at;
      model = r.embedding_model ?? model;
      dimensions = r.embedding_dimensions ?? dimensions;
      embeddingVersion = r.embedding_version ?? embeddingVersion;
    }
  }

  return {
    totalChunks: rows.length,
    byStatus,
    bySourceType,
    model,
    dimensions,
    embeddingVersion,
    indexedAtRange: { earliest, latest },
  };
}

export type FailedEvidenceChunk = {
  id: string;
  sourceType: string;
  sourceId: string;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: string;
};

export async function getFailedEvidenceChunks(): Promise<FailedEvidenceChunk[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("evidence_chunks")
    .select("id, source_type, source_id, attempts, last_error, next_attempt_at")
    .eq("status", "failed")
    .order("next_attempt_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((c) => ({
    id: c.id,
    sourceType: c.source_type,
    sourceId: c.source_id,
    attempts: c.attempts,
    lastError: c.last_error,
    nextAttemptAt: c.next_attempt_at,
  }));
}

// T0.10 — manual entry, not auto-detected: chememo (prod) currently has zero
// Supabase backups and PITR disabled (checked 2026-07-26 via
// `supabase backups list --project-ref iazuubcyxneavrahjgww`), which needs a
// paid-plan upgrade to fix. Update this by hand once a real restore test has
// actually been run, per the plan's "manual entry ok initially" note.
export const BACKUP_TEST_STATUS = {
  lastTestedAt: null as string | null,
  note: "No backup capability on the current Supabase plan (PITR off, 0 backups) — a restore test is blocked on a paid-plan upgrade. Known, tracked gap; not yet run.",
};
