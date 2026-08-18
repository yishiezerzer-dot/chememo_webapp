import { describe, expect, it, vi } from "vitest";
import type { CrewDraft } from "@/lib/ai/crew/types";
import type { ExperimentTemplateVersion } from "@/lib/types";

// T3.8 — buildCommitInput is a pure function; exercised directly with no
// mocking. commitCrewDraft's D5 (no UPDATE/DELETE on experiments) and D7
// (unchecked project proposal never silently assigns one) are exercised
// against a spied fake Supabase client below.

// isLlmEnabled defaults to false via mockReturnValue below — the D5/D7 tests
// exercise commit-flow safety properties, not the plan-time AI suggestion
// generation (that's covered by its own describe block further down), so
// keeping it disabled there means commitCrewDraft's new best-effort
// suggestion branch is never reached, matching the "inert without keys"
// pattern already established everywhere else in this app. vi.fn() wrappers
// (not plain arrow functions) so individual tests can override behavior via
// vi.mocked(...).mockReturnValue(...).
vi.mock("@/lib/llm", () => ({
  activeChatModel: () => "test-model",
  isLlmEnabled: vi.fn(() => false),
  suggestFieldsForPlan: vi.fn(async () => []),
  AI_SUGGESTIBLE_FIELDS: [
    "scientific_question", "hypothesis", "rationale", "primary_outcome",
    "secondary_outcomes", "data_analysis_plan", "risks_failure_modes",
    "conclusion", "next_steps", "observations",
  ],
}));
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiSuggestionInserts: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const provenanceInserts: any[] = [];
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
      return {
        insert: vi.fn(async (row: unknown) => {
          provenanceInserts.push(row);
          return { error: insertError };
        }),
      };
    }
    if (table === "experiment_ai_suggestions") {
      return {
        insert: vi.fn(async (rows: unknown) => {
          aiSuggestionInserts.push(rows);
          return { error: null };
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { client: { from } as never, experimentsCalls, aiSuggestionInserts, provenanceInserts };
}

vi.mock("@/lib/experiments/service", () => ({
  createExperiment: vi.fn(async () => "EXP-TEST-1"),
  softDeleteExperiment: vi.fn(async () => {}),
}));
vi.mock("@/lib/projects/service", () => ({
  createProject: vi.fn(async () => "new-project-id"),
}));

describe("commitCrewDraft — unresolved field-name bug fix (2026-08-17)", () => {
  it("renames unresolved items' field the same way buildCommitInput renames ExperimentInput's, so Resolve with AI can match them", async () => {
    const { client, provenanceInserts } = makeFakeSupabase();
    const draft = makeDraft({}, [
      { field: "primary_outcomes", issue: "Not stated.", candidates: [] },
      { field: "risks", issue: "Not stated.", candidates: [] },
      { field: "hypothesis", issue: "Not stated.", candidates: [] }, // unchanged name, should pass through
    ]);
    await commitCrewDraft(client, "user-1", "ws-1", draft, {
      name: "Test experiment",
      templateVersionId: null,
      template: null,
      newProjectName: null,
    });
    const [row] = provenanceInserts;
    const fields = (row.unresolved as { field: string }[]).map((u) => u.field);
    expect(fields).toContain("primary_outcome");
    expect(fields).toContain("risks_failure_modes");
    expect(fields).toContain("hypothesis");
    expect(fields).not.toContain("primary_outcomes");
    expect(fields).not.toContain("risks");
  });
});

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

describe("commitCrewDraft — plan-time AI suggestions", () => {
  it("generates and inserts a suggestion linked to the matching unresolved item's id, only for narrative-field items", async () => {
    const { isLlmEnabled, suggestFieldsForPlan } = await import("@/lib/llm");
    vi.mocked(isLlmEnabled).mockReturnValue(true);
    vi.mocked(suggestFieldsForPlan).mockResolvedValue([
      { field: "hypothesis", suggestedValue: "Zn2+ templates the depsipeptide.", rationale: "Pattern from the Zn analog." },
    ]);

    const { client, aiSuggestionInserts, provenanceInserts } = makeFakeSupabase();
    const draft = makeDraft({}, [
      { field: "controls", issue: "Blank control not mentioned.", candidates: [] },
      { field: "hypothesis", issue: "No hypothesis stated.", candidates: [] },
    ]);
    await commitCrewDraft(client, "user-1", "ws-1", draft, {
      name: "Test experiment",
      templateVersionId: null,
      template: null,
      newProjectName: null,
    });

    // Only asked about the narrative field ("hypothesis"), never "controls".
    expect(suggestFieldsForPlan).toHaveBeenCalledWith(expect.anything(), draft.rawSource, ["hypothesis"]);
    expect(aiSuggestionInserts).toHaveLength(1);
    const [rows] = aiSuggestionInserts;
    // Bound to the hypothesis item's own id, never to its array position
    // (which shifts) or to the bare field name (which is not unique).
    const persisted = provenanceInserts[0].unresolved as { id: string; field: string }[];
    const hypothesisItem = persisted.find((u) => u.field === "hypothesis")!;
    expect(hypothesisItem.id).toBeTruthy();
    expect(rows).toEqual([
      expect.objectContaining({
        field: "hypothesis",
        suggested_value: "Zn2+ templates the depsipeptide.",
        source: "crew_resolve",
        unresolved_item_id: hypothesisItem.id,
        created_by: "user-1",
      }),
    ]);
  });

  // Regression for the 2026-08-18 wrong-item-cleared bug: the crew's four
  // agents each append independently, so one field routinely carries several
  // items. Keying a suggestion by field name attached it to all of them and
  // cleared whichever came first rather than the one the scientist clicked.
  it("gives duplicate same-field items distinct ids and binds the suggestion to exactly one of them", async () => {
    const { isLlmEnabled, suggestFieldsForPlan } = await import("@/lib/llm");
    vi.mocked(isLlmEnabled).mockReturnValue(true);
    vi.mocked(suggestFieldsForPlan).mockResolvedValue([
      { field: "hypothesis", suggestedValue: "Zn2+ templates the depsipeptide.", rationale: "Pattern from the Zn analog." },
    ]);

    const { client, aiSuggestionInserts, provenanceInserts } = makeFakeSupabase();
    const draft = makeDraft({}, [
      { field: "hypothesis", issue: "No explicit predicted outcome is stated.", candidates: [] },
      { field: "hypothesis", issue: "No explicit hypothesis is provided.", candidates: [] },
      { field: "hypothesis", issue: "No explicit, testable prediction is stated.", candidates: [] },
    ]);
    await commitCrewDraft(client, "user-1", "ws-1", draft, {
      name: "Test experiment",
      templateVersionId: null,
      template: null,
      newProjectName: null,
    });

    const persisted = provenanceInserts[0].unresolved as { id: string; field: string }[];
    const hypothesisItems = persisted.filter((u) => u.field === "hypothesis");
    expect(hypothesisItems).toHaveLength(3);
    expect(new Set(hypothesisItems.map((u) => u.id)).size).toBe(3);

    // Exactly one suggestion, pointing at exactly one of the three.
    const [rows] = aiSuggestionInserts;
    expect(rows).toHaveLength(1);
    expect(hypothesisItems.map((u) => u.id)).toContain(rows[0].unresolved_item_id);
  });

  it("never blocks draft creation when suggestion generation throws", async () => {
    const { isLlmEnabled, suggestFieldsForPlan } = await import("@/lib/llm");
    vi.mocked(isLlmEnabled).mockReturnValue(true);
    vi.mocked(suggestFieldsForPlan).mockRejectedValue(new Error("provider outage"));

    const { client } = makeFakeSupabase();
    const draft = makeDraft({}, [{ field: "hypothesis", issue: "No hypothesis stated.", candidates: [] }]);
    const experimentId = await commitCrewDraft(client, "user-1", "ws-1", draft, {
      name: "Test experiment",
      templateVersionId: null,
      template: null,
      newProjectName: null,
    });
    expect(experimentId).toBe("EXP-TEST-1"); // commit still succeeded
  });

  it("skips the suggestion call entirely when there are no narrative-field unresolved items", async () => {
    const { isLlmEnabled, suggestFieldsForPlan } = await import("@/lib/llm");
    vi.mocked(isLlmEnabled).mockReturnValue(true);
    vi.mocked(suggestFieldsForPlan).mockClear();

    const { client, aiSuggestionInserts } = makeFakeSupabase();
    const draft = makeDraft({}, [{ field: "controls", issue: "Blank control not mentioned.", candidates: [] }]);
    await commitCrewDraft(client, "user-1", "ws-1", draft, {
      name: "Test experiment",
      templateVersionId: null,
      template: null,
      newProjectName: null,
    });
    expect(suggestFieldsForPlan).not.toHaveBeenCalled();
    expect(aiSuggestionInserts).toHaveLength(0);
  });
});
