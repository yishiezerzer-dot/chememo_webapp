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

  it("holds a patched LIST when the server re-sends the same rows in a new array", () => {
    // The regression this exists to prevent (CI run 33297353128): every server
    // re-render produces a fresh array, so comparing by reference discarded the
    // patch on any refresh at all and the appended row vanished again.
    const rowA = { id: "a" };
    const { result, rerender } = renderHook(({ server }: { server: { id: string }[] }) => useStickyState(server), {
      initialProps: { server: [rowA] },
    });

    act(() => result.current[1]((cur) => [...cur, { id: "b" }]));
    expect(result.current[0].map((r) => r.id)).toEqual(["a", "b"]);

    // Same rows, different array identity — must NOT be treated as a change.
    rerender({ server: [{ id: "a" }] });
    expect(result.current[0].map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("adopts a LIST the server has genuinely changed", () => {
    const { result, rerender } = renderHook(({ server }: { server: { id: string }[] }) => useStickyState(server), {
      initialProps: { server: [{ id: "a" }] },
    });

    act(() => result.current[1]((cur) => [...cur, { id: "b" }]));
    rerender({ server: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    expect(result.current[0].map((r) => r.id)).toEqual(["a", "b", "c"]);
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
