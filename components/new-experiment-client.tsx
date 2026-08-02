"use client";

import { useState } from "react";
import type { ActionResult, Experiment, Project } from "@/lib/types";
import { ExperimentForm } from "@/components/experiment-form";
import { PasteNotes } from "@/components/paste-notes";

export function NewExperimentClient({
  projects,
  aiEnabled,
  createAction,
  extractAction,
  vocab,
  sampleVocab,
  initialFields,
  templateVersionId,
  basedOnExperimentId,
}: {
  projects: Project[];
  aiEnabled: boolean;
  createAction: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  extractAction: (notes: string) => Promise<Partial<Experiment> | null>;
  vocab?: { compounds: string[]; metals: string[] };
  sampleVocab?: { sampleTypes: string[]; reactionModes: string[]; sampleStatuses: string[] };
  // T1.2 D6 — pre-fill from a template's defaults or a clone's selected
  // sections. Distinct from PasteNotes' onExtract below (Phase 9's LLM
  // path), which still overrides it if the user pastes notes afterward.
  initialFields?: Partial<Experiment>;
  templateVersionId?: string | null;
  basedOnExperimentId?: string | null;
}) {
  const [initial, setInitial] = useState<Partial<Experiment> | undefined>(initialFields);
  // Bump the key so the (uncontrolled) form remounts with pre-filled defaults.
  const [version, setVersion] = useState(0);

  return (
    <>
      <PasteNotes
        aiEnabled={aiEnabled}
        extractAction={extractAction}
        onExtract={(fields) => {
          setInitial(fields);
          setVersion((v) => v + 1);
        }}
      />
      <ExperimentForm
        key={version}
        projects={projects}
        action={createAction}
        initial={initial}
        submitLabel="Save experiment"
        vocab={vocab}
        sampleVocab={sampleVocab}
        templateVersionId={templateVersionId}
        basedOnExperimentId={basedOnExperimentId}
      />
    </>
  );
}
