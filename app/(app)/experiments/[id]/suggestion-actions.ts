"use server";

import { createClient } from "@/lib/supabase/server";
import { isLlmEnabled, type CitedAnswer } from "@/lib/llm";
import { acquireAiSlot, suggestNextExperimentForRecord } from "@/lib/ai/service";

// T3.6 D6 — same shape as compare-actions.ts's assists: reads via the
// caller's own session so RLS applies, returns null on any disabled/rate-
// limited/no-result condition (no new UI state needed — the button just
// stays available to retry).
export async function suggestNextExperiment(experimentId: string): Promise<CitedAnswer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!isLlmEnabled()) return null;

  let slot: { release: () => void };
  try {
    slot = await acquireAiSlot(user.id);
  } catch {
    return null;
  }
  try {
    return await suggestNextExperimentForRecord(supabase, user.id, experimentId);
  } finally {
    slot.release();
  }
}
