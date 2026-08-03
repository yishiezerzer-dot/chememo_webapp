"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import type { ActionResult } from "@/lib/types";
import type { TimelineEntry } from "@/lib/experiments/timeline";
import type { DiffField } from "@/lib/diff";

const fmt = (iso: string) => iso.slice(0, 16).replace("T", " ");

const LOCK_EVENT_LABEL: Record<"lock" | "reopen" | "restore", string> = {
  lock: "Locked",
  reopen: "Reopened",
  restore: "Restored a prior version",
};

function fieldValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function DiffLine({ field }: { field: DiffField }) {
  if (field.kind === "array") {
    return (
      <div style={{ fontSize: 12.5 }}>
        <b>{field.label}</b>:{" "}
        {field.added && field.added.length > 0 && <span style={{ color: "var(--teal)" }}>+{field.added.join(", ")}</span>}
        {field.added && field.added.length > 0 && field.removed && field.removed.length > 0 && "  "}
        {field.removed && field.removed.length > 0 && <span style={{ color: "var(--ink-mute)" }}>−{field.removed.join(", ")}</span>}
      </div>
    );
  }
  if (field.kind === "json") {
    return (
      <div style={{ fontSize: 12.5 }}>
        <b>{field.label}</b>: changed
      </div>
    );
  }
  return (
    <div style={{ fontSize: 12.5 }}>
      <b>{field.label}</b>: {fieldValue(field.before)} → {fieldValue(field.after)}
    </div>
  );
}

function RestoreControl({
  revisionId,
  restoreRevision,
}: {
  revisionId: string;
  restoreRevision: (revisionId: string, reason: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        Restore this version
      </button>
    );
  }

  return (
    <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        placeholder="Why are you restoring this version? (always required)"
      />
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending || !reason.trim()}
          onClick={() =>
            start(async () => {
              const res = await restoreRevision(revisionId, reason);
              if (!res.ok) showToast(res.error, "error");
              else router.refresh();
            })
          }
        >
          {pending ? "Restoring…" : "Confirm restore"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// T1.8 D5 — one merged, chronological timeline (revisions + lock/reopen/
// restore events + file adds) replacing the two separate boxes this used to
// be. Each revision shows its actual field-level diff (D2/D3) and editor
// identity (D4) instead of just a list of changed field names.
export function HistoryPanel({
  entries,
  isOwner,
  restoreRevision,
}: {
  entries: TimelineEntry[];
  isOwner: boolean;
  restoreRevision: (revisionId: string, reason: string) => Promise<ActionResult>;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="panel glass" style={{ marginTop: 16 }}>
      <h4 style={{ fontFamily: "var(--display)", margin: "0 0 12px" }}>
        History · {entries.length} event{entries.length === 1 ? "" : "s"}
      </h4>
      <div className="activity">
        {entries.map((entry) => (
          <div key={`${entry.kind}-${entry.id}`} className="act-row" style={{ flexWrap: "wrap" }}>
            <span className="act-dot"></span>
            <div style={{ flex: 1, minWidth: 200 }}>
              {entry.kind === "revision" && (
                <>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>
                    <b>{entry.actorName}</b> edited this record
                  </div>
                  {entry.diff.map((f) => (
                    <DiffLine key={f.key} field={f} />
                  ))}
                  {isOwner && (
                    <div style={{ marginTop: 6 }}>
                      <RestoreControl revisionId={entry.id} restoreRevision={restoreRevision} />
                    </div>
                  )}
                </>
              )}
              {entry.kind === "lock_event" && (
                <div style={{ fontSize: 13 }}>
                  <b>{entry.actorName}</b> — {LOCK_EVENT_LABEL[entry.event]}: {entry.reason}
                </div>
              )}
              {entry.kind === "file" && (
                <div style={{ fontSize: 13 }}>
                  <b>{entry.actorName}</b> added {entry.fileKind === "upload" ? "a file" : "a link"}: {entry.label}
                </div>
              )}
            </div>
            <time
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: "var(--ink-mute)",
                whiteSpace: "nowrap",
                flex: "none",
              }}
            >
              {fmt(entry.created_at)}
            </time>
          </div>
        ))}
      </div>
    </div>
  );
}
