// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentThread } from "@/components/comment-thread";
import { ToastProvider } from "@/components/toast-provider";
import type { CommentView } from "@/lib/comments/service";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  unstable_rethrow: (e: unknown) => {
    throw e;
  },
}));

function postedComment(body: string): CommentView {
  return {
    id: "c1",
    target_type: "experiment",
    target_id: "EXP-1",
    body,
    created_by: "u1",
    created_at: "2026-08-28T00:00:00Z",
    resolved_at: null,
    resolved_by: null,
    workspace_id: null,
    authorName: "Ada",
    mentionedNames: [],
  };
}

describe("CommentThread", () => {
  it("renders a posted comment from the action result without waiting for a refresh", async () => {
    const createComment = vi.fn(async (body: string) => ({ ok: true as const, data: postedComment(body) }));

    render(
      <ToastProvider>
        <CommentThread
          comments={[]}
          createComment={createComment}
          resolveComment={async () => ({ ok: true })}
          reopenComment={async () => ({ ok: true })}
        />
      </ToastProvider>
    );

    const box = screen.getByPlaceholderText(/Add a comment/);
    await act(async () => {
      box.focus();
      (box as HTMLTextAreaElement).value = "First comment";
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // Uncontrolled textarea: fill via the DOM, then click Post which reads the ref.
    (box as HTMLTextAreaElement).value = "First comment";

    await act(async () => {
      screen.getByRole("button", { name: "Post" }).click();
      await Promise.resolve();
    });

    expect(createComment).toHaveBeenCalledWith("First comment");
    expect(screen.getByText("First comment")).toBeTruthy();
    expect(screen.getByText("Ada")).toBeTruthy();
  });

  it("marks a comment resolved from the action result without waiting for a refresh", async () => {
    const existing = postedComment("Needs a second pair of eyes");
    const resolveComment = vi.fn(async () => ({
      ok: true as const,
      data: { ...existing, resolved_at: "2026-08-29T00:00:00Z", resolved_by: "u1" },
    }));

    render(
      <ToastProvider>
        <CommentThread
          comments={[existing]}
          createComment={async () => ({ ok: true })}
          resolveComment={resolveComment}
          reopenComment={async () => ({ ok: true })}
        />
      </ToastProvider>
    );

    await act(async () => {
      screen.getByRole("button", { name: "Resolve" }).click();
      await Promise.resolve();
    });

    expect(resolveComment).toHaveBeenCalledWith("c1");
    expect(screen.getByText("Resolved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reopen" })).toBeTruthy();
  });
});
