"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/toast-provider";
import type { ActionResult, ExperimentFile } from "@/lib/types";

const FILE_ICONS: Record<string, string> = {
  excel: "M4 4h16v16H4z",
  folder: "M3 7h6l2 2h10v10H3z",
  image: "M4 5h16v14H4z",
  spectra: "M3 12h4l3-8 4 16 3-8h4",
  report: "M6 3h9l4 4v14H6z",
  si: "M12 3l9 5v8l-9 5-9-5V8z",
};

type Item = ExperimentFile & { href: string | null };

function RemoveButton({ action }: { action: () => Promise<ActionResult> }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  if (!armed) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        title="Remove file"
        onClick={() => setArmed(true)}
        style={{ padding: "4px 9px" }}
      >
        ×
      </button>
    );
  }
  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={pending}
      style={{ borderColor: "var(--rose)", color: "var(--rose)", padding: "4px 9px" }}
      onClick={() =>
        start(async () => {
          const res = await action();
          if (!res.ok) showToast(res.error, "error");
          else showToast("File removed", "success");
        })
      }
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}

export function FileList({
  files,
  isOwner,
  removeAction,
  experimentId,
}: {
  files: Item[];
  isOwner: boolean;
  // The raw server action (passable to a client component); we build the
  // per-file click closure here rather than passing a plain factory from the
  // server (which RSC forbids).
  removeAction?: (fileId: string, experimentId: string) => Promise<ActionResult>;
  experimentId: string;
}) {
  if (files.length === 0) {
    return (
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>
        No files linked yet.
      </p>
    );
  }

  return (
    <div className="files-list">
      {files.map((f) => {
        const t = (f.file_type ?? "folder").toLowerCase();
        const icon = FILE_ICONS[t] ? t : "folder";
        const inner = (
          <>
            <span className={`file-ico ${icon}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                <path d={FILE_ICONS[icon]} />
              </svg>
            </span>
            <span className="fname">{f.label ?? "(unnamed)"}</span>
            <span className="ftype">{f.file_type ?? f.kind}</span>
          </>
        );
        return (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {f.href ? (
              <a
                href={f.href}
                target="_blank"
                rel="noopener noreferrer"
                className="file-item"
                style={{ flex: 1, textDecoration: "none" }}
              >
                {inner}
              </a>
            ) : (
              <div className="file-item" style={{ flex: 1, cursor: "default" }}>
                {inner}
              </div>
            )}
            {isOwner && removeAction && (
              <RemoveButton action={() => removeAction(f.id, experimentId)} />
            )}
          </div>
        );
      })}
    </div>
  );
}
