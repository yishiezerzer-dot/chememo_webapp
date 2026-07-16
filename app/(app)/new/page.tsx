import { listProjects, listVocab } from "@/lib/experiments";
import { isLlmEnabled } from "@/lib/llm";
import { NewExperimentClient } from "@/components/new-experiment-client";
import { createExperiment, extractFromNotes } from "./actions";

export default async function NewExperimentPage() {
  const [projects, vocab] = await Promise.all([listProjects(), listVocab()]);

  return (
    <div>
      <span className="eyebrow">New experiment</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        Log a new experiment
      </h2>
      <NewExperimentClient
        projects={projects}
        aiEnabled={isLlmEnabled()}
        createAction={createExperiment}
        extractAction={extractFromNotes}
        vocab={vocab}
      />
    </div>
  );
}
