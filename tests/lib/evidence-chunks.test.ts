import { beforeEach, describe, expect, it, vi } from "vitest";

// T3.1 D4 — runEvidenceChunkJob is the poller's single entry point (mirrors
// lib/index-jobs.ts's runIndexJob / lib/file-jobs.ts's runFileJob). These
// tests prove: success stamps model/dims/version/indexed_at/status, and
// failure applies the same attempts/backoff shape as the other two pollers.

const updateCalls: Record<string, unknown>[] = [];
let chunkContent = "Experiment EXP-1: some narrative content.";
let attemptsSoFar = 0;
let embeddingEnabled = true;
let embedTextImpl: () => Promise<number[] | null> = async () => [0.1, 0.2, 0.3];

function makeQuery() {
  const builder: Record<string, unknown> = {};
  let selectedCols = "";
  builder.select = vi.fn((cols: string) => {
    selectedCols = cols;
    return builder;
  });
  builder.update = vi.fn((patch: Record<string, unknown>) => {
    updateCalls.push(patch);
    return builder;
  });
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => {
    if (selectedCols === "content") return { data: { content: chunkContent }, error: null };
    if (selectedCols === "attempts") return { data: { attempts: attemptsSoFar }, error: null };
    return { data: null, error: null };
  });
  // The plain `.update().eq()` chain (no .maybeSingle()) is awaited directly.
  builder.then = ((resolve: (v: { data: null; error: null }) => void) => {
    resolve({ data: null, error: null });
    return Promise.resolve();
  }) as unknown;
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => makeQuery() }),
}));

vi.mock("@/lib/embeddings", () => ({
  embedText: () => embedTextImpl(),
  embeddingModel: () => "test-embed-model",
  EMBEDDING_DIM: 1536,
  isEmbeddingEnabled: () => embeddingEnabled,
}));

vi.mock("@/lib/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

const { runEvidenceChunkJob } = await import("@/lib/evidence-chunks");

describe("runEvidenceChunkJob", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    attemptsSoFar = 0;
    embeddingEnabled = true;
    chunkContent = "Experiment EXP-1: some narrative content.";
    embedTextImpl = async () => [0.1, 0.2, 0.3];
  });

  it("marks done without embedding when embeddings are disabled", async () => {
    embeddingEnabled = false;
    await runEvidenceChunkJob("chunk-1");
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]).toMatchObject({ status: "done" });
    expect(updateCalls[0]).not.toHaveProperty("embedding");
  });

  it("stamps embedding_model/dimensions/version/indexed_at/status on success", async () => {
    await runEvidenceChunkJob("chunk-2");
    const update = updateCalls.find((u) => u.status === "done");
    expect(update).toMatchObject({
      status: "done",
      embedding_model: "test-embed-model",
      embedding_dimensions: 1536,
      embedding_version: 1,
      last_error: null,
    });
    expect(update?.embedding).toBe(JSON.stringify([0.1, 0.2, 0.3]));
    expect(update?.indexed_at).toBeTruthy();
  });

  it("retries with backoff on failure, staying pending under MAX_ATTEMPTS", async () => {
    attemptsSoFar = 1;
    embedTextImpl = async () => {
      throw new Error("embed provider unavailable");
    };
    await runEvidenceChunkJob("chunk-3");
    const update = updateCalls.find((u) => "attempts" in u);
    expect(update).toMatchObject({ status: "pending", attempts: 2 });
    expect(update?.last_error).toContain("embed provider unavailable");
    expect(update?.next_attempt_at).toBeTruthy();
  });

  it("marks failed once attempts reach MAX_ATTEMPTS", async () => {
    attemptsSoFar = 4;
    embedTextImpl = async () => {
      throw new Error("still failing");
    };
    await runEvidenceChunkJob("chunk-4");
    const update = updateCalls.find((u) => "attempts" in u);
    expect(update).toMatchObject({ status: "failed", attempts: 5 });
  });
});
