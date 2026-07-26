// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@/components/toast-provider";

function Trigger({ message, kind }: { message: string; kind?: "success" | "error" }) {
  const { showToast } = useToast();
  return (
    <button onClick={() => showToast(message, kind)}>trigger</button>
  );
}

describe("ToastProvider / useToast", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows nothing before a toast is triggered", () => {
    render(
      <ToastProvider>
        <Trigger message="Saved" />
      </ToastProvider>
    );
    expect(screen.queryByText("Saved")).toBeNull();
  });

  it("shows the message after showToast is called, then auto-dismisses after 3s", async () => {
    render(
      <ToastProvider>
        <Trigger message="Saved" />
      </ToastProvider>
    );

    act(() => screen.getByText("trigger").click());
    expect(screen.getByText("Saved")).not.toBeNull();

    act(() => vi.advanceTimersByTime(3000));
    expect(document.querySelector(".toast.show")).toBeNull();
  });

  it("throws when useToast is called outside a ToastProvider", () => {
    function Broken() {
      useToast();
      return null;
    }
    // Suppress the expected React error-boundary console noise for this case.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Broken />)).toThrow(/must be used within/);
    spy.mockRestore();
  });
});
