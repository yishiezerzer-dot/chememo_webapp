import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { RELATIONSHIP_LABEL, INVERSE_RELATIONSHIP_LABEL } from "@/lib/types";
import type { ExperimentRelationship, ExperimentStatus, RelationshipType } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type RelationshipView = {
  relationship: ExperimentRelationship;
  direction: "outgoing" | "incoming";
  label: string;
  otherExperiment: { id: string; name: string; status: ExperimentStatus | null };
};

// T1.7 D2 — both directions, each phrased from this experiment's point of
// view: an outgoing row reads "this <type> other" (RELATIONSHIP_LABEL); an
// incoming row reads "this <inverse-of-type> other" (INVERSE_RELATIONSHIP_LABEL)
// rather than a second stored row.
export async function listRelationships(experimentId: string): Promise<RelationshipView[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("experiment_relationships")
    .select("*")
    .or(`source_experiment_id.eq.${experimentId},target_experiment_id.eq.${experimentId}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const otherIds = Array.from(
    new Set(
      rows.map((r) => (r.source_experiment_id === experimentId ? r.target_experiment_id : r.source_experiment_id))
    )
  );
  const { data: others, error: othersError } = await supabase
    .from("experiments")
    .select("id, name, status")
    .in("id", otherIds);
  if (othersError) throw othersError;
  const byId = new Map((others ?? []).map((e) => [e.id, e]));

  return rows.map((row) => {
    const relationship = row as ExperimentRelationship;
    const outgoing = relationship.source_experiment_id === experimentId;
    const otherId = outgoing ? relationship.target_experiment_id : relationship.source_experiment_id;
    const other = byId.get(otherId);
    return {
      relationship,
      direction: outgoing ? "outgoing" : "incoming",
      label: outgoing
        ? RELATIONSHIP_LABEL[relationship.relationship_type]
        : INVERSE_RELATIONSHIP_LABEL[relationship.relationship_type],
      otherExperiment: { id: otherId, name: other?.name ?? otherId, status: (other?.status as ExperimentStatus | null) ?? null },
    };
  });
}

export async function createRelationship(
  supabase: Supabase,
  userId: string,
  sourceExperimentId: string,
  targetExperimentId: string,
  relationshipType: RelationshipType
): Promise<void> {
  if (sourceExperimentId === targetExperimentId) {
    throw new AppError("validation", "An experiment cannot be related to itself.");
  }
  const { data: target } = await supabase
    .from("experiments")
    .select("id")
    .eq("id", targetExperimentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!target) {
    throw new AppError("validation", `${targetExperimentId} is not a real experiment.`);
  }

  const { error } = await supabase.from("experiment_relationships").insert({
    source_experiment_id: sourceExperimentId,
    target_experiment_id: targetExperimentId,
    relationship_type: relationshipType,
    created_by: userId,
  });
  if (error) {
    if (error.code === "23505") {
      throw new AppError("conflict", "That relationship already exists.");
    }
    throw new AppError("conflict", "Could not create the relationship.", { cause: error });
  }
}

export async function deleteRelationship(supabase: Supabase, id: string): Promise<void> {
  const { error } = await supabase.from("experiment_relationships").delete().eq("id", id);
  if (error) throw new AppError("conflict", "Could not delete the relationship.", { cause: error });
}
