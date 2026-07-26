import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/logger";

// Unauthenticated readiness/health signal (T0.9). Returns only aggregate
// counts — no row content, no PII, no secrets — so it's safe for an external
// uptime monitor or Railway healthcheck to poll. A visual dashboard over
// this data is T0.10, not this endpoint.
export async function GET() {
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
  if (dbCheck.error) logError("api/health", "db check failed", { error: dbCheck.error });

  const jobs = jobsCheck.data ?? [];
  const pendingJobs = jobs.filter((j) => j.status === "pending" || j.status === "processing").length;
  const failedJobs = jobs.filter((j) => j.status === "failed").length;

  const aiRows = aiCheck.data ?? [];
  const aiErrors = aiRows.filter((r) => r.status === "error").length;

  const status = !dbOk ? "down" : failedJobs > 0 ? "degraded" : "ok";

  return Response.json(
    {
      status,
      timestamp: new Date().toISOString(),
      db: { ok: dbOk },
      indexJobs: { pending: pendingJobs, failed: failedJobs },
      ai: {
        recentSampleSize: aiRows.length,
        recentErrorRate: aiRows.length ? aiErrors / aiRows.length : 0,
      },
    },
    { status: dbOk ? 200 : 503 }
  );
}
