import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_CREW_INPUT_CHARS } from "@/lib/rate-limit";

// T3.7 D3 — a crew run must consume exactly ONE concurrency/rate-limit slot
// for the whole run, not one per agent (runCrew is mocked out entirely here
// so this test is purely about the ROUTE's own slot-acquisition discipline,
// not about the crew's internal behavior — that's coordinator.test.ts's job).
// D5 — over-limit input is rejected outright, never truncated.

const acquireAiSlot = vi.fn(async () => ({ release: vi.fn() }));
const logAiRequest = vi.fn(async () => "req-1");
const runCrew = vi.fn(async () => ({
  rawSource: "notes",
  structured: {},
  unresolved: [],
  normalization: [],
  provenance: {},
  failedAgents: [],
}));
let llmEnabled = true;
let authedUser: { id: string } | null = { id: "user-1" };

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: authedUser } }) },
  }),
}));
vi.mock("@/lib/llm", () => ({ isLlmEnabled: () => llmEnabled }));
vi.mock("@/lib/ai/crew/coordinator", () => ({ runCrew }));
vi.mock("@/lib/ai/service", () => ({ acquireAiSlot, logAiRequest }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

beforeEach(() => {
  llmEnabled = true;
  authedUser = { id: "user-1" };
  acquireAiSlot.mockClear();
  logAiRequest.mockClear();
  runCrew.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const { POST } = await import("@/app/api/crew/plan/route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/crew/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/crew/plan", () => {
  it("acquires exactly one concurrency slot for the whole run", async () => {
    const res = await POST(makeRequest({ notes: "some rough notes", projectId: null }));
    expect(res.status).toBe(200);
    expect(acquireAiSlot).toHaveBeenCalledTimes(1);
    expect(runCrew).toHaveBeenCalledTimes(1);
  });

  it("rejects notes over MAX_CREW_INPUT_CHARS, naming the limit, without calling the crew", async () => {
    const tooLong = "x".repeat(MAX_CREW_INPUT_CHARS + 1);
    const res = await POST(makeRequest({ notes: tooLong, projectId: null }));
    expect(res.status).toBe(413);
    const text = await res.text();
    expect(text).toContain(String(MAX_CREW_INPUT_CHARS));
    expect(runCrew).not.toHaveBeenCalled();
    expect(acquireAiSlot).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no authenticated user", async () => {
    authedUser = null;
    const res = await POST(makeRequest({ notes: "notes", projectId: null }));
    expect(res.status).toBe(401);
    expect(runCrew).not.toHaveBeenCalled();
  });

  it("returns 503 when the LLM is not configured (D10)", async () => {
    llmEnabled = false;
    const res = await POST(makeRequest({ notes: "notes", projectId: null }));
    expect(res.status).toBe(503);
    expect(runCrew).not.toHaveBeenCalled();
  });
});
