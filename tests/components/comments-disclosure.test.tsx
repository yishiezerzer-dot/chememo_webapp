// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentsDisclosure } from "@/components/comments-disclosure";
import { ToastProvider } from "@/components/toast-provider";
import type { CommentView } from "@/lib/comments/service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  unstable_rethrow: (e: unknown) => {
    throw e;
  },
}));

const listCommentsAction = vi.fn();
vi.mock("@/app/(app)/comments-actions", () => ({
  listCommentsAction: (...args: unknown[]) => listCommentsAction(...args),
  createCommentAction: vi.fn(async () => ({ ok: true })),
  resolveCommentAction: vi.fn(async () => ({ ok: true })),
  reopenCommentAction: vi.fn(async () => ({ ok: true })),
}));

const stepComment: CommentView = {
  id: "c1",
  target_type: "experiment_step",
  target_id: "step-1",
  body: "pH drifted on this step",
  created_by: "u1",
  created_at: "2026-09-07T00:00:00Z",
  resolved_at: null,
  resolved_by: null,
  workspace_id: null,
  authorName: "Ada",
  mentionedNames: [],
};

describe("CommentsDisclosure", () => {
  it("fetches its own thread only once opened", async () => {
    listCommentsAction.mockResolvedValue([stepComment]);

    render(
      <ToastProvider>
        <CommentsDisclosure experimentId="EXP-1" targetType="experiment_step" targetId="step-1" />
      </ToastProvider>
    );

    // Collapsed: nothing is read on render, which is the whole point of the
    // disclosure on a page that can carry dozens of steps and files.
    expect(listCommentsAction).not.toHaveBeenCalled();
    expect(screen.queryByText("pH drifted on this step")).toBeNull();

    await act(async () => {
      screen.getByRole("button", { name: "Comments" }).click();
      await Promise.resolve();
    });

    expect(listCommentsAction).toHaveBeenCalledWith("experiment_step", "step-1");
    expect(screen.getByText("pH drifted on this step")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hide comments" })).toBeTruthy();
  });
});
