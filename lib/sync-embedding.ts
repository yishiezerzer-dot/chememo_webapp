import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { embedExperiment, isEmbeddingEnabled } from "@/lib/embeddings";

// Sprint S2 — keep experiment_embeddings current on every save so semantic
// search never goes stale between manual backfills. Service-role write (the
// embeddings table is read-only under RLS). No-ops when embeddings are disabled
// (no key). Callers should void the promise so a slow embed API never blocks a
// redirect; failures are logged, not thrown.
export async function syncExperimentEmbedding(experimentId: string): Promise<void> {
  if (!isEmbeddingEnabled()) return;

  const admin = createAdminClient();
  const { data: e } = await admin
    .from("experiments")
    .select("id, name, reaction_type, compounds, metals, methods, observations, notes")
    .eq("id", experimentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!e) {
    // Missing or soft-deleted → drop the embedding so it stops matching.
    const { error } = await admin.from("experiment_embeddings").delete().eq("experiment_id", experimentId);
    if (error) throw error;
    return;
  }

  const payload = await embedExperiment(e);
  if (!payload) return;

  const { error } = await admin.from("experiment_embeddings").upsert({
    experiment_id: experimentId,
    content: payload.content,
    embedding: payload.embedding,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
