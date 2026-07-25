// T0.5 — Next.js's official server-startup hook (stable, no config needed).
// Starts the index-jobs safety-net poller once when the Node.js server boots.
// Gated to the nodejs runtime so this never tries to run under edge/middleware.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startIndexJobPoller } = await import("@/lib/index-jobs");
    startIndexJobPoller();
  }
}
