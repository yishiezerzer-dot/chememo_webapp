import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type AiSuggestion = {
  id: string;
  field: string;
  suggestedValue: string;
  rationale: string;
  source: "gap_scan" | "crew_resolve";
  // The specific checklist item this answers. Replaces the old positional
  // unresolvedIndex, which could not tell two items sharing a field apart.
  unresolvedItemId: string | null;
};

// Read-only: only ever pending suggestions are shown — accepted/dismissed
// ones have already done their job (D3) and have no further UI role.
export async function getPendingAiSuggestions(supabase: Supabase, experimentId: string): Promise<AiSuggestion[]> {
  const { data } = await supabase
    .from("experiment_ai_suggestions")
    .select("id, field, suggested_value, rationale, source, unresolved_item_id")
    .eq("experiment_id", experimentId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  return (data ?? []).map((row) => ({
    id: row.id,
    field: row.field,
    suggestedValue: row.suggested_value,
    rationale: row.rationale,
    source: row.source as "gap_scan" | "crew_resolve",
    unresolvedItemId: row.unresolved_item_id,
  }));
}
