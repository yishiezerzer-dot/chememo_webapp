import { describe, expect, it } from "vitest";
import {
  experimentInputSchema,
  fieldErrorsFromZod,
  projectLabelSchema,
  validateSampleMatrixVocab,
  validateQuantityUnits,
  validateDeviationCategory,
} from "@/lib/schemas";

const validInput = {
  name: "His + TGA + Zn — wet-dry cycling",
  date: "2026-07-20",
  researcher: "Y. Ezerzer",
  project: "wet-dry-cycling",
  reaction_type: "Wet-dry cycling",
  compounds: ["Histidine"],
  metals: ["Zn"],
  ph: 7,
  cycles: 5,
  methods: ["NMR"] as const,
  mz: [297, 595],
  observations: "Yellowing after dry-down.",
  notes: null,
  scientific_question: null,
  rationale: null,
  hypothesis: null,
  primary_outcome: null,
  secondary_outcomes: null,
  data_analysis_plan: null,
  risks_failure_modes: null,
  conclusion: null,
  next_steps: null,
  acceptance_criteria: null,
  planned_start_at: null,
  planned_end_at: null,
  independent_variables: null,
  controlled_variables: null,
  protocol_version_id: null,
  planned_analyses: null,
  sample_storage_plan: null,
  sample_matrix: [] as const,
  controls: [] as const,
  quantities: {},
};

const sampleRow = {
  sample_id: "",
  vial_label: "",
  legacy_code: "",
  batch: "B01",
  replicate: "R1",
  sample_type: "sample",
  component_1: "",
  amount_1: "",
  component_2: "",
  amount_2: "",
  ratio: "",
  initial_volume: "",
  reaction_mode: "",
  temperature: "",
  duration: "",
  atmosphere: "",
  treatment: "",
  planned_analysis: "",
  status: "",
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

  it("accepts a well-formed sample-matrix row", () => {
    const result = experimentInputSchema.safeParse({ ...validInput, sample_matrix: [sampleRow] });
    expect(result.success).toBe(true);
  });

  it("accepts a well-formed controls checklist", () => {
    const result = experimentInputSchema.safeParse({
      ...validInput,
      controls: [{ label: "Fresh mixture control", checked: false }],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a well-formed quantities map", () => {
    const result = experimentInputSchema.safeParse({
      ...validInput,
      quantities: { temperature: { value: 60, unit_code: "Cel" } },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a quantity whose value isn't a number", () => {
    const result = experimentInputSchema.safeParse({
      ...validInput,
      quantities: { temperature: { value: "hot", unit_code: "Cel" } },
    });
    expect(result.success).toBe(false);
  });
});

describe("validateQuantityUnits", () => {
  const kinds = [
    { key: "temperature", label: "Temperature", category: "physical", canonical_unit_code: "Cel", compatible_units: ["Cel", "degF", "K"], standard_field_name: "temperature_C", sort_order: 1, active: true },
  ];

  it("passes for a recognized kind and compatible unit", () => {
    expect(validateQuantityUnits({ temperature: { value: 60, unit_code: "Cel" } }, kinds)).toBeNull();
  });

  it("rejects an unrecognized quantity kind", () => {
    expect(validateQuantityUnits({ made_up: { value: 1, unit_code: "Cel" } }, kinds)).toMatch(/made_up/);
  });

  it("rejects a unit not compatible with the kind", () => {
    expect(validateQuantityUnits({ temperature: { value: 60, unit_code: "mM" } }, kinds)).toMatch(/mM/);
  });

  it("also validates a protocol step's target_quantities shape (T1.5 D3 reuse)", () => {
    expect(validateQuantityUnits({ temperature: { value: 80, unit_code: "Cel" } }, kinds)).toBeNull();
    expect(validateQuantityUnits({ temperature: { value: 80, unit_code: "mM" } }, kinds)).toMatch(/mM/);
  });
});

describe("validateDeviationCategory", () => {
  const allowed = ["calculation_error", "wrong_solvent", "instrument_failure"];

  it("passes for a recognized category", () => {
    expect(validateDeviationCategory("wrong_solvent", allowed)).toBeNull();
  });

  it("rejects an unrecognized category", () => {
    expect(validateDeviationCategory("made_up_category", allowed)).toMatch(/made_up_category/);
  });
});

describe("validateSampleMatrixVocab", () => {
  const allowed = { sampleTypes: ["sample", "control"], reactionModes: ["dry-down"], sampleStatuses: ["planned"] };

  it("passes when every non-empty value is in the allow-list", () => {
    const rows = [{ ...sampleRow, sample_type: "control", reaction_mode: "dry-down", status: "planned" }];
    expect(validateSampleMatrixVocab(rows, allowed)).toBeNull();
  });

  it("passes when the vocabulary cells are left blank", () => {
    expect(validateSampleMatrixVocab([sampleRow], allowed)).toBeNull();
  });

  it("rejects a sample_type not in the allow-list", () => {
    const rows = [{ ...sampleRow, sample_type: "made-up type" }];
    expect(validateSampleMatrixVocab(rows, allowed)).toMatch(/made-up type/);
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
