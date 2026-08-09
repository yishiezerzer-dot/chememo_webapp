"use server";

import { createClient } from "@/lib/supabase/server";
import { isLlmEnabled, type CitedAnswer } from "@/lib/llm";
import { acquireAiSlot, summarizeExperimentGroup, submitAiFeedback as submitAiFeedbackService } from "@/lib/ai/service";

// Summarise a set of experiments (the grounded results of an Ask). Reads via
// the user's session so RLS applies; returns null when AI is off, rate/
// concurrency-limited, or the ids resolve to nothing (same silent-no-op shape
// as the AI-disabled case — no new UI needed here; deliberately does NOT
// redirect on a missing session like other actions, since this is a
// background call from an in-progress Ask conversation). Generated on demand
// (not cached) — it's tied to a query.
export async function generateGroupSummary(ids: string[]): Promise<CitedAnswer | null> {
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

// T3.4 D4 — thumbs up/down + optional note on a specific Ask answer. Reads
// the caller's own session so the feedback row is attributed to whoever is
// actually signed in, not whatever the client claims.
export async function submitAiFeedback(
  requestId: string,
  rating: "up" | "down",
  note?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return submitAiFeedbackService(user.id, requestId, rating, note);
}
