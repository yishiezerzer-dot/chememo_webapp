import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { acquireConcurrency, checkRate } from "@/lib/rate-limit";
import {
  activeChatModel,
  chatProvider,
  summarizeExperiment,
  summarizeGroup,
  detectContradictions,
  generateComparisonTable,
  type CitedAnswer,
  type ComparisonTableSuggestion,
} from "@/lib/llm";
import { embeddingModel, EMBEDDING_DIM, isEmbeddingEnabled } from "@/lib/embeddings";
import { AppError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type { Experiment } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AiEndpoint =
  | "ask_grounded"
  | "ask_general"
  | "summary_single"
  | "summary_group"
  | "comparison_table"
  | "contradiction_check"
  | "crew_plan";

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

// Returns the inserted row's id (for T3.4's ai_retrieval_events/ai_feedback
// to reference), or null if the insert itself failed.
export async function logAiRequest(row: {
  userId: string;
  endpoint: AiEndpoint;
  status: "ok" | "error";
  sourceCount: number;
  latencyMs: number;
  estTokens: number | null;
}): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_requests")
    .insert({
      user_id: row.userId,
      endpoint: row.endpoint,
      status: row.status,
      source_count: row.sourceCount,
      model: activeChatModel(),
      est_tokens: row.estTokens,
      latency_ms: row.latencyMs,
    })
    .select("id")
    .single();
  if (error) {
    logError("ai-service", "failed to log ai_requests row", { error });
    return null;
  }
  void recordModelVersion(admin);
  return data.id;
}

// T3.4 D2 — a distinct (provider, chat_model, embedding_model, dims) tuple is
// recorded once, at first sight; the unique constraint + ignoreDuplicates
// makes repeated calls a no-op without a separate select-then-insert check.
async function recordModelVersion(admin: ReturnType<typeof createAdminClient>): Promise<void> {
  const { error } = await admin.from("ai_model_versions").upsert(
    {
      provider: chatProvider(),
      chat_model: activeChatModel(),
      embedding_model: isEmbeddingEnabled() ? embeddingModel() : null,
      embedding_dimensions: isEmbeddingEnabled() ? EMBEDDING_DIM : null,
    },
    { onConflict: "provider,chat_model,embedding_model,embedding_dimensions", ignoreDuplicates: true }
  );
  if (error) logError("ai-service", "failed to record model version", { error });
}

// T3.4 D4 — thumbs up/down + optional note on a specific ai_requests row.
// Writes via the service role, same trust boundary as ai_summaries' writes.
// Does not verify requestId belongs to userId — RLS still scopes every read
// to the submitting user's own rows, so a mismatched id can't leak data,
// only create a mislabeled feedback row (not worth a lookup query to prevent).
export async function submitAiFeedback(
  userId: string,
  requestId: string,
  rating: "up" | "down",
  note?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient().from("ai_feedback").insert({
    ai_request_id: requestId,
    user_id: userId,
    rating,
    note: note?.trim() || null,
  });
  if (error) {
    logError("ai-service", "failed to record ai feedback", { error });
    return { ok: false, error: "Could not save feedback." };
  }
  return { ok: true };
}

// Group summary of a set of experiments (Ask's grounded results). Reads via
// the caller's session so RLS applies; null when the ids resolve to nothing.
export async function summarizeExperimentGroup(
  supabase: Supabase,
  userId: string,
  ids: string[]
): Promise<CitedAnswer | null> {
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
    const estTokens = summary
      ? Math.ceil(summary.segments.reduce((n, s) => n + s.text.length, 0) / 4)
      : null;
    await logAiRequest({
      userId,
      endpoint: "summary_group",
      status: summary ? "ok" : "error",
      sourceCount: experiments.length,
      latencyMs: Date.now() - startedAt,
      estTokens,
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

// T3.6 D3 — same fetch-by-ids-then-generate-then-log shape as
// summarizeExperimentGroup, for the contradiction-detection assist.
export async function detectExperimentContradictions(
  supabase: Supabase,
  userId: string,
  ids: string[]
): Promise<CitedAnswer | null> {
  if (ids.length < 2) return null;
  const startedAt = Date.now();
  try {
    const { data: experiments } = await supabase
      .from("experiments")
      .select("*")
      .in("id", ids)
      .is("deleted_at", null);
    if (!experiments || experiments.length < 2) return null;

    // See the narrowing note in lib/types.ts for why this cast is safe.
    const result = await detectContradictions(experiments as Experiment[]);
    const estTokens = result ? Math.ceil(result.segments.reduce((n, s) => n + s.text.length, 0) / 4) : null;
    await logAiRequest({
      userId,
      endpoint: "contradiction_check",
      status: result ? "ok" : "error",
      sourceCount: experiments.length,
      latencyMs: Date.now() - startedAt,
      estTokens,
    });
    return result;
  } catch (e) {
    await logAiRequest({
      userId,
      endpoint: "contradiction_check",
      status: "error",
      sourceCount: ids.length,
      latencyMs: Date.now() - startedAt,
      estTokens: null,
    });
    throw e;
  }
}

// T3.6 D2 — same shape, for the condition/result comparison-table assist.
export async function generateExperimentComparisonTable(
  supabase: Supabase,
  userId: string,
  ids: string[]
): Promise<ComparisonTableSuggestion | null> {
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
    const table = await generateComparisonTable(experiments as Experiment[]);
    const estTokens = table ? Math.ceil(JSON.stringify(table).length / 4) : null;
    await logAiRequest({
      userId,
      endpoint: "comparison_table",
      status: table ? "ok" : "error",
      sourceCount: experiments.length,
      latencyMs: Date.now() - startedAt,
      estTokens,
    });
    return table;
  } catch (e) {
    await logAiRequest({
      userId,
      endpoint: "comparison_table",
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
