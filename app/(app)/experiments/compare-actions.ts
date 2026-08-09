"use server";

import { createClient } from "@/lib/supabase/server";
import { isLlmEnabled, type CitedAnswer, type ComparisonTableSuggestion } from "@/lib/llm";
import {
  acquireAiSlot,
  detectExperimentContradictions,
  generateExperimentComparisonTable,
} from "@/lib/ai/service";

// T3.6 — higher-order AI assists for T2.9's comparison views (series detail,
// ad-hoc relationship-based compare). Same shape as ask/actions.ts's
// generateGroupSummary: reads via the caller's own session so RLS applies,
// returns null on any disabled/rate-limited/empty-result condition (no new
// UI state needed for those — the button just stays available to retry).

export async function generateComparisonTable(ids: string[]): Promise<ComparisonTableSuggestion | null> {
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
    return await generateExperimentComparisonTable(supabase, user.id, ids);
  } finally {
    slot.release();
  }
}

export async function detectContradictions(ids: string[]): Promise<CitedAnswer | null> {
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
    return await detectExperimentContradictions(supabase, user.id, ids);
  } finally {
    slot.release();
  }
}
