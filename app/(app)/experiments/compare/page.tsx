import Link from "next/link";
import { listExperimentsByIds } from "@/lib/experiments/service";
import { listControls } from "@/lib/conditions/service";
import { ComparisonTable } from "@/components/comparison-table";

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
      <p style={{ marginTop: 16 }}>
        <Link href="/experiments" className="muted">
          ← Back to all experiments
        </Link>
      </p>
    </div>
  );
}
