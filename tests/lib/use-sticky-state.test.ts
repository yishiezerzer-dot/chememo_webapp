// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStickyState } from "@/lib/use-sticky-state";

describe("useStickyState", () => {
  it("tracks the server value until it is patched locally", () => {
    const { result, rerender } = renderHook(({ server }: { server: string }) => useStickyState(server), {
      initialProps: { server: "draft" },
    });
    expect(result.current[0]).toBe("draft");

    rerender({ server: "in_progress" });
    expect(result.current[0]).toBe("in_progress");
  });

  it("keeps a local patch even when the server value later changes", () => {
    const { result, rerender } = renderHook(({ server }: { server: string }) => useStickyState(server), {
      initialProps: { server: "draft" },
    });

    act(() => result.current[1]("in_progress"));
    expect(result.current[0]).toBe("in_progress");

    rerender({ server: "draft" });
    expect(result.current[0]).toBe("in_progress");
  });
});
