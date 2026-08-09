import { describe, expect, it, vi } from "vitest";

// T3.1 D5 — semanticSearch now matches at chunk granularity and resolves each
// hit to its parent experiment (directly via metadata.experiment_id for most
// source types, or via a live fan-out against experiments.protocol_version_id
// for the two protocol-level source types, which have no single parent).
// These tests prove the dedup/resolution logic without hitting a real DB.

const embedTextMock = vi.fn();
vi.mock("@/lib/embeddings", () => ({ embedText: embedTextMock }));

let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };
const protocolLinkRows: { id: string; protocol_version_id: string }[] = [];
const experimentRows: Record<string, unknown>[] = [];

function makeQuery(table: string) {
  const query: Record<string, unknown> = {};
  const chain = () => query;
  query.select = vi.fn(chain);
  query.in = vi.fn(chain);
  query.is = vi.fn(chain);
  // Both `.select().in().is()` chains in rag.ts eventually resolve as a
  // thenable — resolve based on which table was queried.
  query.then = (resolve: (v: { data: unknown }) => void) => {
    if (table === "experiments") {
      // Distinguish the protocol_version_id fan-out query (used only for the
      // protocol-level hits) from the final full-row hydration query by
      // which select() call it was.
      const lastSelectArgs = (query.select as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] ?? "";
      if (typeof lastSelectArgs === "string" && lastSelectArgs.includes("protocol_version_id")) {
        resolve({ data: protocolLinkRows });
      } else {
        resolve({ data: experimentRows });
      }
    } else {
      resolve({ data: [] });
    }
    return Promise.resolve();
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => rpcResult,
    from: (table: string) => makeQuery(table),
  }),
}));

vi.mock("@/lib/search", () => ({ keylessSearch: vi.fn(), executeFilters: vi.fn() }));
vi.mock("@/lib/llm", () => ({
  isLlmEnabled: () => true,
  routeQuery: vi.fn(),
  generateAnswer: vi.fn(),
  generateGeneralAnswer: vi.fn(),
}));

const { semanticSearch } = await import("@/lib/rag");

describe("semanticSearch", () => {
  it("returns [] when embeddings are disabled", async () => {
    embedTextMock.mockResolvedValueOnce(null);
    const result = await semanticSearch("formed droplets");
    expect(result).toEqual([]);
  });

  it("resolves ordinary chunk hits to their experiment via metadata.experiment_id and dedupes", async () => {
    embedTextMock.mockResolvedValueOnce([0.1, 0.2]);
    rpcResult = {
      data: [
        { id: "c1", source_type: "step_observation", source_id: "so1", metadata: { experiment_id: "EXP-1" }, similarity: 0.9 },
        { id: "c2", source_type: "analysis_result", source_id: "ar1", metadata: { experiment_id: "EXP-1" }, similarity: 0.85 },
        { id: "c3", source_type: "comment", source_id: "cm1", metadata: { experiment_id: "EXP-2" }, similarity: 0.7 },
      ],
      error: null,
    };
    experimentRows.length = 0;
    experimentRows.push({ id: "EXP-1", name: "First" }, { id: "EXP-2", name: "Second" });

    const result = await semanticSearch("query");
    // EXP-1 hit twice (higher similarity first) but only appears once, ahead of EXP-2.
    expect(result.map((e) => e.id)).toEqual(["EXP-1", "EXP-2"]);
  });

  it("resolves protocol-level hits via a live fan-out against experiments.protocol_version_id", async () => {
    embedTextMock.mockResolvedValueOnce([0.1, 0.2]);
    rpcResult = {
      data: [
        { id: "c4", source_type: "protocol_step", source_id: "ps1", metadata: { protocol_version_id: "PV-1" }, similarity: 0.8 },
      ],
      error: null,
    };
    protocolLinkRows.length = 0;
    protocolLinkRows.push({ id: "EXP-3", protocol_version_id: "PV-1" });
    experimentRows.length = 0;
    experimentRows.push({ id: "EXP-3", name: "Third" });

    const result = await semanticSearch("query");
    expect(result.map((e) => e.id)).toEqual(["EXP-3"]);
  });

  it("drops hits below the similarity threshold and hits with no resolvable experiment", async () => {
    embedTextMock.mockResolvedValueOnce([0.1, 0.2]);
    rpcResult = {
      data: [
        { id: "c5", source_type: "comment", source_id: "cm2", metadata: {}, similarity: 0.99 },
        { id: "c6", source_type: "comment", source_id: "cm3", metadata: { experiment_id: "EXP-4" }, similarity: 0.1 },
      ],
      error: null,
    };
    experimentRows.length = 0;

    const result = await semanticSearch("query");
    expect(result).toEqual([]);
  });
});
