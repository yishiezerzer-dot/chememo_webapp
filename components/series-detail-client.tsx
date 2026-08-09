"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { ComparisonTable } from "@/components/comparison-table";
import { GroupSummary } from "@/components/group-summary";
import { AiComparisonTable } from "@/components/ai-comparison-table";
import { AiContradictionCheck } from "@/components/ai-contradiction-check";
import { generateGroupSummary } from "@/app/(app)/ask/actions";
import { generateComparisonTable, detectContradictions } from "@/app/(app)/experiments/compare-actions";
import type { ActionResult, Experiment } from "@/lib/types";

export function SeriesDetailClient({
  members,
  controlsCounts,
  addMember,
  removeMember,
}: {
  members: Experiment[];
  controlsCounts: Record<string, number>;
  addMember: (experimentId: string) => Promise<ActionResult>;
  removeMember: (experimentId: string) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  function run(action: () => Promise<ActionResult>) {
    start(async () => {
      const res = await action();
      if (!res.ok) showToast(res.error, "error");
      else router.refresh();
    });
  }

  // T2.9 D2 — "timeline" ordering: experiment_series_members has no real
  // sequence field (only an insertion-time added_at), so the comparison
  // table orders by each member's own `date` instead, falling back to
  // created_at for records with no date set — a derived ordering, not a
  // stored one.
  const timelineOrdered = [...members].sort((a, b) => {
    const aKey = a.date ?? a.created_at;
    const bKey = b.date ?? b.created_at;
    return aKey.localeCompare(bKey);
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input ref={inputRef} placeholder="Experiment ID (e.g. EXP-014)" style={{ maxWidth: 220 }} />
        <button
          type="button"
          className="btn btn-sm"
          disabled={pending}
          onClick={() => {
            const id = inputRef.current?.value.trim();
            if (!id) return;
            run(async () => {
              const res = await addMember(id);
              if (res.ok && inputRef.current) inputRef.current.value = "";
              return res;
            });
          }}
        >
          Add experiment
        </button>
      </div>

      <ComparisonTable experiments={timelineOrdered} controlsCounts={controlsCounts} onRemove={removeMember} />

      {timelineOrdered.length > 1 && (
        <>
          <GroupSummary ids={timelineOrdered.map((e) => e.id)} action={generateGroupSummary} />
          <AiComparisonTable ids={timelineOrdered.map((e) => e.id)} action={generateComparisonTable} />
          <AiContradictionCheck experiments={timelineOrdered} controlsCounts={controlsCounts} action={detectContradictions} />
        </>
      )}
    </div>
  );
}
