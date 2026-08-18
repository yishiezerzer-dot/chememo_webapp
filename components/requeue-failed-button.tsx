"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import type { ActionResult } from "@/lib/types";

// Follows the established per-button pending convention (2026-08-17): one
// useTransition, plus a pendingKey so only the button actually pressed shows
// a spinner rather than every button on the page.
export function RequeueFailedButton({
  table,
  label,
  action,
}: {
  table: "evidence_chunks" | "index_jobs" | "file_jobs";
  label: string;
  action: (table: "evidence_chunks" | "index_jobs" | "file_jobs") => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  const busy = pending && pendingKey === table;

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      aria-busy={busy}
      onClick={() => {
        setPendingKey(table);
        start(async () => {
          const res = await action(table);
          if (!res.ok) showToast(res.error, "error");
          else {
            showToast("Requeued — the poller will pick these up within 30 seconds.", "success");
            router.refresh();
          }
        });
      }}
    >
      {busy && <Spinner />}
      {label}
    </button>
  );
}
