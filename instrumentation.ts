// T0.5 — Next.js's official server-startup hook (stable, no config needed).
// Starts the index-jobs safety-net poller once when the Node.js server boots.
// Gated to the nodejs runtime so this never tries to run under edge/middleware.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startIndexJobPoller } = await import("@/lib/index-jobs");
    startIndexJobPoller();
    // T2.7 — file_jobs' safety-net poller, same startup pattern.
    const { startFileJobsPoller } = await import("@/lib/file-jobs");
    startFileJobsPoller();
    // T3.1 — evidence_chunks' safety-net poller, same startup pattern.
    const { startEvidenceChunkPoller } = await import("@/lib/evidence-chunks");
    startEvidenceChunkPoller();
  }
}

// T0.9 — Next.js's official catch-all for otherwise-unhandled server errors
// (route handlers, Server Components, Server Actions) — the same integration
// point a Sentry SDK would use. Logs a trace ID even for errors that never
// passed through lib/errors.ts's AppError/toActionResult path.
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routeType: string }
) {
  const { logError } = await import("@/lib/logger");
  const { AppError } = await import("@/lib/errors");
  const traceId = error instanceof AppError ? error.traceId : crypto.randomUUID();
  logError("unhandled", `${context.routeType} error on ${request.method} ${request.path}`, {
    traceId,
    error,
  });
}
