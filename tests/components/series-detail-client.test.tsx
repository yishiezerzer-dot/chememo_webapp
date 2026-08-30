// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SeriesDetailClient } from "@/components/series-detail-client";
import { ToastProvider } from "@/components/toast-provider";
import type { Experiment } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  unstable_rethrow: (e: unknown) => {
    throw e;
  },
}));

function experiment(id: string): Experiment {
  return {
    id,
    name: `${id} name`,
    status: "draft",
    date: null,
    quantities: {},
    sample_matrix: [],
    ph: null,
    cycles: null,
    compounds: [],
    created_at: "2026-08-28T00:00:00Z",
  } as unknown as Experiment;
}

describe("SeriesDetailClient", () => {
  it("renders an added member from the action result without waiting for a refresh", async () => {
    const added = experiment("EXP-1");
    const addMember = vi.fn(async () => ({ ok: true as const, data: added }));

    render(
      <ToastProvider>
        <SeriesDetailClient
          members={[]}
          controlsCounts={{}}
          addMember={addMember}
          removeMember={async () => ({ ok: true })}
        />
      </ToastProvider>
    );

    const box = screen.getByPlaceholderText(/Experiment ID/);
    (box as HTMLInputElement).value = "EXP-1";

    await act(async () => {
      screen.getByRole("button", { name: "Add experiment" }).click();
      await Promise.resolve();
    });

    expect(addMember).toHaveBeenCalledWith("EXP-1");
    expect(screen.getByText("EXP-1")).toBeTruthy();
    expect(screen.getByText("EXP-1 name")).toBeTruthy();
  });
});
