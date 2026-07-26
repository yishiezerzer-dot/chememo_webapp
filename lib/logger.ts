// Structured logging to stdout/stderr — Railway captures both and makes them
// searchable in its dashboard, which is "equivalent" enough for a solo/small-
// lab tool at this stage (no Sentry account/dependency needed). Never pass
// prompt/answer text or secrets as `meta` — only ids, counts, and error
// name/message are logged.

type Level = "info" | "warn" | "error";

function serializeError(err: unknown): { name: string; message: string } | unknown {
  if (err instanceof Error) return { name: err.name, message: err.message };
  return err;
}

function emit(level: Level, context: string, message: string, meta?: Record<string, unknown>) {
  const line = {
    level,
    context,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
  const out = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  out(JSON.stringify(line));
}

export function logInfo(context: string, message: string, meta?: Record<string, unknown>): void {
  emit("info", context, message, meta);
}

export function logWarn(context: string, message: string, meta?: Record<string, unknown>): void {
  emit("warn", context, message, meta);
}

export function logError(
  context: string,
  message: string,
  opts?: { traceId?: string; error?: unknown; meta?: Record<string, unknown> }
): void {
  emit("error", context, message, {
    ...(opts?.traceId ? { traceId: opts.traceId } : {}),
    ...(opts?.error !== undefined ? { error: serializeError(opts.error) } : {}),
    ...opts?.meta,
  });
}
