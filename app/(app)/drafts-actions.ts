"use server";

import { requireUser } from "@/lib/authorization/policies";
import * as draftsService from "@/lib/drafts/service";
import type { DraftKey, ExperimentInput } from "@/lib/types";

// T1.3 — called directly from the client autosave hook (not via a <form>
// submit), so this returns a plain boolean rather than the usual
// ActionResult: there's no form to show field errors on, and a failed
// autosave should just flip the save-state badge to "offline," not throw.
export async function saveDraftAction(
  key: DraftKey,
  fields: Partial<ExperimentInput>,
  rawNote: string | null,
  baseUpdatedAt: string | null
): Promise<{ ok: boolean }> {
  try {
    const { supabase, user } = await requireUser();
    await draftsService.saveDraft(supabase, user.id, key, fields, rawNote, baseUpdatedAt);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function discardDraftAction(key: DraftKey): Promise<void> {
  const { supabase } = await requireUser();
  await draftsService.discardDraft(supabase, key);
}
