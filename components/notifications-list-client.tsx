"use client";

import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type { ActionResult } from "@/lib/types";

type NotificationItem = {
  id: string;
  kind: string;
  label: string;
  excerpt: string;
  readAt: string | null;
  createdAt: string;
  experimentId: string | null;
};

const fmt = (iso: string) => iso.slice(0, 16).replace("T", " ");

export function NotificationsListClient({
  items,
  markRead,
}: {
  items: NotificationItem[];
  markRead: (id: string) => Promise<ActionResult>;
}) {
  const { run, pending, pendingKey } = useRunAction();

  if (items.length === 0) {
    return (
      <p className="muted" style={{ marginTop: 16 }}>
        No notifications.
      </p>
    );
  }

  return (
    <div className="activity" style={{ marginTop: 16 }}>
      {items.map((item) => (
        <div key={item.id} className="act-row" style={{ opacity: item.readAt ? 0.6 : 1 }}>
          <span className="act-dot"></span>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13 }}>
              Someone {item.label}
              {item.experimentId && (
                <>
                  {" "}on <a href={`/experiments/${item.experimentId}`}>{item.experimentId}</a>
                </>
              )}
              {item.excerpt && <>: “{item.excerpt.slice(0, 80)}”</>}
            </span>
          </div>
          {!item.readAt && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={pending}
              aria-busy={pending && pendingKey === item.id}
              onClick={() => run(() => markRead(item.id), item.id)}
            >
              {pending && pendingKey === item.id && <Spinner />}
              Mark read
            </button>
          )}
          <time
            style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-mute)", whiteSpace: "nowrap", flex: "none" }}
          >
            {fmt(item.createdAt)}
          </time>
        </div>
      ))}
    </div>
  );
}
