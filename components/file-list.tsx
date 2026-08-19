"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import { FILE_ROLES } from "@/lib/types";
import { MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from "@/lib/files/limits";
import type { ActionResult, ExperimentFile, FileRole, FileVersion } from "@/lib/types";
import {
  replaceFileAction,
  listVersionsAction,
  updateFileMetadataAction,
  linkFileToRunAction,
  unlinkFileFromRunAction,
  listRunsForFileLinkAction,
  listUnlinkedFilesAction,
} from "@/app/(app)/experiments/[id]/file-actions";

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
      aria-busy={pending}
      style={{ borderColor: "var(--rose)", color: "var(--rose)", padding: "4px 9px" }}
      onClick={() =>
        start(async () => {
          const res = await action();
          if (!res.ok) showToast(res.error, "error");
          else showToast("File removed", "success");
        })
      }
    >
      {pending && <Spinner />}
      Remove
    </button>
  );
}

// T2.7 — self-contained (like T2.5/T2.6's *Section components): fetches/
// mutates its own data via the file actions directly. Version history,
// replace-with-new-version, classification/metadata, and link-to-run all
// live behind one "Details" toggle per uploaded file to keep the base list
// unchanged for link-only rows and for viewers who never expand it.
function FileDetailsSection({ file, isOwner, experimentId }: { file: Item; isOwner: boolean; experimentId: string }) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<FileVersion[] | null>(null);
  const [runOptions, setRunOptions] = useState<{ id: string; label: string }[] | null>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [fileRole, setFileRole] = useState<FileRole | "">(file.file_role ?? "");
  const [sourceInstrument, setSourceInstrument] = useState(file.source_instrument ?? "");
  const [acquisitionTimestamp, setAcquisitionTimestamp] = useState(
    file.acquisition_timestamp ? file.acquisition_timestamp.slice(0, 16) : ""
  );
  const [retentionState, setRetentionState] = useState(file.retention_state);
  const [metadataEntries, setMetadataEntries] = useState<[string, string][]>(
    Object.entries(file.parsed_metadata as Record<string, string>)
  );
  const [metaKey, setMetaKey] = useState("");
  const [metaValue, setMetaValue] = useState("");
  const [runId, setRunId] = useState("");

  async function load() {
    if (!open) {
      const [v, r] = await Promise.all([listVersionsAction(file.id), listRunsForFileLinkAction(experimentId)]);
      setVersions(v);
      setRunOptions(r);
    }
    setOpen((o) => !o);
  }

  const [pendingKey, setPendingKey] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>, key: string, after?: () => void) {
    setPendingKey(key);
    start(async () => {
      try {
        const res = await action();
        if (!res.ok) showToast(res.error ?? "Something went wrong.", "error");
        else {
          router.refresh();
          setVersions(await listVersionsAction(file.id));
          after?.();
        }
      } catch {
        // Without this, a rejected action (e.g. a body Next refuses outright)
        // escapes to the error boundary and takes the experiment page down.
        showToast("Something went wrong. Please try again.", "error");
      }
    });
  }

  return (
    <div style={{ marginLeft: 32, marginBottom: 4 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
        {open ? "Hide details" : "Details"}
      </button>
      {open && (
        <div style={{ marginTop: 6, paddingLeft: 8, borderLeft: "2px solid var(--border)" }}>
          {!file.analysis_run_id && (
            <span className="chip" style={{ marginBottom: 6, display: "inline-block" }}>
              Unlinked
            </span>
          )}

          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            {(versions ?? []).map((v) => (
              <div key={v.id}>
                v{v.version_number} — {v.byte_size ? `${Math.round(v.byte_size / 1024)} KB` : "?"} — {v.sha256?.slice(0, 12)}… —{" "}
                <span className="chip">{v.processing_state}</span>
              </div>
            ))}
          </div>

          {isOwner && (
            <>
              <form
                action={(fd) => {
                  // Same reason as the upload form: an oversized body never
                  // reaches the action, so check before sending it.
                  const picked = fd.get("file");
                  if (picked instanceof File && picked.size > MAX_UPLOAD_BYTES) {
                    showToast(TOO_LARGE_MESSAGE, "error");
                    if (replaceInputRef.current) replaceInputRef.current.value = "";
                    return;
                  }
                  run(() => replaceFileAction(experimentId, file.id, fd), "replace", () => {
                    if (replaceInputRef.current) replaceInputRef.current.value = "";
                  });
                }}
                style={{ marginBottom: 8 }}
              >
                <input ref={replaceInputRef} type="file" name="file" required disabled={pending} />
                <button type="submit" className="btn btn-ghost btn-sm" disabled={pending} aria-busy={pending && pendingKey === "replace"}>
                  {pending && pendingKey === "replace" && <Spinner />}
                  Replace with new version
                </button>
              </form>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <select value={fileRole} onChange={(e) => setFileRole(e.target.value as FileRole)}>
                  <option value="">Role: unset</option>
                  {FILE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <input placeholder="Source instrument" value={sourceInstrument} onChange={(e) => setSourceInstrument(e.target.value)} />
                <input type="datetime-local" value={acquisitionTimestamp} onChange={(e) => setAcquisitionTimestamp(e.target.value)} />
                <select value={retentionState} onChange={(e) => setRetentionState(e.target.value as typeof retentionState)}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </div>

              {/* §16.5 legacy-filename token decoding (D3) — an open-ended
                  key/value map, same convention as T2.6's environmental
                  custom_fields, since the audit anticipates fields not yet named. */}
              <div style={{ marginBottom: 8 }}>
                {metadataEntries.map(([k, v], i) => (
                  <span key={k} className="chip" style={{ marginRight: 6, marginBottom: 6, display: "inline-block" }}>
                    {k}: {v}
                    <b
                      onClick={() => setMetadataEntries((cur) => cur.filter((_, idx) => idx !== i))}
                      style={{ marginLeft: 6, cursor: "pointer" }}
                    >
                      ×
                    </b>
                  </span>
                ))}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                  <input placeholder="Metadata key (e.g. instrument_code)" value={metaKey} onChange={(e) => setMetaKey(e.target.value)} />
                  <input placeholder="Value" value={metaValue} onChange={(e) => setMetaValue(e.target.value)} />
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!metaKey.trim()}
                    onClick={() => {
                      setMetadataEntries((cur) => [...cur.filter(([k]) => k !== metaKey.trim()), [metaKey.trim(), metaValue]]);
                      setMetaKey("");
                      setMetaValue("");
                    }}
                  >
                    + Add field
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={pending}
                aria-busy={pending && pendingKey === "save-metadata"}
                style={{ marginBottom: 8 }}
                onClick={() =>
                  run(() =>
                    updateFileMetadataAction(
                      experimentId,
                      file.id,
                      fileRole || null,
                      sourceInstrument,
                      acquisitionTimestamp ? new Date(acquisitionTimestamp).toISOString() : "",
                      Object.fromEntries(metadataEntries),
                      retentionState
                    ), "save-metadata"
                  )
                }
              >
                {pending && pendingKey === "save-metadata" && <Spinner />}
                Save metadata
              </button>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={runId} onChange={(e) => setRunId(e.target.value)}>
                  <option value="">Link to analysis run…</option>
                  {(runOptions ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={pending || !runId}
                  aria-busy={pending && pendingKey === "link-run"}
                  onClick={() => run(() => linkFileToRunAction(experimentId, file.id, runId), "link-run")}
                >
                  {pending && pendingKey === "link-run" && <Spinner />}
                  Link
                </button>
                {file.analysis_run_id && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={pending}
                    aria-busy={pending && pendingKey === "unlink-run"}
                    onClick={() => run(() => unlinkFileFromRunAction(experimentId, file.id), "unlink-run")}
                  >
                    {pending && pendingKey === "unlink-run" && <Spinner />}
                    Unlink
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
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
          <div key={f.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
            {f.kind === "upload" && <FileDetailsSection file={f} isOwner={isOwner} experimentId={experimentId} />}
          </div>
        );
      })}
    </div>
  );
}

// T2.7 D6 — "unlinked file inbox": the acceptance criterion asks for a real
// list, not just the per-file "Unlinked" chip inside FileDetailsSection.
// Self-contained, same convention as FileDetailsSection above.
export function UnlinkedFilesInbox({ experimentId }: { experimentId: string }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<ExperimentFile[] | null>(null);

  async function load() {
    if (!open) setFiles(await listUnlinkedFilesAction(experimentId));
    setOpen((o) => !o);
  }

  return (
    <div className="obs-box glass" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h4 style={{ margin: 0, fontSize: 14 }}>Unlinked files</h4>
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={load}>
          {open ? "Hide" : "Show"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          {(files ?? []).length === 0 ? (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              Every uploaded file is linked to an analysis run.
            </p>
          ) : (
            (files ?? []).map((f) => (
              <div key={f.id} className="act-row">
                <span className="act-dot"></span>
                <span style={{ fontSize: 13 }}>{f.label ?? "(unnamed)"}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
