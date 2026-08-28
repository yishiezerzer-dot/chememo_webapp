import Link from "next/link";
import { searchExperiments } from "@/lib/experiments/search";
import { parseExperimentSearchParams } from "@/lib/experiments/search-params";
import { listProjects } from "@/lib/projects/service";
import { listViewsAction } from "./actions";
import { ExperimentsTable } from "@/components/experiments-table";

export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const params = parseExperimentSearchParams(raw);

  const [{ rows, nextCursor, facets }, projects, savedViews] = await Promise.all([
    searchExperiments(params, { cursor: raw.cursor || null }),
    listProjects(),
    listViewsAction(),
  ]);

  return (
    <div>
      <div className="section-title">
        <div>
          <span className="eyebrow">Experiments</span>
          <h3 style={{ fontFamily: "var(--display)", fontSize: 26, margin: "6px 0 0" }}>
            All experiments
          </h3>
        </div>
        <Link href="/new" prefetch={false} className="btn btn-primary btn-sm">
          + New experiment
        </Link>
      </div>
      <ExperimentsTable
        rows={rows}
        nextCursor={nextCursor}
        facets={facets}
        projects={projects}
        savedViews={savedViews}
        params={params}
      />
    </div>
  );
}
