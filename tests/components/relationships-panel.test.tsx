// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RelationshipsPanel } from "@/components/relationships-panel";
import { ToastProvider } from "@/components/toast-provider";
import type { RelationshipView } from "@/lib/relationships/service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  unstable_rethrow: (e: unknown) => {
    throw e;
  },
}));

function replicateOf(targetId: string): RelationshipView {
  return {
    relationship: {
      id: "rel-1",
      source_experiment_id: "EXP-2",
      target_experiment_id: targetId,
      relationship_type: "replicate_of",
      created_by: "u1",
      created_at: "2026-08-28T00:00:00Z",
      workspace_id: null,
    },
    direction: "outgoing",
    label: "replicate of",
    otherExperiment: { id: targetId, name: "Alpha", status: "draft" },
  };
}

describe("RelationshipsPanel", () => {
  it("renders a created relationship from the action result without waiting for a refresh", async () => {
    const created = replicateOf("EXP-1");
    const createRelationship = vi.fn(async () => ({ ok: true as const, data: created }));

    render(
      <ToastProvider>
        <RelationshipsPanel
          experimentId="EXP-2"
          relationships={[]}
          allSeries={[]}
          memberSeries={[]}
          createRelationship={createRelationship}
          deleteRelationship={async () => ({ ok: true })}
          addToSeries={async () => ({ ok: true })}
          removeFromSeries={async () => ({ ok: true })}
        />
      </ToastProvider>
    );

    const box = screen.getByPlaceholderText(/Other experiment ID/);
    (box as HTMLInputElement).value = "EXP-1";

    await act(async () => {
      screen.getByRole("button", { name: "+ Add relationship" }).click();
      await Promise.resolve();
    });

    expect(createRelationship).toHaveBeenCalledWith("EXP-1", "replicate_of");
    expect(screen.getByRole("link", { name: "EXP-1 — Alpha" })).toBeTruthy();
  });
});
