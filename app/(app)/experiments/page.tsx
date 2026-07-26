import Link from "next/link";
import { listExperiments } from "@/lib/experiments/service";
import { listProjects } from "@/lib/projects/service";
import { ExperimentsTable } from "@/components/experiments-table";

export default async function ExperimentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; project?: string }>;
}) {
  const [{ q, project }, experiments, projects] = await Promise.all([
    searchParams,
    listExperiments(),
    listProjects(),
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
        <Link href="/new" className="btn btn-primary btn-sm">
          + New experiment
        </Link>
      </div>
      <ExperimentsTable
        experiments={experiments}
        projects={projects}
        initialQuery={q}
        initialProject={project}
      />
    </div>
  );
}
