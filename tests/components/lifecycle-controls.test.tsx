// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LifecycleControls } from "@/components/lifecycle-controls";
import { ExperimentStatusBadge, ExperimentViewProvider } from "@/components/experiment-view";
import { ToastProvider } from "@/components/toast-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  unstable_rethrow: (e: unknown) => {
    throw e;
  },
}));

describe("LifecycleControls", () => {
  it("shows In progress on the headline after Start without waiting for a refresh", async () => {
    const setStatusAction = vi.fn(async () => ({ ok: true as const }));

    render(
      <ToastProvider>
        <ExperimentViewProvider name="E2E lifecycle" status="draft">
          <ExperimentStatusBadge />
          <LifecycleControls
            hasConclusion={false}
            hasAcceptanceCriteria
            setStatusAction={setStatusAction}
            completeAction={async () => ({ ok: true })}
            reviewAction={async () => ({ ok: true })}
          />
        </ExperimentViewProvider>
      </ToastProvider>
    );

    expect(screen.getByText("Draft")).toBeTruthy();

    await act(async () => {
      screen.getByRole("button", { name: "Start" }).click();
      await Promise.resolve();
    });

    expect(setStatusAction).toHaveBeenCalledWith("in_progress");
    expect(screen.getByText("In progress")).toBeTruthy();
  });
});
