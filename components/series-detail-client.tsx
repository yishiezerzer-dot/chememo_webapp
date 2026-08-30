"use client";

import { useRef } from "react";
import { Spinner } from "@/components/spinner";
import { useRunAction } from "@/lib/use-run-action";
import { useStickyState } from "@/lib/use-sticky-state";
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
  addMember: (experimentId: string) => Promise<ActionResult<Experiment>>;
  removeMember: (experimentId: string) => Promise<ActionResult>;
}) {
  const { run, pending } = useRunAction();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useStickyState(members);

  // T2.9 D2 — "timeline" ordering: experiment_series_members has no real
  // sequence field (only an insertion-time added_at), so the comparison
  // table orders by each member's own `date` instead, falling back to
  // created_at for records with no date set — a derived ordering, not a
  // stored one.
  const timelineOrdered = [...items].sort((a, b) => {
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
          aria-busy={pending}
          onClick={() => {
            const id = inputRef.current?.value.trim();
            if (!id) return;
            run(async () => {
              const res = await addMember(id);
              if (res.ok) {
                if (res.data) setItems((cur) => [...cur, res.data as Experiment]);
                if (inputRef.current) inputRef.current.value = "";
              }
              return res;
            });
          }}
        >
          {pending && <Spinner />}
          Add experiment
        </button>
      </div>

      <ComparisonTable
        experiments={timelineOrdered}
        controlsCounts={controlsCounts}
        onRemove={async (experimentId) => {
          const res = await removeMember(experimentId);
          if (res.ok) setItems((cur) => cur.filter((e) => e.id !== experimentId));
          return res;
        }}
      />

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
