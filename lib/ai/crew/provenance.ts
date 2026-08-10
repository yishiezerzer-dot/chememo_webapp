import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { UnresolvedItem, Recommendation } from "./types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CrewProvenance = {
  experimentId: string;
  rawSource: string;
  unresolved: UnresolvedItem[];
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
    unresolved: data.unresolved as unknown as UnresolvedItem[],
    unresolvedOpenCount: data.unresolved_open_count,
    normalization: data.normalization as unknown as Recommendation[],
    crewVersion: data.crew_version,
    model: data.model,
    createdAt: data.created_at,
  };
}
