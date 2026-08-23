"use client";

import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type { ActionResult } from "@/lib/types";

// Follows the established per-button pending convention (2026-08-17): the
// shared hook's pendingKey means only the button actually pressed shows a
// spinner rather than every button on the page.
export function RequeueFailedButton({
  table,
  label,
  action,
}: {
  table: "evidence_chunks" | "index_jobs" | "file_jobs";
  label: string;
  action: (table: "evidence_chunks" | "index_jobs" | "file_jobs") => Promise<ActionResult>;
}) {
  const { run, pending, pendingKey } = useRunAction();
  const { showToast } = useToast();

  const busy = pending && pendingKey === table;

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={pending}
      aria-busy={busy}
      onClick={() =>
        run(() => action(table), table, () =>
          showToast("Requeued — the poller will pick these up within 30 seconds.", "success")
        )
      }
    >
      {busy && <Spinner />}
      {label}
    </button>
  );
}
