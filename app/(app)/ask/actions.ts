"use server";

import { createClient } from "@/lib/supabase/server";
import { isLlmEnabled } from "@/lib/llm";
import { acquireAiSlot, summarizeExperimentGroup } from "@/lib/ai/service";

// Summarise a set of experiments (the grounded results of an Ask). Reads via
// the user's session so RLS applies; returns null when AI is off, rate/
// concurrency-limited, or the ids resolve to nothing (same silent-no-op shape
// as the AI-disabled case — no new UI needed here; deliberately does NOT
// redirect on a missing session like other actions, since this is a
// background call from an in-progress Ask conversation). Generated on demand
// (not cached) — it's tied to a query.
export async function generateGroupSummary(ids: string[]): Promise<string | null> {
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
    return await summarizeExperimentGroup(supabase, user.id, ids);
  } finally {
    slot.release();
  }
}
