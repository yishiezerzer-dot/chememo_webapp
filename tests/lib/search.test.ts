import { describe, expect, it } from "vitest";
import { parseQuery, resolveMetalAlias, resolveReactionAlias, describeFilters } from "@/lib/search";

const vocab = {
  compounds: ["Histidine", "Thioglycolic acid", "Glycine"],
  methods: ["LC-MS/MS (neg)", "LC-MS/MS (pos)", "NMR", "Microscopy", "UV-Vis"],
};

describe("parseQuery", () => {
  it("parses a metal alias", () => {
    const { filters } = parseQuery("experiments with zinc", vocab);
    expect(filters.metals).toEqual(["Zn"]);
  });

  it("parses pH comparisons from symbols and words", () => {
    expect(parseQuery("pH > 8", vocab).filters.ph).toEqual({ op: "gt", value: 8 });
    expect(parseQuery("pH above 7", vocab).filters.ph).toEqual({ op: "gt", value: 7 });
    expect(parseQuery("pH below 5", vocab).filters.ph).toEqual({ op: "lt", value: 5 });
  });

  it("parses one or more m/z values", () => {
    expect(parseQuery("m/z 297", vocab).filters.mz).toEqual([297]);
    expect(parseQuery("m/z 297 and mz 595", vocab).filters.mz).toEqual([297, 595]);
  });

  it("matches a compound against the provided vocab", () => {
    const { filters } = parseQuery("experiments with histidine", vocab);
    expect(filters.compounds).toEqual(["Histidine"]);
  });

  it("matches negative-mode LC-MS specifically when asked", () => {
    const { filters } = parseQuery("LC-MS neg runs", vocab);
    expect(filters.methods).toEqual(["LC-MS/MS (neg)"]);
  });

  it("prefers the cycling reaction match over wet-dry when both are present", () => {
    // Documents actual behavior: the if/else chain in parseQuery checks
    // /cycling/ before the wet-dry pattern, so "wet-dry cycling" resolves to
    // %cycling%, not %wet%dry%. A future reorder of that chain should fail
    // this test rather than silently changing search results.
    const { filters } = parseQuery("wet-dry cycling experiments", vocab);
    expect(filters.reactionLike).toBe("%cycling%");
  });

  it("returns no filters for a query with no recognizable signal", () => {
    // Every word here is either a stop word or under 4 chars, so nothing
    // should surface as free text either.
    const { filters, interpretation } = parseQuery("show me the experiments", vocab);
    expect(interpretation).toEqual([]);
    expect(filters.metals).toEqual([]);
    expect(filters.compounds).toEqual([]);
    expect(filters.ph).toBeNull();
  });

  it("parses a metal's charge-state alias the same as its plain name/symbol (§11.2)", () => {
    expect(parseQuery("experiments with zn2+", vocab).filters.metals).toEqual(["Zn"]);
  });
});

// T3.3 D3 — resolveMetalAlias/resolveReactionAlias are the same resolvers
// lib/llm.ts's routeQuery applies to the AI router's own free-typed output,
// so "zinc"/"Zn"/"Zn2+" resolve to the same canonical value regardless of
// which retrieval path (keyless parser or AI router) produced them.
describe("resolveMetalAlias", () => {
  it("resolves plain names, symbols, and charge-state variants to the same canonical symbol", () => {
    expect(resolveMetalAlias("zinc")).toBe("Zn");
    expect(resolveMetalAlias("Zn")).toBe("Zn");
    expect(resolveMetalAlias("zn2+")).toBe("Zn");
    expect(resolveMetalAlias("ZN2+")).toBe("Zn");
  });

  it("passes through an unrecognized value unchanged", () => {
    expect(resolveMetalAlias("Mercury")).toBe("Mercury");
  });
});

describe("resolveReactionAlias", () => {
  it("resolves loose phrasing to the same canonical ilike pattern the keyless parser produces", () => {
    expect(resolveReactionAlias("wet-dry cycling")).toBe("%cycling%");
    expect(resolveReactionAlias("depsipeptide formation")).toBe("%depsi%");
  });

  it("falls through to a raw ilike wrap for an unrecognized phrase", () => {
    expect(resolveReactionAlias("polymerization")).toBe("%polymerization%");
  });
});

describe("describeFilters", () => {
  it("produces the same human-readable strings parseQuery's own interpretation already did", () => {
    const { filters, interpretation } = parseQuery("zinc experiments at pH > 8", vocab);
    expect(describeFilters(filters)).toEqual(interpretation);
  });
});
