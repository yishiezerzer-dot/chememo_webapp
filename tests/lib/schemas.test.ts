import { describe, expect, it } from "vitest";
import { experimentInputSchema, fieldErrorsFromZod, projectLabelSchema } from "@/lib/schemas";

const validInput = {
  name: "His + TGA + Zn — wet-dry cycling",
  date: "2026-07-20",
  researcher: "Y. Ezerzer",
  project: "wet-dry-cycling",
  reaction_type: "Wet-dry cycling",
  compounds: ["Histidine"],
  metals: ["Zn"],
  ph: 7,
  concentration: "50 mM",
  temperature: "60 °C",
  cycles: 5,
  methods: ["NMR"] as const,
  mz: [297, 595],
  observations: "Yellowing after dry-down.",
  notes: null,
};

describe("experimentInputSchema", () => {
  it("accepts a fully valid experiment", () => {
    const result = experimentInputSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it("rejects an empty name instead of silently accepting it", () => {
    const result = experimentInputSchema.safeParse({ ...validInput, name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects pH outside -2..16", () => {
    expect(experimentInputSchema.safeParse({ ...validInput, ph: 999 }).success).toBe(false);
    expect(experimentInputSchema.safeParse({ ...validInput, ph: -3 }).success).toBe(false);
    expect(experimentInputSchema.safeParse({ ...validInput, ph: null }).success).toBe(true);
  });

  it("rejects negative or non-integer cycles", () => {
    expect(experimentInputSchema.safeParse({ ...validInput, cycles: -5 }).success).toBe(false);
    expect(experimentInputSchema.safeParse({ ...validInput, cycles: 2.5 }).success).toBe(false);
    expect(experimentInputSchema.safeParse({ ...validInput, cycles: 0 }).success).toBe(true);
  });

  it("rejects a malformed date instead of accepting free text", () => {
    expect(experimentInputSchema.safeParse({ ...validInput, date: "07/20/2026" }).success).toBe(false);
    expect(experimentInputSchema.safeParse({ ...validInput, date: null }).success).toBe(true);
  });

  it("rejects a method not in the curated list", () => {
    const result = experimentInputSchema.safeParse({ ...validInput, methods: ["Made-up method"] });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive m/z values", () => {
    expect(experimentInputSchema.safeParse({ ...validInput, mz: [0] }).success).toBe(false);
    expect(experimentInputSchema.safeParse({ ...validInput, mz: [-297] }).success).toBe(false);
  });

  it("rejects a name over 300 characters", () => {
    const result = experimentInputSchema.safeParse({ ...validInput, name: "x".repeat(301) });
    expect(result.success).toBe(false);
  });
});

describe("fieldErrorsFromZod", () => {
  it("maps each failing top-level field to its first error message", () => {
    const result = experimentInputSchema.safeParse({ ...validInput, name: "", ph: 999 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = fieldErrorsFromZod(result.error);
    expect(errors.name).toBeTruthy();
    expect(errors.ph).toBeTruthy();
    expect(Object.keys(errors)).toEqual(expect.arrayContaining(["name", "ph"]));
  });
});

describe("projectLabelSchema", () => {
  it("accepts a normal project name", () => {
    expect(projectLabelSchema.safeParse("Wet-Dry Cycling").success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(projectLabelSchema.safeParse("   ").success).toBe(false);
  });

  it("rejects a name over 60 characters", () => {
    expect(projectLabelSchema.safeParse("x".repeat(61)).success).toBe(false);
  });
});
