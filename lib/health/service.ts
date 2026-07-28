import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

export type HealthSnapshot = {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  db: { ok: boolean };
  indexJobs: { pending: number; failed: number };
  ai: { recentSampleSize: number; recentErrorRate: number };
};

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  const admin = createAdminClient();

  const [dbCheck, jobsCheck, aiCheck] = await Promise.all([
    admin.from("experiments").select("id").limit(1),
    admin.from("index_jobs").select("status").neq("status", "done"),
    admin
      .from("ai_requests")
      .select("status")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const dbOk = !dbCheck.error;
  if (dbCheck.error) logError("health-service", "db check failed", { error: dbCheck.error });

  const jobs = jobsCheck.data ?? [];
  const pendingJobs = jobs.filter((j) => j.status === "pending" || j.status === "processing").length;
  const failedJobs = jobs.filter((j) => j.status === "failed").length;

  const aiRows = aiCheck.data ?? [];
  const aiErrors = aiRows.filter((r) => r.status === "error").length;

  return {
    status: !dbOk ? "down" : failedJobs > 0 ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    db: { ok: dbOk },
    indexJobs: { pending: pendingJobs, failed: failedJobs },
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

// "Version" here means the embedding model/dims of the most recently
// completed job — good enough signal until T3.1 formally versions the index.
// indexedCount comes from experiment_embeddings directly (the real coverage
// signal), not index_jobs — older experiments that predate the T0.5 job
// queue and haven't been re-saved since have a real embedding but no job row.
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

// T0.10 — manual entry, not auto-detected: chememo (prod) currently has zero
// Supabase backups and PITR disabled (checked 2026-07-26 via
// `supabase backups list --project-ref iazuubcyxneavrahjgww`), which needs a
// paid-plan upgrade to fix. Update this by hand once a real restore test has
// actually been run, per the plan's "manual entry ok initially" note.
export const BACKUP_TEST_STATUS = {
  lastTestedAt: null as string | null,
  note: "No backup capability on the current Supabase plan (PITR off, 0 backups) — a restore test is blocked on a paid-plan upgrade. Known, tracked gap; not yet run.",
};
