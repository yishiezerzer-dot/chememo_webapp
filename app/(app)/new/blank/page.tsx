import { listProjects } from "@/lib/projects/service";
import { listVocab, listSampleVocab } from "@/lib/experiments/service";
import { isLlmEnabled } from "@/lib/llm";
import { NewExperimentClient } from "@/components/new-experiment-client";
import { createExperiment, extractFromNotes } from "../actions";

export default async function BlankExperimentPage() {
  const [projects, vocab, sampleVocab] = await Promise.all([
    listProjects(),
    listVocab(),
    listSampleVocab(),
  ]);

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
        sampleVocab={sampleVocab}
      />
    </div>
  );
}
