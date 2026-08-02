import { listProjects } from "@/lib/projects/service";
import { listVocab, listSampleVocab } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { listVersionOptions } from "@/lib/protocols/service";
import { isLlmEnabled } from "@/lib/llm";
import { getDraft } from "@/lib/drafts/service";
import { NewExperimentClient } from "@/components/new-experiment-client";
import { createExperiment, extractFromNotes } from "../actions";

const DRAFT_KEY = { clientDraftId: "new:blank" } as const;

export default async function BlankExperimentPage() {
  const [projects, vocab, sampleVocab, quantityKinds, protocolVersions, recoveredDraft] = await Promise.all([
    listProjects(),
    listVocab(),
    listSampleVocab(),
    listQuantityKinds(),
    listVersionOptions(),
    getDraft(DRAFT_KEY),
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
        quantityKinds={quantityKinds}
        protocolVersions={protocolVersions}
        draftKey={DRAFT_KEY}
        recoveredDraft={recoveredDraft}
      />
    </div>
  );
}
