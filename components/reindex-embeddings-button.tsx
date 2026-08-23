"use client";

import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import type { ActionResult } from "@/lib/types";

export function ReindexEmbeddingsButton({ action }: { action: () => Promise<ActionResult> }) {
  const { run, pending } = useRunAction();
  const { showToast } = useToast();

  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        run(action, undefined, () =>
          showToast("Re-indexing queued — the poller works through it in the background.", "success")
        )
      }
    >
      {pending && <Spinner />}
      Re-index with the current model
    </button>
  );
}
