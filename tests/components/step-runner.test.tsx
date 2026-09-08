// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepRunner } from "@/components/step-runner";
import { ToastProvider } from "@/components/toast-provider";
import type { StepDetail } from "@/lib/experiment-steps/service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  unstable_rethrow: (e: unknown) => {
    throw e;
  },
}));

const instantiated: StepDetail[] = [
  {
    step: {
      id: "s1",
      experiment_id: "EXP-1",
      protocol_step_id: "ps1",
      status: "not_started",
      actual_ph: null,
      actual_quantities: {},
      actual_atmosphere: null,
      started_at: null,
      completed_at: null,
      completed_by: null,
      workspace_id: null,
    },
    protocolStep: {
      id: "ps1",
      protocol_version_id: "pv1",
      step_number: 1,
      instruction: "Added 250 µL ACN to the dry residue.",
      target_ph: null,
      target_quantities: {},
      target_atmosphere: null,
      required_material: null,
      safety_note: null,
      workspace_id: null,
    },
    observations: [],
    deviations: [],
  },
];

describe("StepRunner", () => {
  it("renders instantiated steps from the action result without waiting for a refresh", async () => {
    const instantiate = vi.fn(async () => ({ ok: true as const, data: instantiated }));

    render(
      <ToastProvider>
        <StepRunner
          experimentId="EXP-1"
          steps={[]}
          quantityKinds={[]}
          deviationCategories={[]}
          instantiate={instantiate}
          updateStatus={async () => ({ ok: true })}
          recordObservation={async () => ({ ok: true })}
          recordDeviation={async () => ({ ok: true })}
        />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByRole("button", { name: "Instantiate steps" }).click();
      await Promise.resolve();
    });

    expect(instantiate).toHaveBeenCalled();
    expect(screen.getByText(/Added 250 µL ACN to the dry residue\./)).toBeTruthy();
  });

  it("renders an observation from the server's row, not one assembled here", async () => {
    // use-sticky-state's rule: patch from the action's OWN returned row. This
    // panel used to append `id: local-obs-${Date.now()}`, `observed_by: null`
    // and the workstation's clock — so a skewed clock displayed one time while
    // the database held another, and two observations in the same millisecond
    // collided on the fake id.
    const recordObservation = vi.fn(async (_stepId: string, note: string) => ({
      ok: true as const,
      data: {
        id: "obs-real-1",
        experiment_step_id: "s1",
        note,
        observed_at: "2026-09-08T09:00:00Z",
        observed_by: "u1",
        workspace_id: "ws1",
      },
    }));

    render(
      <ToastProvider>
        <StepRunner
          experimentId="EXP-1"
          steps={instantiated}
          quantityKinds={[]}
          deviationCategories={[]}
          updateStatus={async () => ({ ok: true })}
          recordObservation={recordObservation}
          recordDeviation={async () => ({ ok: true })}
        />
      </ToastProvider>
    );

    const box = screen.getByPlaceholderText("Add an observation…") as HTMLInputElement;
    await act(async () => {
      box.value = "Precipitate formed";
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    box.value = "Precipitate formed";

    await act(async () => {
      screen.getByRole("button", { name: "Add" }).click();
      await Promise.resolve();
    });

    expect(recordObservation).toHaveBeenCalledWith("s1", "Precipitate formed");
    // The server's timestamp is what renders, so the row on screen is the row
    // in the database.
    expect(screen.getByText(/Precipitate formed/)).toBeTruthy();
    expect(screen.getByText(new RegExp(new Date("2026-09-08T09:00:00Z").toLocaleString(), "i"))).toBeTruthy();
  });

  it("re-seeds a step's actuals when the server's values move", async () => {
    // StepCard seeds pH/quantities/atmosphere into local state once. Keyed on
    // step.id alone it never re-seeded, so another user's edit was invisible
    // here and the next Start or Complete wrote the stale local value back
    // over it.
    const { rerender } = render(
      <ToastProvider>
        <StepRunner
          experimentId="EXP-1"
          steps={instantiated}
          quantityKinds={[]}
          deviationCategories={[]}
          updateStatus={async () => ({ ok: true })}
          recordObservation={async () => ({ ok: true })}
          recordDeviation={async () => ({ ok: true })}
        />
      </ToastProvider>
    );

    const inputs = () => Array.from(document.querySelectorAll('input[type="number"]')) as HTMLInputElement[];
    expect(inputs()[0].value).toBe("");

    // Somebody else set the pH; the server hands back a genuinely new value.
    const moved: StepDetail[] = [
      { ...instantiated[0], step: { ...instantiated[0].step, actual_ph: 8.2 } },
    ];
    rerender(
      <ToastProvider>
        <StepRunner
          experimentId="EXP-1"
          steps={moved}
          quantityKinds={[]}
          deviationCategories={[]}
          updateStatus={async () => ({ ok: true })}
          recordObservation={async () => ({ ok: true })}
          recordDeviation={async () => ({ ok: true })}
        />
      </ToastProvider>
    );

    expect(inputs()[0].value).toBe("8.2");
  });
});
