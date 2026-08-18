import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { PersistedUnresolvedItem, Recommendation } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CrewProvenance = {
  experimentId: string;
  rawSource: string;
  // Every item carries a stable id — minted at commit time for new drafts,
  // backfilled for pre-existing rows by migration 20260828120000.
  unresolved: PersistedUnresolvedItem[];
  unresolvedOpenCount: number;
  normalization: Recommendation[];
  crewVersion: string;
  model: string;
  createdAt: string;
};

// Read-only: absent entirely for a hand-authored experiment (no row), which
// is exactly how the UI tells the two apart (D8).
export async function getCrewProvenance(supabase: Supabase, experimentId: string): Promise<CrewProvenance | null> {
  const { data } = await supabase
    .from("experiment_crew_provenance")
    .select("*")
    .eq("experiment_id", experimentId)
    .maybeSingle();
  if (!data) return null;
  return {
    experimentId: data.experiment_id,
    rawSource: data.raw_source,
    unresolved: data.unresolved as unknown as PersistedUnresolvedItem[],
    unresolvedOpenCount: data.unresolved_open_count,
    normalization: data.normalization as unknown as Recommendation[],
    crewVersion: data.crew_version,
    model: data.model,
    createdAt: data.created_at,
  };
}
