"use client";

import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { CommentThread } from "@/components/comment-thread";
import { useRunAction } from "@/lib/use-run-action";
import {
  listCommentsAction,
  createCommentAction,
  resolveCommentAction,
  reopenCommentAction,
} from "@/app/(app)/comments-actions";
import type { CommentTargetType } from "@/lib/types";
import type { CommentView } from "@/lib/comments/service";

// T1.9 shipped CommentThread wired only at the 'experiment' target level; the
// schema and service supported 'experiment_step'/'experiment_file' from the
// start (D1) but the two UI integrations were cut under context pressure.
// This closes that cut.
//
// Self-contained, like T2.7's FileDetailsSection: it imports the comment
// actions directly rather than having four props threaded down through
// StepRunner and FileList, and it fetches its own thread on first open. That
// matters here more than in the panels above — an experiment can have dozens
// of steps and files, and reading every thread on page load would put dozens
// of queries on the critical path of a page T1.9 already had to rescue once
// from exactly that shape of regression (listComments/listTasks blocking
// every router.refresh()).
export function CommentsDisclosure({
  experimentId,
  targetType,
  targetId,
}: {
  experimentId: string;
  targetType: CommentTargetType;
  targetId: string;
}) {
  const { load, pending, pendingKey } = useRunAction();
  const [comments, setComments] = useState<CommentView[] | null>(null);
  const [open, setOpen] = useState(false);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    // Re-fetch on every open rather than only the first: a thread someone
    // else resolved while this row sat collapsed should not come back stale.
    load(
      () => listCommentsAction(targetType, targetId),
      (rows) => {
        setComments(rows);
        setOpen(true);
      },
      `comments-${targetId}`
    );
  }

  return (
    <div style={{ marginTop: 8 }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        aria-busy={pending && pendingKey === `comments-${targetId}`}
        aria-expanded={open}
        onClick={toggle}
      >
        {pending && pendingKey === `comments-${targetId}` && <Spinner />}
        {open ? "Hide comments" : "Comments"}
      </button>

      {open && comments && (
        <div style={{ marginTop: 8 }}>
          <CommentThread
            comments={comments}
            createComment={(body) => createCommentAction(experimentId, targetType, targetId, body)}
            resolveComment={(commentId) => resolveCommentAction(experimentId, commentId)}
            reopenComment={(commentId) => reopenCommentAction(experimentId, commentId)}
          />
        </div>
      )}
    </div>
  );
}
