"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLlmEnabled, summarizeExperiment, activeChatModel } from "@/lib/llm";
import { acquireConcurrency, checkRate } from "@/lib/rate-limit";

// Generate + cache a grounded single-experiment summary. No-ops (inert) until
// an ANTHROPIC key exists, or silently skips when rate/concurrency-limited
// (same shape — no new UI needed). Regenerating replaces the prior single-scope row.
export async function generateSummary(experimentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!isLlmEnabled()) return; // Phase 10 flips this on
  if (!checkRate(user.id).ok) return;
  const slot = acquireConcurrency(user.id);
  if (!slot.ok) return;

  const startedAt = Date.now();
  try {
    // Read via the user's session so RLS confirms they may see this experiment.
    const { data: experiment } = await supabase
      .from("experiments")
      .select("*")
      .eq("id", experimentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!experiment) return;

    const summary = await summarizeExperiment(experiment);
    const admin = createAdminClient();
    await admin.from("ai_requests").insert({
      user_id: user.id,
      endpoint: "summary_single",
      status: summary ? "ok" : "error",
      source_count: 1,
      model: activeChatModel(),
      est_tokens: summary ? Math.ceil(summary.length / 4) : null,
      latency_ms: Date.now() - startedAt,
    });
    if (!summary) return;

    // Write with the service role (AI content is trusted server output); replace
    // any existing single-scope summary so the cache holds just the latest.
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

    revalidatePath(`/experiments/${experimentId}`);
  } finally {
    slot.release();
  }
}
