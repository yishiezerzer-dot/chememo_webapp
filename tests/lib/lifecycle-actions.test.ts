import { beforeEach, describe, expect, it, vi } from "vitest";

// reopenExperiment relies entirely on the reopen_experiment() SQL function
// (one RPC call = one transaction) rather than a separate insert step, so
// there is no code path in this action that could write a reopen lock event
// without the matching unlock (or vice versa) — asserted below by checking
// `.from()` (a second, non-atomic write) is never called.
const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/authorization/policies", () => ({
  requireUser: () =>
    Promise.resolve({
      supabase: { rpc: rpcMock, from: fromMock },
      user: { id: "user-1" },
    }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { reopenExperiment } = await import("@/app/(app)/experiments/[id]/lifecycle-actions");

describe("reopenExperiment", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockReset();
  });

  it("rejects a blank reason before calling the database", async () => {
    const result = await reopenExperiment("EXP-001", "   ");
    expect(result.ok).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("trims the reason and calls reopen_experiment via a single RPC", async () => {
    rpcMock.mockResolvedValue({ error: null });
    const result = await reopenExperiment("EXP-001", "  Needed to fix a typo.  ");
    expect(result.ok).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("reopen_experiment", {
      p_id: "EXP-001",
      p_reason: "Needed to fix a typo.",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("surfaces the trigger/function's own error message on failure, with no separate write attempted", async () => {
    rpcMock.mockResolvedValue({
      error: { message: "Experiment EXP-001 not found or not permitted." },
    });
    const result = await reopenExperiment("EXP-001", "A reason.");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Experiment EXP-001 not found or not permitted.");
    expect(fromMock).not.toHaveBeenCalled();
  });
});
