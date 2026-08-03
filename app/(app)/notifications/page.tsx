import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authorization/policies";
import { listNotifications } from "@/lib/notifications/service";
import { markNotificationReadAction, markAllNotificationsReadAction } from "../notifications-actions";
import { NotificationsListClient } from "@/components/notifications-list-client";

const NOTIFICATION_LABEL: Record<string, string> = {
  mention: "mentioned you in a comment",
  task_assigned: "assigned you a task",
  review_requested: "requested your review",
};

// T1.9 D3 — resolves each notification's comment/task back to the parent
// experiment it's rendered on (comments/tasks on a step or file target still
// live on that step/file's own experiment's detail page, D1).
async function resolveExperimentId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  targetType: string,
  targetId: string
): Promise<string | null> {
  if (targetType === "experiment") return targetId;
  if (targetType === "experiment_step") {
    const { data } = await supabase.from("experiment_steps").select("experiment_id").eq("id", targetId).maybeSingle();
    return data?.experiment_id ?? null;
  }
  if (targetType === "experiment_file") {
    const { data } = await supabase.from("experiment_files").select("experiment_id").eq("id", targetId).maybeSingle();
    return data?.experiment_id ?? null;
  }
  return null;
}

export default async function NotificationsPage() {
  const { user } = await requireUser();
  const supabase = await createClient();
  const notifications = await listNotifications(user.id);

  const commentIds = notifications.map((n) => n.comment_id).filter((id): id is string => !!id);
  const taskIds = notifications.map((n) => n.task_id).filter((id): id is string => !!id);
  const [{ data: comments }, { data: tasks }] = await Promise.all([
    commentIds.length ? supabase.from("comments").select("id, target_type, target_id, body").in("id", commentIds) : Promise.resolve({ data: [] as { id: string; target_type: string; target_id: string; body: string }[] }),
    taskIds.length ? supabase.from("experiment_tasks").select("id, target_type, target_id, title").in("id", taskIds) : Promise.resolve({ data: [] as { id: string; target_type: string; target_id: string; title: string }[] }),
  ]);
  const commentById = new Map((comments ?? []).map((c) => [c.id, c]));
  const taskById = new Map((tasks ?? []).map((t) => [t.id, t]));

  const items = await Promise.all(
    notifications.map(async (n) => {
      const comment = n.comment_id ? commentById.get(n.comment_id) : undefined;
      const task = n.task_id ? taskById.get(n.task_id) : undefined;
      const targetType = comment?.target_type ?? task?.target_type ?? "experiment";
      const targetId = comment?.target_id ?? task?.target_id ?? null;
      const experimentId = targetId ? await resolveExperimentId(supabase, targetType, targetId) : null;
      return {
        id: n.id,
        kind: n.kind,
        label: NOTIFICATION_LABEL[n.kind] ?? n.kind,
        excerpt: comment?.body ?? task?.title ?? "",
        readAt: n.read_at,
        createdAt: n.created_at,
        experimentId,
      };
    })
  );

  return (
    <div>
      <div className="detail-head">
        <div>
          <span className="eyebrow">Notifications</span>
          <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 0" }}>
            Notifications
          </h2>
        </div>
        <form action={markAllNotificationsReadAction}>
          <button type="submit" className="btn btn-ghost btn-sm">
            Mark all read
          </button>
        </form>
      </div>
      <NotificationsListClient items={items} markRead={markNotificationReadAction} />
    </div>
  );
}
