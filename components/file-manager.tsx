"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import { MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from "@/lib/files/limits";
import type { ActionResult } from "@/lib/types";

export function FileManager({
  uploadAction,
  linkAction,
}: {
  uploadAction: (formData: FormData) => Promise<ActionResult>;
  linkAction: (formData: FormData) => Promise<ActionResult>;
}) {
  const uploadFormRef = useRef<HTMLFormElement>(null);
  const linkFormRef = useRef<HTMLFormElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linking, setLinking] = useState(false);
  const { showToast } = useToast();

  return (
    <div className="panel glass" style={{ marginTop: 16 }}>
      <h4 style={{ fontFamily: "var(--display)", margin: "0 0 4px" }}>Add files</h4>
      <p className="sec-sub" style={{ margin: "0 0 14px" }}>
        Upload small images / spectra (≤ 10 MB). Link big LC-MS folders or Excel.
      </p>

      <form
        ref={uploadFormRef}
        action={async (fd) => {
          // Check the size here as well as on the server: an oversized body is
          // rejected by Next before the action runs, which surfaces as a page
          // crash rather than a message. This also spares the user uploading
          // megabytes that are certain to be refused.
          const picked = fd.get("file");
          if (picked instanceof File && picked.size > MAX_UPLOAD_BYTES) {
            showToast(TOO_LARGE_MESSAGE, "error");
            uploadFormRef.current?.reset();
            return;
          }
          setUploading(true);
          try {
            const res = await uploadAction(fd);
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            uploadFormRef.current?.reset();
            showToast("File uploaded", "success");
          } catch {
            // A rejected action (network drop, or a body Next refuses outright)
            // would otherwise escape to the error boundary and take the whole
            // experiment page down.
            showToast("Upload failed. Please try again.", "error");
          } finally {
            setUploading(false);
          }
        }}
      >
        <label className="field">
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>Upload a file</span>
          {/* accept must stay in step with ALLOWED_EXTENSIONS in
              lib/files/service.ts — it previously omitted .nmr/.mzml/.raw/.tif/
              .tiff, so the instrument formats the server does accept were
              hidden from the dialog unless you switched it to "All files". */}
          <input
            type="file"
            name="file"
            accept="image/*,.tif,.tiff,.pdf,.csv,.xlsx,.xls,.fid,.nmr,.mzml,.raw"
            required
            onChange={() => uploadFormRef.current?.requestSubmit()}
            disabled={uploading}
          />
        </label>
        {uploading && (
          <p className="muted" role="status" style={{ fontSize: 12 }}>
            Uploading…
          </p>
        )}
      </form>

      <div className="nav-sep" style={{ margin: "14px 0" }}></div>

      <form
        ref={linkFormRef}
        action={async (fd) => {
          setLinking(true);
          try {
            const res = await linkAction(fd);
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            linkFormRef.current?.reset();
            showToast("Link added", "success");
          } finally {
            setLinking(false);
          }
        }}
      >
        <div className="field">
          <span style={{ fontSize: 12, color: "var(--ink-mute)" }}>Or link an external folder / file</span>
          <input name="url" type="url" placeholder="https://onedrive… or Drive URL" required />
        </div>
        <div className="grid-2">
          <div className="field">
            <input name="label" placeholder="Label (e.g. LC-MS neg run)" />
          </div>
          <div className="field">
            <select name="file_type" defaultValue="folder">
              <option value="folder">Folder</option>
              <option value="excel">Excel</option>
              <option value="report">Report / PDF</option>
              <option value="spectra">Spectra</option>
              <option value="image">Image</option>
              <option value="si">SI</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-ghost btn-sm" disabled={linking} aria-busy={linking}>
          {linking && <Spinner />}
          + Add link
        </button>
      </form>
    </div>
  );
}
