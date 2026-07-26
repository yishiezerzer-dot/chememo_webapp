import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireConcurrency, checkRate } from "@/lib/rate-limit";
import { activeChatModel, summarizeExperiment, summarizeGroup } from "@/lib/llm";
import { AppError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type { Experiment } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AiEndpoint = "ask_grounded" | "ask_general" | "summary_single" | "summary_group";

// Acquire the per-user + global concurrency slot shared by every AI call
// (Ask, single summary, group summary) — a typed, throw-based replacement
// for the `{ok:false, error}` shape each call site used to check separately.
export async function acquireAiSlot(userId: string): Promise<{ release: () => void }> {
  const rate = checkRate(userId);
  if (!rate.ok) throw new AppError("rate-limited", rate.error);
  const slot = acquireConcurrency(userId);
  if (!slot.ok) throw new AppError("rate-limited", slot.error);
  return { release: slot.release };
}

export async function logAiRequest(row: {
  userId: string;
  endpoint: AiEndpoint;
  status: "ok" | "error";
  sourceCount: number;
  latencyMs: number;
  estTokens: number | null;
}): Promise<void> {
  const { error } = await createAdminClient().from("ai_requests").insert({
    user_id: row.userId,
    endpoint: row.endpoint,
    status: row.status,
    source_count: row.sourceCount,
    model: activeChatModel(),
    est_tokens: row.estTokens,
    latency_ms: row.latencyMs,
  });
  if (error) logError("ai-service", "failed to log ai_requests row", { error });
}

// Group summary of a set of experiments (Ask's grounded results). Reads via
// the caller's session so RLS applies; null when the ids resolve to nothing.
export async function summarizeExperimentGroup(
  supabase: Supabase,
  userId: string,
  ids: string[]
): Promise<string | null> {
  if (!ids.length) return null;
  const startedAt = Date.now();
  try {
    const { data: experiments } = await supabase
      .from("experiments")
      .select("*")
      .in("id", ids)
      .is("deleted_at", null);
    if (!experiments?.length) return null;

    // See the narrowing note in lib/types.ts for why this cast is safe.
    const summary = await summarizeGroup(experiments as Experiment[]);
    await logAiRequest({
      userId,
      endpoint: "summary_group",
      status: summary ? "ok" : "error",
      sourceCount: experiments.length,
      latencyMs: Date.now() - startedAt,
      estTokens: summary ? Math.ceil(summary.length / 4) : null,
    });
    return summary;
  } catch (e) {
    await logAiRequest({
      userId,
      endpoint: "summary_group",
      status: "error",
      sourceCount: ids.length,
      latencyMs: Date.now() - startedAt,
      estTokens: null,
    });
    throw e;
  }
}

// Generate + cache a grounded single-experiment summary. Reads via the
// caller's session so RLS confirms visibility; writes via the service role
// (AI content is trusted server output) — replaces any existing single-scope
// summary so the cache holds just the latest.
export async function generateSingleSummary(
  supabase: Supabase,
  userId: string,
  experimentId: string
): Promise<string | null> {
  const startedAt = Date.now();
  const { data: experiment } = await supabase
    .from("experiments")
    .select("*")
    .eq("id", experimentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!experiment) return null;

  // See the narrowing note in lib/types.ts for why this cast is safe.
  const summary = await summarizeExperiment(experiment as Experiment);
  await logAiRequest({
    userId,
    endpoint: "summary_single",
    status: summary ? "ok" : "error",
    sourceCount: 1,
    latencyMs: Date.now() - startedAt,
    estTokens: summary ? Math.ceil(summary.length / 4) : null,
  });
  if (!summary) return null;

  const admin = createAdminClient();
  await admin
    .from("ai_summaries")
    .delete()
    .eq("experiment_id", experimentId)
    .eq("scope", "single");
  await admin.from("ai_summaries").insert({
    experiment_id: experimentId,
    scope: "single",
    summary,
    model: activeChatModel(),
    source_ids: [experimentId],
  });
  return summary;
}
