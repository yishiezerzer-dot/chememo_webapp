"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLlmEnabled, activeChatModel, summarizeGroup } from "@/lib/llm";
import { acquireConcurrency, checkRate } from "@/lib/rate-limit";
import type { Experiment } from "@/lib/types";

// Summarise a set of experiments (the grounded results of an Ask). Reads via
// the user's session so RLS applies; returns null when AI is off, rate/
// concurrency-limited, or the ids resolve to nothing (same silent-no-op shape
// as the AI-disabled case — no new UI needed here). Generated on demand (not
// cached) — it's tied to a query.
export async function generateGroupSummary(ids: string[]): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!isLlmEnabled()) return null;
  if (!ids.length) return null;

  if (!checkRate(user.id).ok) return null;
  const slot = acquireConcurrency(user.id);
  if (!slot.ok) return null;

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
    await logAiRequest(user.id, summary ? "ok" : "error", experiments.length, startedAt, summary);
    return summary;
  } catch (e) {
    await logAiRequest(user.id, "error", ids.length, startedAt, null);
    throw e;
  } finally {
    slot.release();
  }
}

async function logAiRequest(
  userId: string,
  status: "ok" | "error",
  sourceCount: number,
  startedAt: number,
  summary: string | null
) {
  const { error } = await createAdminClient().from("ai_requests").insert({
    user_id: userId,
    endpoint: "summary_group",
    status,
    source_count: sourceCount,
    model: activeChatModel(),
    est_tokens: summary ? Math.ceil(summary.length / 4) : null,
    latency_ms: Date.now() - startedAt,
  });
  if (error) console.error("[ask/actions] failed to log ai_requests row:", error);
}
