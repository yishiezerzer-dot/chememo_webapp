import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { CommentTargetType, ExperimentTask, TaskStatus, TaskType } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type TaskView = ExperimentTask & { assigneeName: string | null; createdByName: string };

async function withNames(supabase: Supabase, tasks: ExperimentTask[]): Promise<TaskView[]> {
  if (tasks.length === 0) return [];
  const userIds = new Set<string>();
  for (const t of tasks) {
    if (t.assignee_id) userIds.add(t.assignee_id);
    userIds.add(t.created_by);
  }
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, initials").in("id", [...userIds]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.initials || "Someone"]));
  return tasks.map((t) => ({
    ...t,
    assigneeName: t.assignee_id ? nameById.get(t.assignee_id) ?? "Someone" : null,
    createdByName: nameById.get(t.created_by) ?? "Someone",
  }));
}

export async function listTasks(targetType: CommentTargetType, targetId: string): Promise<TaskView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiment_tasks")
    .select("*")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .order("created_at");
  if (error) throw error;
  return withNames(supabase, (data ?? []) as ExperimentTask[]);
}

// §20.11's "decisions needed from Moran or collaborators" surface — a
// reviewer's own 'review'-type tasks (D4), not a separate Decision entity.
export async function listMyReviewRequests(userId: string): Promise<TaskView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiment_tasks")
    .select("*")
    .eq("task_type", "review")
    .eq("assignee_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return withNames(supabase, (data ?? []) as ExperimentTask[]);
}

export type CreateTaskInput = {
  targetType: CommentTargetType;
  targetId: string;
  taskType: TaskType;
  title: string;
  status: TaskStatus;
  blockerNote: string | null;
  assigneeId: string | null;
  dueAt: string | null;
  checklist: string[] | null;
};

// T1.9 D6 — §10.3: "a task marked blocked or waiting must include the
// blocker or dependency." Checked here (app layer), same pattern T1.1
// established for acceptance-criteria-before-start.
export async function createTask(supabase: Supabase, userId: string, input: CreateTaskInput): Promise<TaskView> {
  if ((input.status === "blocked" || input.status === "waiting") && !input.blockerNote?.trim()) {
    throw new AppError("validation", "A blocked or waiting task must name the blocker or dependency.");
  }

  const { data: task, error } = await supabase
    .from("experiment_tasks")
    .insert({
      target_type: input.targetType,
      target_id: input.targetId,
      task_type: input.taskType,
      title: input.title,
      status: input.status,
      blocker_note: input.blockerNote,
      assignee_id: input.assigneeId,
      due_at: input.dueAt,
      checklist: input.checklist,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new AppError("conflict", "Could not create the task.", { cause: error });

  if (input.assigneeId && input.assigneeId !== userId) {
    await supabase.from("notifications").insert({
      user_id: input.assigneeId,
      kind: input.taskType === "review" ? "review_requested" : "task_assigned",
      task_id: task.id,
    });
  }

  const [view] = await withNames(supabase, [task as ExperimentTask]);
  if (!view) throw new AppError("conflict", "Could not create the task.");
  return view;
}

export async function updateTaskStatus(
  supabase: Supabase,
  taskId: string,
  status: TaskStatus,
  blockerNote: string | null
): Promise<void> {
  if ((status === "blocked" || status === "waiting") && !blockerNote?.trim()) {
    throw new AppError("validation", "A blocked or waiting task must name the blocker or dependency.");
  }
  const { error } = await supabase
    .from("experiment_tasks")
    .update({ status, blocker_note: blockerNote })
    .eq("id", taskId);
  if (error) throw new AppError("conflict", "Could not update the task.", { cause: error });
}
