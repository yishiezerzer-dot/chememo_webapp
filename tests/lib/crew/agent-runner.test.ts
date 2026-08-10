import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// T3.7 D6 — retry-once-then-fail-explicitly: on an invalid response, the
// runner retries ONCE with the validation errors fed back to the model; if
// that also fails, it returns null (never a fake default). Same real-fetch
// mocking approach as tests/lib/llm.test.ts.

const originalFetch = global.fetch;
const originalEnv = { ...process.env };
let responses: string[] = [];

function mockGeminiSequence(jsonTexts: string[]) {
  responses = [...jsonTexts];
  global.fetch = vi.fn(async () => {
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

const { runAgentStep } = await import("@/lib/ai/crew/agent-runner");

const schema = z.object({ value: z.string() });

describe("runAgentStep", () => {
  it("returns the parsed result on a valid first response", async () => {
    mockGeminiSequence([JSON.stringify({ value: "ok" })]);
    const result = await runAgentStep("system", "user", schema, 100);
    expect(result).toEqual({ value: "ok" });
  });

  it("retries once with validation errors and succeeds on the corrected response", async () => {
    mockGeminiSequence([JSON.stringify({ value: 42 }), JSON.stringify({ value: "corrected" })]);
    const result = await runAgentStep("system", "user", schema, 100);
    expect(result).toEqual({ value: "corrected" });
  });

  it("returns null when both the first response and the retry are invalid", async () => {
    mockGeminiSequence([JSON.stringify({ value: 1 }), JSON.stringify({ value: 2 })]);
    const result = await runAgentStep("system", "user", schema, 100);
    expect(result).toBeNull();
  });

  it("returns null when the model response isn't valid JSON at all", async () => {
    mockGeminiSequence(["not json", "still not json"]);
    const result = await runAgentStep("system", "user", schema, 100);
    expect(result).toBeNull();
  });
});
