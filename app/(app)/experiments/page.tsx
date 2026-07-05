import Link from "next/link";
import { listExperiments, listProjects } from "@/lib/experiments";
import { ExperimentsTable } from "@/components/experiments-table";

export default async function ExperimentsPage() {
  const [experiments, projects] = await Promise.all([
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
      <ExperimentsTable experiments={experiments} projects={projects} />
    </div>
  );
}
