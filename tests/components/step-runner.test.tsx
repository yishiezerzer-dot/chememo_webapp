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
});
