import { describe, expect, it, vi, beforeEach } from "vitest";

// T3.4 — logAiRequest now returns the inserted ai_requests id (for
// ai_retrieval_events/ai_feedback to reference) and auto-logs a distinct
// (provider, chat_model, embedding_model, dims) tuple into ai_model_versions
// via an upsert-ignore-duplicates, so repeated calls with the same config
// never insert more than once. submitAiFeedback writes one ai_feedback row.

const insertedRequests: Record<string, unknown>[] = [];
const upsertCalls: { row: Record<string, unknown>; opts: Record<string, unknown> }[] = [];
const feedbackInserts: Record<string, unknown>[] = [];
const REQUEST_ID = "req-123";

function makeQuery(table: string) {
  const q: Record<string, unknown> = {};
  q.insert = vi.fn((row: Record<string, unknown>) => {
    if (table === "ai_requests") insertedRequests.push(row);
    if (table === "ai_feedback") feedbackInserts.push(row);
    return q;
  });
  q.upsert = vi.fn((row: Record<string, unknown>, opts: Record<string, unknown>) => {
    upsertCalls.push({ row, opts });
    return q;
  });
  q.select = vi.fn(() => q);
  q.single = vi.fn(async () => ({ data: { id: REQUEST_ID }, error: null }));
  // The plain `.insert()`/`.upsert()` chains (no .select().single()) are
  // awaited directly.
  q.then = ((resolve: (v: { data: null; error: null }) => void) => {
    resolve({ data: null, error: null });
    return Promise.resolve();
  }) as unknown;
  return q;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: (table: string) => makeQuery(table) }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/llm", () => ({
  activeChatModel: () => "test-chat-model",
  chatProvider: () => "gemini",
  summarizeExperiment: vi.fn(),
  summarizeGroup: vi.fn(),
}));
vi.mock("@/lib/embeddings", () => ({
  embeddingModel: () => "test-embed-model",
  EMBEDDING_DIM: 1536,
  isEmbeddingEnabled: () => true,
}));
vi.mock("@/lib/rate-limit", () => ({ acquireConcurrency: vi.fn(), checkRate: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }));

const { logAiRequest, submitAiFeedback } = await import("@/lib/ai/service");

describe("logAiRequest", () => {
  beforeEach(() => {
    insertedRequests.length = 0;
    upsertCalls.length = 0;
  });

  it("returns the inserted ai_requests row's id", async () => {
    const id = await logAiRequest({
      userId: "user-1",
      endpoint: "ask_grounded",
      status: "ok",
      sourceCount: 2,
      latencyMs: 100,
      estTokens: 50,
    });
    expect(id).toBe(REQUEST_ID);
    expect(insertedRequests).toHaveLength(1);
  });

  it("auto-logs the current model config into ai_model_versions via upsert-ignore-duplicates", async () => {
    await logAiRequest({
      userId: "user-1",
      endpoint: "ask_grounded",
      status: "ok",
      sourceCount: 1,
      latencyMs: 50,
      estTokens: 10,
    });
    expect(upsertCalls).toHaveLength(1);
    expect(upsertCalls[0].row).toMatchObject({
      provider: "gemini",
      chat_model: "test-chat-model",
      embedding_model: "test-embed-model",
      embedding_dimensions: 1536,
    });
    expect(upsertCalls[0].opts).toMatchObject({
      onConflict: "provider,chat_model,embedding_model,embedding_dimensions",
      ignoreDuplicates: true,
    });
  });
});

describe("submitAiFeedback", () => {
  beforeEach(() => {
    feedbackInserts.length = 0;
  });

  it("writes one ai_feedback row scoped to the caller's own request id and user", async () => {
    const result = await submitAiFeedback("user-1", REQUEST_ID, "up", "Great answer");
    expect(result).toEqual({ ok: true });
    expect(feedbackInserts).toEqual([
      { ai_request_id: REQUEST_ID, user_id: "user-1", rating: "up", note: "Great answer" },
    ]);
  });

  it("stores a null note when none is given", async () => {
    await submitAiFeedback("user-1", REQUEST_ID, "down");
    expect(feedbackInserts[0].note).toBeNull();
  });
});
