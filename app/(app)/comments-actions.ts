"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as commentsService from "@/lib/comments/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, Comment, CommentTargetType } from "@/lib/types";
import type { CommentView } from "@/lib/comments/service";

// Comments on an experiment_step/experiment_file target still render inline
// on their parent experiment's own detail page (D1), so every action here
// revalidates that one route regardless of which target type was commented on.
export async function createCommentAction(
  experimentId: string,
  targetType: CommentTargetType,
  targetId: string,
  body: string
): Promise<ActionResult<CommentView>> {
  const { supabase, user } = await requireUser();
  try {
    const created = await commentsService.createComment(supabase, user.id, targetType, targetId, body);
    revalidatePath(`/experiments/${experimentId}`);
    return { ok: true, data: created };
  } catch (e) {
    return toActionResult("createCommentAction", e);
  }
}

// Loader-shaped (T2.5/T2.7's convention: returns the rows, not an
// ActionResult) so a step or file row can fetch its own thread on first open
// instead of every thread being read on page load. The read itself is
// RLS-enforced inside listComments' own server client.
export async function listCommentsAction(
  targetType: CommentTargetType,
  targetId: string
): Promise<CommentView[]> {
  await requireUser();
  return commentsService.listComments(targetType, targetId);
}

export async function resolveCommentAction(
  experimentId: string,
  commentId: string
): Promise<ActionResult<Comment>> {
  const { supabase, user } = await requireUser();
  let updated: Comment;
  try {
    updated = await commentsService.resolveComment(supabase, commentId, user.id);
  } catch (e) {
    return toActionResult("resolveCommentAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true, data: updated };
}

export async function reopenCommentAction(
  experimentId: string,
  commentId: string
): Promise<ActionResult<Comment>> {
  const { supabase } = await requireUser();
  let updated: Comment;
  try {
    updated = await commentsService.reopenComment(supabase, commentId);
  } catch (e) {
    return toActionResult("reopenCommentAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true, data: updated };
}
