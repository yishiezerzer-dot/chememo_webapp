"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as tasksService from "@/lib/tasks/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, CommentTargetType, TaskStatus, TaskType } from "@/lib/types";

export async function createTaskAction(
  experimentId: string,
  targetType: CommentTargetType,
  targetId: string,
  input: {
    taskType: TaskType;
    title: string;
    status: TaskStatus;
    blockerNote: string | null;
    assigneeId: string | null;
    dueAt: string | null;
    checklist: string[] | null;
  }
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const title = input.title.trim();
  if (!title) return { ok: false, error: "A task needs a title." };

  try {
    await tasksService.createTask(supabase, user.id, { ...input, title, targetType, targetId });
  } catch (e) {
    return toActionResult("createTaskAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function updateTaskStatusAction(
  experimentId: string,
  taskId: string,
  status: TaskStatus,
  blockerNote: string | null
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await tasksService.updateTaskStatus(supabase, taskId, status, blockerNote);
  } catch (e) {
    return toActionResult("updateTaskStatusAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}
