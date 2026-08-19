"use client";

import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
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
  const { run, pending } = useRunAction();
  // Controlled, not a ref. As an uncontrolled input read through
  // titleRef.current at click time, "+ Add" could do nothing at all — no
  // request, no toast, no task — whenever that ref was not attached to the
  // input actually on screen, because the guard below returns silently on an
  // empty title. Reproduced on dev 2026-08-19: the visible input held text,
  // the button was enabled, and clicking it issued zero network calls.
  // Holding the value in state removes the failure mode, and the button now
  // disables itself when there is nothing to add rather than looking live and
  // doing nothing.
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("task");

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
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={taskType === "review" ? "What needs review?" : "New task…"}
          style={{ flex: 1, minWidth: 160 }}
        />
        <select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)}>
          <option value="task">Task</option>
          <option value="review">Request review</option>
        </select>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending || !title.trim()}
          aria-busy={pending}
          onClick={() => {
            const trimmed = title.trim();
            if (!trimmed) return;
            run(async () => {
              const res = await createTask({
                taskType, title: trimmed, status: "not_started", blockerNote: null,
                assigneeId: null, dueAt: null, checklist: null,
              });
              if (res.ok) setTitle("");
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
