// T0.3 — per-user AI rate limiting. In-memory: Railway runs this app as a
// single persistent Node process (not serverless/multi-instance), so a
// process-local Map is enough for now. If the service ever scales to more
// than one instance, this stops coordinating across them and would need a
// shared store (Redis) instead.

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;
const MAX_CONCURRENT_GLOBAL = 5;

const hits = new Map<string, number[]>();
const inFlightPerUser = new Set<string>();
let globalInFlight = 0;

export const MAX_QUERY_CHARS = 2000;
export const MAX_BODY_BYTES = 8 * 1024;

export function checkRate(userId: string): { ok: true } | { ok: false; error: string } {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return { ok: false, error: "Too many AI requests — please wait a moment and try again." };
  }
  recent.push(now);
  hits.set(userId, recent);
  return { ok: true };
}

// Call the returned `release()` in a `finally` once the AI call completes.
// The Set membership check below is itself the "1 concurrent per user" cap.
export function acquireConcurrency(
  userId: string
): { ok: true; release: () => void } | { ok: false; error: string } {
  if (inFlightPerUser.has(userId)) {
    return { ok: false, error: "You already have an AI request in progress." };
  }
  if (globalInFlight >= MAX_CONCURRENT_GLOBAL) {
    return { ok: false, error: "The AI assistant is busy — please try again shortly." };
  }
  inFlightPerUser.add(userId);
  globalInFlight++;
  return {
    ok: true,
    release: () => {
      inFlightPerUser.delete(userId);
      globalInFlight--;
    },
  };
}
