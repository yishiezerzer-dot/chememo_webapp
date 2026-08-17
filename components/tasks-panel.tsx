"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import { TASK_STATUSES } from "@/lib/types";
import type { ActionResult, TaskStatus, TaskType } from "@/lib/types";
import type { TaskView } from "@/lib/tasks/service";

const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: "Not started", ready: "Ready", in_progress: "In progress", blocked: "Blocked",
  waiting: "Waiting", completed: "Completed", failed: "Failed", cancelled: "Cancelled",
};

// T1.9 D4 — a "Request review" task is just task_type: "review" with a
// checklist; same form, same list, same component as an ordinary task.
export function TasksPanel({
  tasks,
  createTask,
  updateStatus,
}: {
  tasks: TaskView[];
  createTask: (input: {
    taskType: TaskType; title: string; status: TaskStatus; blockerNote: string | null;
    assigneeId: string | null; dueAt: string | null; checklist: string[] | null;
  }) => Promise<ActionResult>;
  updateStatus: (taskId: string, status: TaskStatus, blockerNote: string | null) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const titleRef = useRef<HTMLInputElement>(null);
  const [taskType, setTaskType] = useState<TaskType>("task");

  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error, "error");
      else router.refresh();
    });
  }

  function changeStatus(task: TaskView, status: TaskStatus) {
    let blockerNote = task.blocker_note;
    if (status === "blocked" || status === "waiting") {
      blockerNote = window.prompt("What is this task blocked on / waiting for? (required)", task.blocker_note ?? "");
      if (!blockerNote?.trim()) return;
    }
    run(() => updateStatus(task.id, status, blockerNote));
  }

  return (
    <div className="obs-box glass">
      <h4>Tasks</h4>
      {tasks.length === 0 ? (
        <p className="muted" style={{ margin: "0 0 12px" }}>
          No tasks yet.
        </p>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {tasks.map((t) => (
            <div key={t.id} className="act-row">
              <span className="act-dot"></span>
              <span style={{ fontSize: 13 }}>
                {t.task_type === "review" && <span className="chip" style={{ marginRight: 6 }}>Review</span>}
                <b>{t.title}</b>
                {t.assigneeName && <> — {t.assigneeName}</>}
                {t.status === "blocked" || t.status === "waiting" ? <> ({t.blocker_note})</> : null}
              </span>
              <select
                value={t.status}
                disabled={pending}
                onChange={(e) => changeStatus(t, e.target.value as TaskStatus)}
                style={{ marginLeft: "auto" }}
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input ref={titleRef} placeholder={taskType === "review" ? "What needs review?" : "New task…"} style={{ flex: 1, minWidth: 160 }} />
        <select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)}>
          <option value="task">Task</option>
          <option value="review">Request review</option>
        </select>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          aria-busy={pending}
          onClick={() => {
            const title = titleRef.current?.value.trim();
            if (!title) return;
            run(async () => {
              const res = await createTask({
                taskType, title, status: "not_started", blockerNote: null,
                assigneeId: null, dueAt: null, checklist: null,
              });
              if (res.ok && titleRef.current) titleRef.current.value = "";
              return res;
            });
          }}
        >
          {pending && <Spinner />}
          + Add
        </button>
      </div>
    </div>
  );
}
