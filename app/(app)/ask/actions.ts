"use server";

import { createClient } from "@/lib/supabase/server";
import { isLlmEnabled, summarizeGroup } from "@/lib/llm";

// Summarise a set of experiments (the grounded results of an Ask). Reads via
// the user's session so RLS applies; returns null when AI is off or the ids
// resolve to nothing. Generated on demand (not cached) — it's tied to a query.
export async function generateGroupSummary(ids: string[]): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!isLlmEnabled()) return null;
  if (!ids.length) return null;

  const { data: experiments } = await supabase
    .from("experiments")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null);
  if (!experiments?.length) return null;

  return summarizeGroup(experiments);
}
