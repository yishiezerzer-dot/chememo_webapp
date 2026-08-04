import { describe, expect, it } from "vitest";
import { buildExperimentMarkdown, type ExperimentExportInput } from "@/lib/export/markdown";
import type { Experiment } from "@/lib/types";

const baseExperiment: Experiment = {
  id: "EXP-001",
  owner_id: "user-1",
  workspace_id: "ws-1",
  name: "Test experiment",
  date: "2026-01-01",
  researcher: "Y. Ezerzer",
  project: "test-project",
  reaction_type: null,
  compounds: [],
  metals: [],
  ph: null,
  concentration: null,
  temperature: null,
  cycles: null,
  methods: [],
  mz: [],
  observations: null,
  notes: null,
  scientific_question: "Does it work?",
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

const baseInput: ExperimentExportInput = {
  experiment: baseExperiment,
  projectLabel: "Wet-dry",
  ownerName: "Yishi Ezerzer",
  protocolVersionLabel: null,
  quantityKinds: [],
  relationships: [],
  tasks: [],
  stepDetails: [],
  revisions: [],
};

describe("buildExperimentMarkdown", () => {
  it("frontmatter carries the real id, status, project, and owner", () => {
    const md = buildExperimentMarkdown(baseInput);
    expect(md).toContain("experiment_id: EXP-001");
    expect(md).toContain("status: draft");
    expect(md).toContain('project: "[[Wet-dry]]"');
    expect(md).toContain('owner: "Yishi Ezerzer"');
  });

  it("a populated quantity renders under its standard_field_name", () => {
    const md = buildExperimentMarkdown({
      ...baseInput,
      experiment: { ...baseExperiment, quantities: { temperature: { value: 80, unit_code: "Cel" } } },
      quantityKinds: [
        {
          key: "temperature",
          label: "Temperature",
          category: "physical",
          canonical_unit_code: "Cel",
          compatible_units: ["Cel"],
          standard_field_name: "temperature_C",
          sort_order: 1,
          active: true,
        },
      ],
    });
    expect(md).toContain("| temperature_C | 80 | Cel |");
  });

  it("an unpopulated section produces no empty heading", () => {
    const md = buildExperimentMarkdown(baseInput);
    expect(md).not.toContain("## Relationships");
    expect(md).not.toContain("## Task assignment");
    expect(md).not.toContain("## Deviations");
  });

  it("lists sections with no backing entity in the closing callout", () => {
    const md = buildExperimentMarkdown(baseInput);
    expect(md).toContain("Not yet tracked in ChemMemo");
    expect(md).toContain("Batches");
    expect(md).toContain("Analyses");
  });

  it("notes/observations render under the disclosed unmapped heading only when populated", () => {
    const withoutNotes = buildExperimentMarkdown(baseInput);
    expect(withoutNotes).not.toContain("Additional notes");

    const withNotes = buildExperimentMarkdown({
      ...baseInput,
      experiment: { ...baseExperiment, notes: "A stray note.", observations: "Something observed." },
    });
    expect(withNotes).toContain("## Additional notes (no standard-section mapping)");
    expect(withNotes).toContain("**Notes:** A stray note.");
    expect(withNotes).toContain("**Observations:** Something observed.");
  });
});
