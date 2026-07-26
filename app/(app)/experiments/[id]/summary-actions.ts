"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import { isLlmEnabled } from "@/lib/llm";
import { acquireAiSlot, generateSingleSummary } from "@/lib/ai/service";

// Generate + cache a grounded single-experiment summary. No-ops (inert) until
// an ANTHROPIC key exists, or silently skips when rate/concurrency-limited
// (same shape — no new UI needed). Regenerating replaces the prior single-scope row.
export async function generateSummary(experimentId: string) {
  const { supabase, user } = await requireUser();
  if (!isLlmEnabled()) return; // Phase 10 flips this on

  let slot: { release: () => void };
  try {
    slot = await acquireAiSlot(user.id);
  } catch {
    return;
  }
  try {
    const summary = await generateSingleSummary(supabase, user.id, experimentId);
    if (!summary) return;
    revalidatePath(`/experiments/${experimentId}`);
  } finally {
    slot.release();
  }
}
