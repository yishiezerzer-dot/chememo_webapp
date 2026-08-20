"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as commentsService from "@/lib/comments/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, CommentTargetType } from "@/lib/types";

// Comments on an experiment_step/experiment_file target still render inline
// on their parent experiment's own detail page (D1), so every action here
// revalidates that one route regardless of which target type was commented on.
export async function createCommentAction(
  experimentId: string,
  targetType: CommentTargetType,
  targetId: string,
  body: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  try {
    await commentsService.createComment(supabase, user.id, targetType, targetId, body);
  } catch (e) {
    return toActionResult("createCommentAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  // TEMPORARY CI diagnostic -- remove once the refresh failure is pinned down.
  console.log(JSON.stringify({ diag: "comment-created", experimentId, at: new Date().toISOString() }));
  return { ok: true };
}

export async function resolveCommentAction(experimentId: string, commentId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  try {
    await commentsService.resolveComment(supabase, commentId, user.id);
  } catch (e) {
    return toActionResult("resolveCommentAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function reopenCommentAction(experimentId: string, commentId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await commentsService.reopenComment(supabase, commentId);
  } catch (e) {
    return toActionResult("reopenCommentAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
