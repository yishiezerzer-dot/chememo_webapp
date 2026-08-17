"use client";

import { useTransition } from "react";
import { useToast } from "@/components/toast-provider";
import { Spinner } from "@/components/spinner";

// T1.11 D7 — same Blob-download pattern experiments-table.tsx's CSV export
// already uses, scoped to one experiment's Markdown export.
export function ExportMarkdownButton({
  experimentId,
  exportMarkdown,
}: {
  experimentId: string;
  exportMarkdown: () => Promise<string>;
}) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();

  function run() {
    start(async () => {
      try {
        const markdown = await exportMarkdown();
        const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${experimentId}__results-summary__v01.md`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        showToast("Could not export this experiment.", "error");
      }
    });
  }

  return (
    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} aria-busy={pending} onClick={run}>
      {pending && <Spinner />}
      Export Markdown
    </button>
  );
}
