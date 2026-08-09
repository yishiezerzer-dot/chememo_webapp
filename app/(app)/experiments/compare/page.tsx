import Link from "next/link";
import { listExperimentsByIds } from "@/lib/experiments/service";
import { listControls } from "@/lib/conditions/service";
import { ComparisonTable } from "@/components/comparison-table";
import { GroupSummary } from "@/components/group-summary";
import { AiComparisonTable } from "@/components/ai-comparison-table";
import { AiContradictionCheck } from "@/components/ai-contradiction-check";
import { generateGroupSummary } from "@/app/(app)/ask/actions";
import { generateComparisonTable, detectContradictions } from "@/app/(app)/experiments/compare-actions";

// T2.9 D4 — the relationship-based "Compare" view: an ad-hoc set of
// experiment ids (current experiment + related ones of one relationship
// type), not a formal series, so this is a query-param-driven page rather
// than a new table.
export default async function CompareExperimentsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids: idsParam } = await searchParams;
  const ids = (idsParam ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const experiments = await listExperimentsByIds(ids);
  const controlsEntries = await Promise.all(
    experiments.map(async (e) => [e.id, (await listControls(e.id)).length] as const)
  );
  const controlsCounts = Object.fromEntries(controlsEntries);

  return (
    <div>
      <span className="eyebrow">Compare</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        Comparing {experiments.length} experiment{experiments.length === 1 ? "" : "s"}
      </h2>
      <ComparisonTable experiments={experiments} controlsCounts={controlsCounts} />

      {experiments.length > 1 && (
        <>
          <GroupSummary ids={experiments.map((e) => e.id)} action={generateGroupSummary} />
          <AiComparisonTable ids={experiments.map((e) => e.id)} action={generateComparisonTable} />
          <AiContradictionCheck experiments={experiments} controlsCounts={controlsCounts} action={detectContradictions} />
        </>
      )}

      <p style={{ marginTop: 16 }}>
        <Link href="/experiments" className="muted">
          ← Back to all experiments
        </Link>
      </p>
    </div>
  );
}
