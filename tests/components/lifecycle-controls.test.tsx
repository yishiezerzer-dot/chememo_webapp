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
    const startAction = vi.fn(async () => ({ ok: true as const }));

    render(
      <ToastProvider>
        <ExperimentViewProvider name="E2E lifecycle" status="draft">
          <ExperimentStatusBadge />
          <LifecycleControls
            hasConclusion={false}
            hasAcceptanceCriteria
            setStatusAction={setStatusAction}
            startAction={startAction}
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

    // Start no longer routes through setStatus: it carries the acceptance
    // criteria and the transition in one statement, so the write and the
    // §8.6 lock cannot come apart.
    expect(startAction).toHaveBeenCalled();
    expect(setStatusAction).not.toHaveBeenCalled();
    expect(screen.getByText("In progress")).toBeTruthy();
  });

  it("asks for acceptance criteria instead of disabling Start", async () => {
    // This used to be a disabled button with a tooltip telling you to go to
    // the Edit page and find the field among thirty others, so the rule was
    // discoverable only by failing at it.
    const startAction = vi.fn(async () => ({ ok: true as const }));

    render(
      <ToastProvider>
        <ExperimentViewProvider name="Needs criteria" status="draft">
          <ExperimentStatusBadge />
          <LifecycleControls
            hasConclusion={false}
            hasAcceptanceCriteria={false}
            setStatusAction={async () => ({ ok: true })}
            startAction={startAction}
            completeAction={async () => ({ ok: true })}
            reviewAction={async () => ({ ok: true })}
          />
        </ExperimentViewProvider>
      </ToastProvider>
    );

    const start = screen.getByRole("button", { name: "Start" });
    expect(start.hasAttribute("disabled")).toBe(false);

    await act(async () => {
      start.click();
      await Promise.resolve();
    });

    // The question, not a refusal.
    expect(screen.getByText("How will you know this worked?")).toBeTruthy();
    expect(startAction).not.toHaveBeenCalled();

    const box = screen.getByLabelText("How will you know this worked?") as HTMLTextAreaElement;
    box.value = "Depsipeptide dimer visible by LC-MS above 3x blank";

    await act(async () => {
      screen.getAllByRole("button", { name: "Start" })[1].click();
      await Promise.resolve();
    });

    expect(startAction).toHaveBeenCalledWith("Depsipeptide dimer visible by LC-MS above 3x blank");
  });

  it("lets an exploratory experiment start without inventing criteria", async () => {
    // §8.6 permits committing to not pre-committing, so long as it is done
    // before seeing the data and is then locked. The old form made an honest
    // exploratory run write prose to satisfy a non-blank check.
    const startAction = vi.fn(async () => ({ ok: true as const }));

    render(
      <ToastProvider>
        <ExperimentViewProvider name="Exploratory" status="draft">
          <ExperimentStatusBadge />
          <LifecycleControls
            hasConclusion={false}
            hasAcceptanceCriteria={false}
            setStatusAction={async () => ({ ok: true })}
            startAction={startAction}
            completeAction={async () => ({ ok: true })}
            reviewAction={async () => ({ ok: true })}
          />
        </ExperimentViewProvider>
      </ToastProvider>
    );

    await act(async () => {
      screen.getByRole("button", { name: "Start" }).click();
      await Promise.resolve();
    });
    await act(async () => {
      screen.getByRole("button", { name: /exploratory/i }).click();
      await Promise.resolve();
    });

    expect(startAction).toHaveBeenCalledWith(
      "Exploratory — no pre-specified acceptance criteria."
    );
  });
});
