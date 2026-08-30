// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStickyState } from "@/lib/use-sticky-state";

describe("useStickyState", () => {
  it("tracks the server value while nothing has been patched locally", () => {
    const { result, rerender } = renderHook(({ server }: { server: string }) => useStickyState(server), {
      initialProps: { server: "draft" },
    });
    expect(result.current[0]).toBe("draft");

    rerender({ server: "in_progress" });
    expect(result.current[0]).toBe("in_progress");
  });

  it("shows the local patch immediately, before any refresh commits", () => {
    const { result } = renderHook(({ server }: { server: string }) => useStickyState(server), {
      initialProps: { server: "draft" },
    });

    act(() => result.current[1]("in_progress"));
    expect(result.current[0]).toBe("in_progress");
  });

  it("holds the patch when a late refresh re-sends the SAME pre-mutation value", () => {
    // The dropped-refresh case this exists for: the payload that eventually
    // arrives still carries what the server last sent, so it must not clobber
    // the result the user is already looking at.
    const { result, rerender } = renderHook(({ server }: { server: string }) => useStickyState(server), {
      initialProps: { server: "draft" },
    });

    act(() => result.current[1]("in_progress"));
    rerender({ server: "draft" });
    expect(result.current[0]).toBe("in_progress");
  });

  it("gives way the moment the server sends something genuinely new", () => {
    // The reconciliation rule, and the reason this differs from the version it
    // was adapted from: the server is the record, so once it moves it wins.
    // The screen must never go on contradicting it.
    const { result, rerender } = renderHook(({ server }: { server: string }) => useStickyState(server), {
      initialProps: { server: "draft" },
    });

    act(() => result.current[1]("in_progress"));
    expect(result.current[0]).toBe("in_progress");

    rerender({ server: "cancelled" });
    expect(result.current[0]).toBe("cancelled");
  });
});
