import { notFound } from "next/navigation";
import { getExperiment, listVocab, listSampleVocab } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { listVersionOptions } from "@/lib/protocols/service";
import { listProjects } from "@/lib/projects/service";
import { isLlmEnabled } from "@/lib/llm";
import { getDraft } from "@/lib/drafts/service";
import { createExperiment, extractFromNotes } from "../../actions";
import { CloneSectionSelectClient } from "@/components/clone-section-select-client";

export default async function CloneExperimentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const draftKey = { clientDraftId: `new:clone:${id}` } as const;
  const [result, projects, vocab, sampleVocab, quantityKinds, protocolVersions, recoveredDraft] = await Promise.all([
    getExperiment(id),
    listProjects(),
    listVocab(),
    listSampleVocab(),
    listQuantityKinds(),
    listVersionOptions(),
    getDraft(draftKey),
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
        quantityKinds={quantityKinds}
        protocolVersions={protocolVersions}
        draftKey={draftKey}
        recoveredDraft={recoveredDraft}
      />
    </div>
  );
}
