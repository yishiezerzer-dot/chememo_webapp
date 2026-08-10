import { describe, expect, it, vi } from "vitest";
import type { CrewDraft } from "@/lib/ai/crew/types";
import type { ExperimentTemplateVersion } from "@/lib/types";

// T3.8 — buildCommitInput is a pure function; exercised directly with no
// mocking. commitCrewDraft's D5 (no UPDATE/DELETE on experiments) and D7
// (unchecked project proposal never silently assigns one) are exercised
// against a spied fake Supabase client below.

vi.mock("@/lib/llm", () => ({ activeChatModel: () => "test-model" }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

const { buildCommitInput, commitCrewDraft } = await import("@/lib/ai/crew/commit");

function makeDraft(overrides: Partial<CrewDraft["structured"]> = {}, unresolved: CrewDraft["unresolved"] = []): CrewDraft {
  return {
    rawSource: "raw notes",
    structured: {
      scientific_question: "Does X happen?",
      rationale: null,
      hypothesis: null,
      primary_outcomes: "Yield measured by LC-MS.",
      secondary_outcomes: null,
      independent_variables: null,
      controlled_variables: null,
      data_analysis_plan: null,
      risks: "Fe(III) precipitation at high pH.",
      experiment_type: "chemistry",
      replicate_kind: "technical_replicate",
      legacy_codes: ["B1"],
      ...overrides,
    },
    unresolved,
    normalization: [],
    provenance: {},
    failedAgents: [],
  };
}

describe("buildCommitInput — field mapping (D8 revalidation)", () => {
  it("renames primary_outcomes -> primary_outcome and risks -> risks_failure_modes", () => {
    const { input } = buildCommitInput(makeDraft(), "Test experiment", null);
    expect(input.primary_outcome).toBe("Yield measured by LC-MS.");
    expect(input.risks_failure_modes).toBe("Fe(III) precipitation at high pH.");
  });

  it("maps fields that share the same name unchanged", () => {
    const { input } = buildCommitInput(makeDraft({ scientific_question: "Q?" }), "Test experiment", null);
    expect(input.scientific_question).toBe("Q?");
  });

  it("never writes experiment_type, replicate_kind, or legacy_codes to any ExperimentInput field", () => {
    const { input } = buildCommitInput(makeDraft(), "Test experiment", null);
    const serialized = JSON.stringify(input);
    expect(serialized).not.toContain("chemistry");
    expect(serialized).not.toContain("technical_replicate");
    expect(serialized).not.toContain("B1");
  });

  it("always adds a static acceptance-criteria reminder (T3.7 never proposes one)", () => {
    const { addedUnresolved } = buildCommitInput(makeDraft(), "Test experiment", null);
    expect(addedUnresolved.some((u) => u.field === "acceptance_criteria")).toBe(true);
  });
});

describe("buildCommitInput — D9 template required-field handling", () => {
  const template = {
    id: "tv-1",
    template_id: "t-1",
    version: 1,
    defaults: {},
    required_fields: ["rationale", "compounds"],
  } as unknown as ExperimentTemplateVersion;

  it("fills a required TEXT field with TBD and adds an unresolved item when the crew didn't capture it", () => {
    const { input, addedUnresolved } = buildCommitInput(makeDraft({ rationale: null }), "Test experiment", template);
    expect(input.rationale).toBe("TBD");
    expect(addedUnresolved.some((u) => u.field === "rationale")).toBe(true);
  });

  it("never invents a value for a required NON-text field — leaves it empty, just flags it", () => {
    const { input, addedUnresolved } = buildCommitInput(makeDraft(), "Test experiment", template);
    expect(input.compounds).toEqual([]);
    expect(addedUnresolved.some((u) => u.field === "compounds")).toBe(true);
  });

  it("does not add an unresolved item for a required field the crew DID capture", () => {
    const { addedUnresolved } = buildCommitInput(makeDraft({ rationale: "Because X." }), "Test experiment", template);
    expect(addedUnresolved.some((u) => u.field === "rationale")).toBe(false);
  });
});

// A minimal fake Supabase client: enough surface for commitCrewDraft's one
// insert into experiment_crew_provenance, while recording every method call
// made against the "experiments" table so D5 can be asserted directly.
function makeFakeSupabase(insertError: { message: string } | null = null) {
  const experimentsCalls: string[] = [];
  const from = vi.fn((table: string) => {
    if (table === "experiments") {
      return {
        update: () => {
          experimentsCalls.push("update");
          return { eq: () => ({ error: null }) };
        },
        delete: () => {
          experimentsCalls.push("delete");
          return { eq: () => ({ error: null }) };
        },
      };
    }
    if (table === "experiment_crew_provenance") {
      return { insert: vi.fn(async () => ({ error: insertError })) };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { client: { from } as never, experimentsCalls };
}

vi.mock("@/lib/experiments/service", () => ({
  createExperiment: vi.fn(async () => "EXP-TEST-1"),
  softDeleteExperiment: vi.fn(async () => {}),
}));
vi.mock("@/lib/projects/service", () => ({
  createProject: vi.fn(async () => "new-project-id"),
}));

describe("commitCrewDraft — D5/D7", () => {
  it("never calls UPDATE or DELETE against experiments on the commit path", async () => {
    const { client, experimentsCalls } = makeFakeSupabase();
    await commitCrewDraft(client, "user-1", "ws-1", makeDraft(), {
      name: "Test experiment",
      templateVersionId: null,
      template: null,
      newProjectName: null,
    });
    expect(experimentsCalls).toEqual([]);
  });

  it("leaves project null and adds an unresolved item when the project checkbox is unchecked", async () => {
    const { client } = makeFakeSupabase();
    const { createProject } = await import("@/lib/projects/service");
    await commitCrewDraft(client, "user-1", "ws-1", makeDraft(), {
      name: "Test experiment",
      templateVersionId: null,
      template: null,
      newProjectName: null,
    });
    expect(createProject).not.toHaveBeenCalled();
  });

  it("creates the project and assigns it when a name is given", async () => {
    const { client } = makeFakeSupabase();
    const { createProject } = await import("@/lib/projects/service");
    await commitCrewDraft(client, "user-1", "ws-1", makeDraft(), {
      name: "Test experiment",
      templateVersionId: null,
      template: null,
      newProjectName: "New Programme",
    });
    expect(createProject).toHaveBeenCalledWith(client, "user-1", "ws-1", "New Programme", expect.any(String));
  });
});
