import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Experiment } from "@/lib/types";

// T3.2 — deterministic citation engine. These tests exercise chatComplete's
// real Gemini code path (mocking only the network boundary, `global.fetch`)
// so the JSON-parsing/zod-validation/citation-label-filtering logic under
// test is the actual production code, not a stand-in.

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

function mockGeminiText(jsonText: string) {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text: jsonText }] } }] }),
    text: async () => "",
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env.AI_PROVIDER = "gemini";
  process.env.GEMINI_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

const { generateCitedAnswer, routeQuery, extractExperimentFields } = await import("@/lib/llm");

function record(id: string, name: string): Experiment {
  return { id, name } as unknown as Experiment;
}

describe("generateCitedAnswer", () => {
  it("drops a hallucinated citation label not present in the retrieved evidence", async () => {
    mockGeminiText(
      JSON.stringify({
        grounded: true,
        segments: [{ text: "Droplets formed.", citations: ["C1", "C99"] }],
      })
    );
    const records = [record("EXP-1", "First")];
    const evidence = new Map([["EXP-1", { sourceType: "step_observation", sectionType: "observations", content: "Droplets observed." }]]);

    const result = await generateCitedAnswer("did droplets form?", records, evidence);
    expect(result).not.toBeNull();
    expect(result!.segments).toHaveLength(1);
    expect(result!.segments[0].citations.map((c) => c.label)).toEqual(["C1"]);
    expect(result!.segments[0].citations[0]).toMatchObject({ experimentId: "EXP-1", sourceType: "step_observation" });
  });

  it("returns null when the model reports grounded: false", async () => {
    mockGeminiText(
      JSON.stringify({
        grounded: false,
        segments: [{ text: "These records don't answer that.", citations: [] }],
      })
    );
    const records = [record("EXP-1", "First")];
    const result = await generateCitedAnswer("unrelated question", records, new Map());
    expect(result).toBeNull();
  });

  it("falls back to a whole-record citation when no chunk evidence exists for a record", async () => {
    mockGeminiText(
      JSON.stringify({
        grounded: true,
        segments: [{ text: "Matched by filter.", citations: ["C1"] }],
      })
    );
    const records = [record("EXP-5", "Filter-only match")];
    // No entry in the evidence map — this record came from the filter path,
    // not chunk search.
    const result = await generateCitedAnswer("filter query", records, new Map());
    expect(result).not.toBeNull();
    expect(result!.segments[0].citations[0]).toMatchObject({
      experimentId: "EXP-5",
      sourceType: "experiment",
      sectionType: "observations",
    });
  });

  it("returns null when every segment ends up with empty text", async () => {
    mockGeminiText(JSON.stringify({ grounded: true, segments: [{ text: "", citations: [] }] }));
    const records = [record("EXP-1", "First")];
    const result = await generateCitedAnswer("q", records, new Map());
    expect(result).toBeNull();
  });
});

describe("routeQuery (zod validation regression)", () => {
  it("degrades an invalid mode to 'filter' while keeping other valid fields", async () => {
    mockGeminiText(JSON.stringify({ mode: "banana", compounds: ["Histidine"], semanticQuery: null }));
    const intent = await routeQuery("find histidine experiments");
    expect(intent).not.toBeNull();
    expect(intent!.mode).toBe("filter");
    expect(intent!.filters.compounds).toEqual(["Histidine"]);
  });

  it("degrades a malformed field to its empty default without rejecting the whole response", async () => {
    mockGeminiText(JSON.stringify({ mode: "filter", compounds: "not-an-array", metals: ["Zn"] }));
    const intent = await routeQuery("zinc experiments");
    expect(intent).not.toBeNull();
    expect(intent!.filters.compounds).toEqual([]);
    expect(intent!.filters.metals).toEqual(["Zn"]);
  });

  it("resolves the model's free-typed metal/reaction aliases the same way the keyless parser does (T3.3 D3)", async () => {
    mockGeminiText(JSON.stringify({ mode: "filter", metals: ["zinc"], reaction: "wet-dry cycling" }));
    const intent = await routeQuery("zinc wet-dry cycling experiments");
    expect(intent).not.toBeNull();
    expect(intent!.filters.metals).toEqual(["Zn"]);
    expect(intent!.filters.reactionLike).toBe("%cycling%");
  });
});

describe("extractExperimentFields (zod validation regression)", () => {
  it("omits a malformed field instead of guessing a value", async () => {
    mockGeminiText(JSON.stringify({ name: "Test experiment", ph: "not-a-number", metals: ["Zn"] }));
    const fields = await extractExperimentFields("some messy notes");
    expect(fields).not.toBeNull();
    expect(fields!.name).toBe("Test experiment");
    expect(fields!.ph).toBeUndefined();
    expect(fields!.metals).toEqual(["Zn"]);
  });

  it("filters extracted methods down to the allowed METHOD_OPTIONS list", async () => {
    mockGeminiText(JSON.stringify({ name: "Test", methods: ["NMR", "not-a-real-method"] }));
    const fields = await extractExperimentFields("notes");
    expect(fields!.methods).toEqual(["NMR"]);
  });
});
