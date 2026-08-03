import { describe, expect, it } from "vitest";
import { diffExperiments, DIFF_EXCLUDED_KEYS } from "@/lib/diff";
import type { Experiment } from "@/lib/types";

const base: Experiment = {
  id: "EXP-001",
  owner_id: "user-1",
  name: "Test experiment",
  date: "2026-01-01",
  researcher: "Y. Ezerzer",
  project: "test-project",
  reaction_type: "Wet-dry cycling",
  compounds: ["Histidine"],
  metals: [],
  ph: 7,
  concentration: null,
  temperature: null,
  cycles: 5,
  methods: ["NMR"],
  mz: [297],
  observations: "Some observations.",
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
  acceptance_criteria_locked_at: null,
  planned_start_at: null,
  planned_end_at: null,
  independent_variables: null,
  controlled_variables: null,
  sample_matrix: [],
  controls: [],
  protocol_version: null,
  protocol_version_id: null,
  template_version_id: null,
  based_on_experiment_id: null,
  planned_analyses: null,
  sample_storage_plan: null,
  quantities: {},
  status: "draft",
  started_at: null,
  completed_at: null,
  completed_by: null,
  reviewed_at: null,
  reviewed_by: null,
  locked_at: null,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  short_code: "E001",
  search_vector: null,
};

describe("diffExperiments", () => {
  it("reports a scalar field change as old -> new", () => {
    const after = { ...base, ph: 8 };
    const fields = diffExperiments(base, after);
    const phField = fields.find((f) => f.key === "ph");
    expect(phField).toBeDefined();
    expect(phField?.kind).toBe("scalar");
    expect(phField?.before).toBe(7);
    expect(phField?.after).toBe(8);
  });

  it("reports a primitive array change as added/removed", () => {
    const after = { ...base, compounds: ["Histidine", "Glycine"], metals: [] };
    const fields = diffExperiments(base, after);
    const compoundsField = fields.find((f) => f.key === "compounds");
    expect(compoundsField?.kind).toBe("array");
    expect(compoundsField?.added).toEqual(["Glycine"]);
    expect(compoundsField?.removed).toEqual([]);
  });

  it("reports no diff when only excluded (system/lock/lifecycle) columns differ", () => {
    const after = {
      ...base,
      updated_at: "2026-02-01T00:00:00Z",
      short_code: "DIFFERENT",
      search_vector: "some tsvector text",
      locked_at: "2026-02-01T00:00:00Z",
      completed_at: "2026-02-01T00:00:00Z",
      completed_by: "user-2",
      reviewed_at: "2026-02-01T00:00:00Z",
      reviewed_by: "user-2",
    };
    expect(diffExperiments(base, after)).toEqual([]);
  });

  it("never includes an excluded key in the diff, even when it legitimately differs", () => {
    const after = { ...base, updated_at: "2026-02-01T00:00:00Z", ph: 8 };
    const fields = diffExperiments(base, after);
    for (const excludedKey of DIFF_EXCLUDED_KEYS) {
      expect(fields.some((f) => f.key === excludedKey)).toBe(false);
    }
  });

  it("flags a jsonb object-array field (sample_matrix) as changed without a deep diff", () => {
    const row = {
      sample_id: "", vial_label: "", legacy_code: "", batch: "B01", replicate: "R1",
      sample_type: "", component_1: "", amount_1: "", component_2: "", amount_2: "",
      ratio: "", initial_volume: "", reaction_mode: "", temperature: "", duration: "",
      atmosphere: "", treatment: "", planned_analysis: "", status: "",
    };
    const after = { ...base, sample_matrix: [row] };
    const fields = diffExperiments(base, after);
    const smField = fields.find((f) => f.key === "sample_matrix");
    expect(smField?.kind).toBe("json");
  });
});
