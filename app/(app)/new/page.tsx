import { listProjects } from "@/lib/experiments";
import { ExperimentForm } from "@/components/experiment-form";
import { createExperiment } from "./actions";

export default async function NewExperimentPage() {
  const projects = await listProjects();

  return (
    <div>
      <span className="eyebrow">New experiment</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        Log a new experiment
      </h2>
      <ExperimentForm projects={projects} action={createExperiment} submitLabel="Save experiment" />
    </div>
  );
}
