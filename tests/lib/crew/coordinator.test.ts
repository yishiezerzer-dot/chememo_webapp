import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MISSING_SOLVENT_BLANK_NOTES } from "./fixtures/missing-solvent-blank";

// T3.7 — coordinator-level guarantees that must hold regardless of what any
// individual agent's prompt says: rawSource is structurally read-only (D2),
// the Critic can only append findings (D8), and a failed agent is recorded
// rather than silently dropped (D6). Same global.fetch mocking approach as
// tests/lib/llm.test.ts / tests/lib/crew/agent-runner.test.ts — the real
// chatComplete/parseJson/zod-validation code runs, only the network
// boundary is mocked.

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const originalFetch = global.fetch;
const originalEnv = { ...process.env };
let responses: string[] = [];
let capturedBodies: string[] = [];

function mockGeminiQueue(jsonTexts: string[]) {
  responses = [...jsonTexts];
  capturedBodies = [];
  global.fetch = vi.fn(async (_url: unknown, init?: { body?: string }) => {
    if (init?.body) capturedBodies.push(init.body);
    const text = responses.shift();
    if (text === undefined) throw new Error("no more mocked responses");
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
      text: async () => "",
    };
  }) as unknown as typeof fetch;
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

const { runCrew } = await import("@/lib/ai/crew/coordinator");
const { runIntake } = await import("@/lib/ai/crew/agents/intake");

const EMPTY_STEP = "{}"; // valid, fills nothing — agentOutputSchema/criticOutputSchema both default every field.

describe("runCrew — rawSource immutability (D2)", () => {
  it("never changes rawSource even when an agent's JSON tries to smuggle one in", async () => {
    const notes = "Original bench notes, verbatim.";
    mockGeminiQueue([
      JSON.stringify({ structured: { rawSource: "HACKED", scientific_question: "Q?" } }), // intake
      EMPTY_STEP, // design
      EMPTY_STEP, // controls
      EMPTY_STEP, // critic
    ]);
    const draft = await runCrew(notes, null, false);
    expect(draft.rawSource).toBe(notes);
    // The unrecognized "rawSource" key inside structured is silently
    // stripped by zod (not part of planFieldsPartialSchema) rather than
    // merged anywhere — only the real scientific_question field lands.
    expect(draft.structured.scientific_question).toBe("Q?");
  });
});

describe("runCrew — Critic may only append (D8)", () => {
  it("drops any structured block the Critic's response tries to include", async () => {
    mockGeminiQueue([
      JSON.stringify({ structured: { hypothesis: "from design" } }), // intake (no-op here)
      EMPTY_STEP, // design (no-op in this test)
      EMPTY_STEP, // controls
      JSON.stringify({
        structured: { hypothesis: "OVERWRITTEN BY CRITIC" },
        unresolved: [{ field: "risks", issue: "not stated", candidates: [] }],
        normalization: [],
      }), // critic — attempts an edit
    ]);
    const draft = await runCrew("notes", null, false);
    expect(draft.structured.hypothesis).toBe("from design");
    expect(draft.unresolved).toContainEqual({ field: "risks", issue: "not stated", candidates: [] });
  });
});

describe("runCrew — failed agent is recorded, not swallowed (D6)", () => {
  it("records intake in failedAgents when both attempts return invalid JSON", async () => {
    mockGeminiQueue([
      "not valid json",
      "still not valid json",
      EMPTY_STEP, // design
      EMPTY_STEP, // controls
      EMPTY_STEP, // critic
    ]);
    const draft = await runCrew("notes", null, false);
    expect(draft.failedAgents).toEqual(["intake"]);
  });
});

describe("runCrew — project-scoped alias resolution only (D7)", () => {
  it("instructs the Intake agent not to resolve aliases when no projectId is given", async () => {
    mockGeminiQueue([EMPTY_STEP]);
    await runIntake(
      { rawSource: "notes", structured: {} as never, unresolved: [], normalization: [], provenance: {}, failedAgents: [] },
      { projectId: null, groundingText: "" }
    );
    const sentSystem = JSON.parse(capturedBodies[0]).system_instruction.parts[0].text as string;
    expect(sentSystem).toMatch(/do NOT resolve any ambiguous alias/i);
  });

  it("allows alias resolution when a projectId is given", async () => {
    mockGeminiQueue([EMPTY_STEP]);
    await runIntake(
      { rawSource: "notes", structured: {} as never, unresolved: [], normalization: [], provenance: {}, failedAgents: [] },
      { projectId: "proj-1", groundingText: "" }
    );
    const sentSystem = JSON.parse(capturedBodies[0]).system_instruction.parts[0].text as string;
    expect(sentSystem).toMatch(/you may resolve an ambiguous compound/i);
  });
});

describe("runCrew — missing solvent blank scenario (spec's headline acceptance test)", () => {
  it("surfaces a Controls finding about the missing blank into the final draft's unresolved block", async () => {
    mockGeminiQueue([
      JSON.stringify({ structured: { experiment_type: "chemistry" } }), // intake
      EMPTY_STEP, // design
      JSON.stringify({
        unresolved: [
          { field: "controls", issue: "No solvent-only blank control recorded", candidates: [] },
        ],
      }), // controls — this is what a correctly-functioning model SHOULD return
      EMPTY_STEP, // critic
    ]);
    const draft = await runCrew(MISSING_SOLVENT_BLANK_NOTES, null, false);
    expect(draft.unresolved.some((u) => /blank/i.test(u.issue))).toBe(true);
  });
});
