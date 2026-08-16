"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import { isLlmEnabled } from "@/lib/llm";
import { acquireAiSlot, generateGapSuggestions, generateResolutionSuggestion } from "@/lib/ai/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

// D1/D7 — opt-in, on click, never automatic. Both generate actions insert
// pending experiment_ai_suggestions rows (lib/ai/service.ts, under the
// caller's own RLS-scoped session, never the service role) rather than
// returning the suggestions directly — the UI picks them up on the next
// server-component refetch, the same convention CrewProvenancePanel's
// resolveAction already uses.

export async function generateGapSuggestionsAction(experimentId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!isLlmEnabled()) return { ok: false, error: "AI suggestions are not configured for this deployment." };

  let slot: { release: () => void };
  try {
    slot = await acquireAiSlot(user.id);
  } catch (e) {
    return toActionResult("generateGapSuggestions", e);
  }
  try {
    const result = await generateGapSuggestions(supabase, user.id, experimentId);
    if (result === null) return { ok: false, error: "Could not generate suggestions right now." };
  } catch (e) {
    return toActionResult("generateGapSuggestions", e);
  } finally {
    slot.release();
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function generateResolutionSuggestionAction(
  experimentId: string,
  unresolvedIndex: number
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!isLlmEnabled()) return { ok: false, error: "AI suggestions are not configured for this deployment." };

  let slot: { release: () => void };
  try {
    slot = await acquireAiSlot(user.id);
  } catch (e) {
    return toActionResult("generateResolutionSuggestion", e);
  }
  try {
    const result = await generateResolutionSuggestion(supabase, user.id, experimentId, unresolvedIndex);
    if (result === null) return { ok: false, error: "No confident AI suggestion for this item." };
  } catch (e) {
    return toActionResult("generateResolutionSuggestion", e);
  } finally {
    slot.release();
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

// D3 — apply_ai_suggestion (security definer, migration 20260825120000) is
// the only path that can ever change a suggestion's status. On accept, it
// also writes the value to the named experiments column and, if the
// suggestion answers a specific crew unresolved item, clears that item too.
export async function resolveAiSuggestionAction(
  experimentId: string,
  suggestionId: string,
  accept: boolean
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("apply_ai_suggestion", {
    p_suggestion_id: suggestionId,
    p_accept: accept,
  });
  if (error) return toActionResult("resolveAiSuggestion", error);

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
