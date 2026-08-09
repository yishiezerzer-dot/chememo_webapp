import { describe, expect, it, vi } from "vitest";

// T3.1 D5 — semanticSearch now matches at chunk granularity and resolves each
// hit to its parent experiment (directly via metadata.experiment_id for most
// source types, or via a live fan-out against experiments.protocol_version_id
// for the two protocol-level source types, which have no single parent).
// T3.2 D1 — it also surfaces each resolved experiment's best-matching chunk
// content (source_type/section_type/content) for the citation engine.
// These tests prove the dedup/resolution/evidence logic without hitting a
// real DB.

const embedTextMock = vi.fn();
vi.mock("@/lib/embeddings", () => ({ embedText: embedTextMock }));

let rpcResult: { data: unknown; error: unknown } = { data: [], error: null };
const protocolLinkRows: { id: string; protocol_version_id: string }[] = [];
const experimentRows: Record<string, unknown>[] = [];
const chunkContentRows: { id: string; content: string }[] = [];

function makeQuery(table: string) {
  const query: Record<string, unknown> = {};
  const chain = () => query;
  query.select = vi.fn(chain);
  query.in = vi.fn(chain);
  query.is = vi.fn(chain);
  // Every `.select().in()...` chain in rag.ts eventually resolves as a
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
    } else if (table === "evidence_chunks") {
      resolve({ data: chunkContentRows });
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

const executeFiltersMock = vi.fn();
vi.mock("@/lib/search", () => ({
  keylessSearch: vi.fn(),
  executeFilters: executeFiltersMock,
  describeFilters: (filters: { compounds: string[] }) =>
    filters.compounds.length ? [`compounds include ${filters.compounds.join(" + ")}`] : [],
}));

const routeQueryMock = vi.fn();
vi.mock("@/lib/llm", () => ({
  isLlmEnabled: () => true,
  routeQuery: routeQueryMock,
  generateCitedAnswer: vi.fn(),
  generateGeneralAnswer: vi.fn(),
}));

const { semanticSearch, retrieveRecords } = await import("@/lib/rag");

describe("semanticSearch", () => {
  it("returns empty experiments/evidence when embeddings are disabled", async () => {
    embedTextMock.mockResolvedValueOnce(null);
    const result = await semanticSearch("formed droplets");
    expect(result.experiments).toEqual([]);
    expect(result.evidence.size).toBe(0);
  });

  it("resolves ordinary chunk hits to their experiment via metadata.experiment_id, dedupes, and surfaces the winning chunk's content", async () => {
    embedTextMock.mockResolvedValueOnce([0.1, 0.2]);
    rpcResult = {
      data: [
        { id: "c1", source_type: "step_observation", source_id: "so1", section_type: "observations", metadata: { experiment_id: "EXP-1" }, similarity: 0.9 },
        { id: "c2", source_type: "analysis_result", source_id: "ar1", section_type: "analytical_result", metadata: { experiment_id: "EXP-1" }, similarity: 0.85 },
        { id: "c3", source_type: "comment", source_id: "cm1", section_type: "discussion", metadata: { experiment_id: "EXP-2" }, similarity: 0.7 },
      ],
      error: null,
    };
    experimentRows.length = 0;
    experimentRows.push({ id: "EXP-1", name: "First" }, { id: "EXP-2", name: "Second" });
    chunkContentRows.length = 0;
    chunkContentRows.push({ id: "c1", content: "Droplets observed at 40C." }, { id: "c3", content: "Nice result!" });

    const result = await semanticSearch("query");
    // EXP-1 hit twice (higher similarity first) but only appears once, ahead of EXP-2.
    expect(result.experiments.map((e) => e.id)).toEqual(["EXP-1", "EXP-2"]);
    // EXP-1's evidence comes from its FIRST (highest-similarity) hit, c1 — not c2.
    expect(result.evidence.get("EXP-1")).toEqual({
      sourceType: "step_observation",
      sectionType: "observations",
      content: "Droplets observed at 40C.",
      similarity: 0.9,
    });
    expect(result.evidence.get("EXP-2")).toEqual({
      sourceType: "comment",
      sectionType: "discussion",
      content: "Nice result!",
      similarity: 0.7,
    });
  });

  it("resolves protocol-level hits via a live fan-out against experiments.protocol_version_id", async () => {
    embedTextMock.mockResolvedValueOnce([0.1, 0.2]);
    rpcResult = {
      data: [
        { id: "c4", source_type: "protocol_step", source_id: "ps1", section_type: "protocol_step", metadata: { protocol_version_id: "PV-1" }, similarity: 0.8 },
      ],
      error: null,
    };
    protocolLinkRows.length = 0;
    protocolLinkRows.push({ id: "EXP-3", protocol_version_id: "PV-1" });
    experimentRows.length = 0;
    experimentRows.push({ id: "EXP-3", name: "Third" });
    chunkContentRows.length = 0;
    chunkContentRows.push({ id: "c4", content: "Step 1: mix reagents." });

    const result = await semanticSearch("query");
    expect(result.experiments.map((e) => e.id)).toEqual(["EXP-3"]);
    expect(result.evidence.get("EXP-3")).toEqual({
      sourceType: "protocol_step",
      sectionType: "protocol_step",
      content: "Step 1: mix reagents.",
      similarity: 0.8,
    });
  });

  it("drops hits below the similarity threshold and hits with no resolvable experiment", async () => {
    embedTextMock.mockResolvedValueOnce([0.1, 0.2]);
    rpcResult = {
      data: [
        { id: "c5", source_type: "comment", source_id: "cm2", section_type: "discussion", metadata: {}, similarity: 0.99 },
        { id: "c6", source_type: "comment", source_id: "cm3", section_type: "discussion", metadata: { experiment_id: "EXP-4" }, similarity: 0.1 },
      ],
      error: null,
    };
    experimentRows.length = 0;
    chunkContentRows.length = 0;

    const result = await semanticSearch("query");
    expect(result.experiments).toEqual([]);
    expect(result.evidence.size).toBe(0);
  });
});

// T3.3 D1/D2 — retrieveRecords fuses the filter list and the semantic-search
// list via reciprocal-rank fusion instead of a naive "filters always first"
// union, and returns a per-record match explanation.
describe("retrieveRecords (RRF fusion)", () => {
  it("ranks a record found by both filter and semantic search above one found by only one method, even when its raw rank was lower in each", async () => {
    routeQueryMock.mockResolvedValueOnce({
      mode: "both",
      filters: { compounds: [], metals: [], methods: [], mz: [], ph: null, reactionLike: null, freeText: [] },
      semanticQuery: "some query",
    });
    executeFiltersMock.mockResolvedValueOnce([
      { id: "EXP-A", name: "A" },
      { id: "EXP-B", name: "B" },
    ]);
    embedTextMock.mockResolvedValueOnce([0.1, 0.2]);
    rpcResult = {
      data: [
        { id: "c1", source_type: "comment", source_id: "cm1", section_type: "discussion", metadata: { experiment_id: "EXP-C" }, similarity: 0.9 },
        { id: "c2", source_type: "comment", source_id: "cm2", section_type: "discussion", metadata: { experiment_id: "EXP-B" }, similarity: 0.8 },
      ],
      error: null,
    };
    experimentRows.length = 0;
    experimentRows.push({ id: "EXP-C", name: "C" }, { id: "EXP-B", name: "B (semantic hydration)" });
    chunkContentRows.length = 0;
    chunkContentRows.push({ id: "c1", content: "C content" }, { id: "c2", content: "B content" });

    const result = await retrieveRecords("some query");
    // EXP-B is rank 2 in BOTH lists (not the top hit in either) but appearing
    // in both still outranks EXP-A/EXP-C, each the top hit in only one list.
    expect(result.records.map((e) => e.id)).toEqual(["EXP-B", "EXP-A", "EXP-C"]);
    expect(result.explanations.get("EXP-B")?.matchedVia).toBe("both");
    expect(result.explanations.get("EXP-A")?.matchedVia).toBe("filter");
    expect(result.explanations.get("EXP-C")?.matchedVia).toBe("semantic");
    expect(result.explanations.get("EXP-C")?.semanticScore).toBe(0.9);
  });

  it("single-mode queries preserve the original list order (RRF is a no-op)", async () => {
    routeQueryMock.mockResolvedValueOnce({
      mode: "filter",
      filters: { compounds: ["Histidine"], metals: [], methods: [], mz: [], ph: null, reactionLike: null, freeText: [] },
      semanticQuery: null,
    });
    executeFiltersMock.mockResolvedValueOnce([
      { id: "EXP-1", name: "First" },
      { id: "EXP-2", name: "Second" },
      { id: "EXP-3", name: "Third" },
    ]);

    const result = await retrieveRecords("histidine experiments");
    expect(result.records.map((e) => e.id)).toEqual(["EXP-1", "EXP-2", "EXP-3"]);
    expect(result.explanations.get("EXP-1")).toMatchObject({
      matchedVia: "filter",
      appliedFilters: ["compounds include Histidine"],
      semanticScore: null,
    });
  });
});
