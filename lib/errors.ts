import { logError } from "@/lib/logger";
import type { ActionResult } from "@/lib/types";

export type AppErrorCode =
  | "validation"
  | "permission-denied"
  | "not-found"
  | "conflict"
  | "rate-limited"
  | "provider-unavailable"
  | "index-pending";

export const HTTP_STATUS_FOR_CODE: Record<AppErrorCode, number> = {
  validation: 400,
  "permission-denied": 403,
  "not-found": 404,
  conflict: 409,
  "rate-limited": 429,
  "provider-unavailable": 503,
  "index-pending": 409,
};

// A user-safe error with a machine-readable code and a trace ID a user can
// quote back so a bug report correlates with the matching server log line.
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly traceId: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    code: AppErrorCode,
    message: string,
    opts?: { fieldErrors?: Record<string, string>; cause?: unknown }
  ) {
    super(message, opts?.cause === undefined ? undefined : { cause: opts.cause });
    this.code = code;
    this.traceId = crypto.randomUUID();
    this.fieldErrors = opts?.fieldErrors;
  }
}

// Maps any thrown error to a user-facing ActionResult for server actions,
// logging the real cause server-side under a trace ID first. Validation
// errors skip the trace suffix — fieldErrors already pinpoint the problem,
// so a support reference number would only add noise.
export function toActionResult(context: string, error: unknown): Extract<ActionResult, { ok: false }> {
  if (error instanceof AppError) {
    logError(context, error.code, { traceId: error.traceId, error: error.cause ?? error });
    const suffix = error.code === "validation" ? "" : ` (ref ${error.traceId})`;
    return { ok: false, error: `${error.message}${suffix}`, fieldErrors: error.fieldErrors };
  }
  const traceId = crypto.randomUUID();
  logError(context, "unexpected error", { traceId, error });
  return { ok: false, error: `Something went wrong. Please try again. (ref ${traceId})` };
}
