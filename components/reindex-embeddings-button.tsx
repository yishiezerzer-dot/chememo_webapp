"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";
import type { ActionResult } from "@/lib/types";

export function ReindexEmbeddingsButton({ action }: { action: () => Promise<ActionResult> }) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  return (
    <button
      type="button"
      className="btn btn-sm"
      disabled={pending}
      aria-busy={pending}
      onClick={() =>
        start(async () => {
          const res = await action();
          if (!res.ok) showToast(res.error, "error");
          else {
            showToast("Re-indexing queued — the poller works through it in the background.", "success");
            router.refresh();
          }
        })
      }
    >
      {pending && <Spinner />}
      Re-index with the current model
    </button>
  );
}
