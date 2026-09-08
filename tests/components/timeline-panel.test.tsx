// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelinePanel } from "@/components/timeline-panel";
import { ToastProvider } from "@/components/toast-provider";
import type { TimelineEvent, TimelineEventView } from "@/lib/timeline/service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  unstable_rethrow: (e: unknown) => {
    throw e;
  },
}));

const base: TimelineEvent = {
  id: "t1",
  experiment_id: "EXP-1",
  workspace_id: "ws1",
  occurred_at: "2026-09-08T09:15:00Z",
  recorded_at: "2026-09-08T09:15:00Z",
  actor_id: "u1",
  event_type: "observed",
  batch_id: null,
  sample_id: null,
  experiment_step_id: null,
  file_id: null,
  subject_label: null,
  action: null,
  observation: "Added 100 µL ACN",
  deviation_note: null,
  next_action: null,
  quality_flags: [],
  corrects_event_id: null,
  source_type: null,
  source_id: null,
  details: {},
  created_at: "2026-09-08T09:15:00Z",
};

const view = (over: Partial<TimelineEventView> = {}): TimelineEventView => ({
  ...base,
  actorName: "Ada",
  corrections: [],
  ...over,
});

describe("TimelinePanel", () => {
  it("renders a logged entry from the server's row, not one assembled here", async () => {
    const addEntry = vi.fn(async () => ({
      ok: true as const,
      data: { ...base, id: "t2", observation: "Precipitate formed", occurred_at: "2026-09-08T11:00:00Z" },
    }));

    render(
      <ToastProvider>
        <TimelinePanel experimentId="EXP-1" events={[]} addEntry={addEntry} />
      </ToastProvider>
    );

    expect(screen.getByText(/Nothing logged yet/)).toBeTruthy();

    const box = screen.getByLabelText("Log entry") as HTMLTextAreaElement;
    box.value = "Precipitate formed";

    await act(async () => {
      screen.getByRole("button", { name: "Log" }).click();
      await Promise.resolve();
    });

    expect(addEntry).toHaveBeenCalledWith("EXP-1", "Precipitate formed", "observed");
    expect(screen.getByText(/Precipitate formed/)).toBeTruthy();
    // The server's timestamp is what renders, so the row on screen is the row
    // in the database.
    expect(screen.getByText("11:00")).toBeTruthy();
  });

  it("shows a correction alongside what it corrects, never instead of it", () => {
    // §10.2 — the original claim must never be readable without the thing that
    // corrects it. This is the assertion that keeps that true in the UI.
    const corrected = view({
      corrections: [
        {
          ...base,
          id: "t2",
          observation: "Correction after checking the pipette log: actual volume was 80 µL",
          corrects_event_id: "t1",
          occurred_at: "2026-09-08T09:45:00Z",
        },
      ],
    });

    render(
      <ToastProvider>
        <TimelinePanel experimentId="EXP-1" events={[corrected]} addEntry={async () => ({ ok: true })} />
      </ToastProvider>
    );

    expect(screen.getByText(/Added 100 µL ACN/)).toBeTruthy();
    expect(screen.getByText(/actual volume was 80 µL/)).toBeTruthy();
    expect(screen.getByText("Correction")).toBeTruthy();
  });

  it("marks an entry that came from another surface", () => {
    // A scientist must always be able to tell their own words from a row
    // mirrored out of a structured write.
    render(
      <ToastProvider>
        <TimelinePanel
          experimentId="EXP-1"
          events={[view({ id: "t3", source_type: "sample_events", event_type: "transferred", action: "transfer" })]}
          addEntry={async () => ({ ok: true })}
        />
      </ToastProvider>
    );

    expect(screen.getByText(/via sample events/)).toBeTruthy();
    // Scoped to the chip: every type label also appears in the composer's
    // select, so a bare getByText would match twice.
    const chips = Array.from(document.querySelectorAll(".chip")).map((c) => c.textContent);
    expect(chips).toContain("Transferred");
  });
});
