import { describe, expect, it, vi } from "vitest";

// T3.6 D7 — listRelationshipsForProject's whole job is the project-scoping
// filter (nodes = this project's experiments; edges = relationships where
// BOTH endpoints are in that set), so that's what's worth testing directly
// against a mocked Supabase client, rather than at the RLS layer (no new
// policy is introduced — it reuses experiments/experiment_relationships'
// existing RLS exactly as listRelationships already does).

const EXPERIMENTS_IN_PROJECT = [
  { id: "EXP-1", name: "First", status: "draft", date: "2026-01-01" },
  { id: "EXP-2", name: "Second", status: "completed", date: "2026-01-02" },
];

const RELATIONSHIPS = [
  { id: "r1", source_experiment_id: "EXP-1", target_experiment_id: "EXP-2", relationship_type: "replicate_of" },
  // Crosses out of the project (EXP-OTHER isn't in EXPERIMENTS_IN_PROJECT) —
  // must never appear in the result.
  { id: "r2", source_experiment_id: "EXP-1", target_experiment_id: "EXP-OTHER", relationship_type: "based_on" },
];

function makeSupabase(experiments: typeof EXPERIMENTS_IN_PROJECT, relationships: typeof RELATIONSHIPS) {
  return {
    from: (table: string) => {
      if (table === "experiments") {
        return {
          select: () => ({
            eq: () => ({
              is: async () => ({ data: experiments, error: null }),
            }),
          }),
        };
      }
      if (table === "experiment_relationships") {
        return {
          select: () => ({
            in: (_col1: string, ids1: string[]) => ({
              in: (_col2: string, ids2: string[]) =>
                Promise.resolve({
                  data: relationships.filter(
                    (r) => ids1.includes(r.source_experiment_id) && ids2.includes(r.target_experiment_id)
                  ),
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

let currentExperiments = EXPERIMENTS_IN_PROJECT;
let currentRelationships = RELATIONSHIPS;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => makeSupabase(currentExperiments, currentRelationships),
}));

const { listRelationshipsForProject } = await import("@/lib/relationships/service");

describe("listRelationshipsForProject", () => {
  it("only includes edges where both endpoints belong to the project", async () => {
    currentExperiments = EXPERIMENTS_IN_PROJECT;
    currentRelationships = RELATIONSHIPS;
    const result = await listRelationshipsForProject("proj-1");
    expect(result.nodes.map((n) => n.id)).toEqual(["EXP-1", "EXP-2"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].id).toBe("r1");
  });

  it("returns empty nodes and edges for a project with no experiments", async () => {
    currentExperiments = [];
    currentRelationships = RELATIONSHIPS;
    const result = await listRelationshipsForProject("empty-proj");
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
  });
});
