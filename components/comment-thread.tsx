"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import type { ActionResult } from "@/lib/types";
import type { CommentView } from "@/lib/comments/service";

const fmt = (iso: string) => iso.slice(0, 16).replace("T", " ");

// T1.9 D1/D2 — the same component renders comments on an experiment, a
// step, or a file — only targetType/targetId differ per caller.
export function CommentThread({
  comments,
  createComment,
  resolveComment,
  reopenComment,
}: {
  comments: CommentView[];
  createComment: (body: string) => Promise<ActionResult>;
  resolveComment: (commentId: string) => Promise<ActionResult>;
  reopenComment: (commentId: string) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function run(action: () => Promise<ActionResult>, key: string) {
    setPendingKey(key);
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error, "error");
      else router.refresh();
    });
  }

  return (
    <div>
      {comments.map((c) => (
        <div key={c.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border, #2a2a2a22)" }}>
          <div style={{ fontSize: 12.5 }}>
            <b>{c.authorName}</b>{" "}
            <span style={{ color: "var(--ink-mute)" }}>{fmt(c.created_at)}</span>
            {c.resolved_at && <span className="chip" style={{ marginLeft: 6 }}>Resolved</span>}
          </div>
          <p style={{ margin: "4px 0", fontSize: 13.5 }}>{c.body}</p>
          {c.mentionedNames.length > 0 && (
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink-mute)" }}>
              Mentioned: {c.mentionedNames.join(", ")}
            </p>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending}
            aria-busy={pending && pendingKey === c.id}
            onClick={() => run(() => (c.resolved_at ? reopenComment(c.id) : resolveComment(c.id)), c.id)}
          >
            {pending && pendingKey === c.id && <Spinner />}
            {c.resolved_at ? "Reopen" : "Resolve"}
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <textarea ref={bodyRef} rows={2} placeholder="Add a comment… (@Full Name to mention)" style={{ flex: 1 }} />
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          aria-busy={pending && pendingKey === "post"}
          onClick={() => {
            const body = bodyRef.current?.value.trim();
            if (!body) return;
            run(async () => {
              const res = await createComment(body);
              if (res.ok && bodyRef.current) bodyRef.current.value = "";
              return res;
            }, "post");
          }}
        >
          {pending && pendingKey === "post" && <Spinner />}
          Post
        </button>
      </div>
    </div>
  );
}
