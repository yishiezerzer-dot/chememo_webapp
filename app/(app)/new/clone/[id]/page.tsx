import { notFound } from "next/navigation";
import { getExperiment, listVocab, listSampleVocab } from "@/lib/experiments/service";
import { listProjects } from "@/lib/projects/service";
import { isLlmEnabled } from "@/lib/llm";
import { createExperiment, extractFromNotes } from "../../actions";
import { CloneSectionSelectClient } from "@/components/clone-section-select-client";

export default async function CloneExperimentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [result, projects, vocab, sampleVocab] = await Promise.all([
    getExperiment(id),
    listProjects(),
    listVocab(),
    listSampleVocab(),
  ]);
  if (!result) notFound();

  return (
    <div>
      <span className="eyebrow">New experiment · Clone from {result.experiment.short_code}</span>
      <h2 style={{ fontFamily: "var(--display)", fontSize: 28, margin: "8px 0 20px" }}>
        {result.experiment.name}
      </h2>
      <CloneSectionSelectClient
        source={result.experiment}
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
