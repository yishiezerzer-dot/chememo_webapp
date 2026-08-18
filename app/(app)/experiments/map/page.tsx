import { listProjects } from "@/lib/projects/service";
import { listRelationshipsForProject } from "@/lib/relationships/service";
import { ExperimentGraphLoader } from "@/components/experiment-graph-loader";

// T3.6 D7 — third view over the experiment set, alongside /experiments
// (table) and /experiments/matrix — same "pick a project, see it visually"
// shape, project-scoped by design (D1): no all-projects graph.
export default async function ExperimentMapPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: projectId } = await searchParams;
  const projects = await listProjects();
  const graph = projectId ? await listRelationshipsForProject(projectId) : null;

  return (
    <div>
      <span className="eyebrow">Map</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 12px" }}>
        Project relationship map
      </h2>

      <form style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <label style={{ fontSize: 13 }}>
          Project
          <select name="project" defaultValue={projectId ?? ""} style={{ marginLeft: 6 }}>
            <option value="">Select a project…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-sm">
          Show
        </button>
      </form>

      {projects.length === 0 ? (
        // Telling someone to select a project when the dropdown holds only
        // its own placeholder is a dead end: nothing to pick, and no hint
        // that projects are the missing piece.
        <div className="empty-state">
          <div className="big">No projects yet</div>
          <p style={{ margin: "6px 0 0" }}>
            This map draws the links between experiments in a project — replicates, controls and
            follow-ups. Create a project, assign a few experiments to it, and their relationships
            appear here.
          </p>
        </div>
      ) : !projectId ? (
        <div className="empty-state">
          <div className="big">Select a project to see its relationship map.</div>
        </div>
      ) : (
        <ExperimentGraphLoader nodes={graph!.nodes} edges={graph!.edges} />
      )}
    </div>
  );
}
