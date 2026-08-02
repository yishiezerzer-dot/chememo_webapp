"use client";

import { useState } from "react";
import type { ActionResult, DraftKey, Experiment, ExperimentDraft, Project, QuantityKind } from "@/lib/types";
import { ExperimentForm } from "@/components/experiment-form";
import { PasteNotes } from "@/components/paste-notes";

export function NewExperimentClient({
  projects,
  aiEnabled,
  createAction,
  extractAction,
  vocab,
  sampleVocab,
  quantityKinds,
  initialFields,
  templateVersionId,
  basedOnExperimentId,
  draftKey,
  recoveredDraft,
}: {
  projects: Project[];
  aiEnabled: boolean;
  createAction: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  extractAction: (notes: string) => Promise<Partial<Experiment> | null>;
  vocab?: { compounds: string[]; metals: string[] };
  sampleVocab?: { sampleTypes: string[]; reactionModes: string[]; sampleStatuses: string[] };
  quantityKinds?: QuantityKind[];
  // T1.2 D6 — pre-fill from a template's defaults or a clone's selected
  // sections. Distinct from PasteNotes' onExtract below (Phase 9's LLM
  // path), which still overrides it if the user pastes notes afterward.
  initialFields?: Partial<Experiment>;
  templateVersionId?: string | null;
  basedOnExperimentId?: string | null;
  // T1.3 — draft key for this entry point (D2) and its server-fetched draft,
  // if any (D3's cross-device backstop).
  draftKey: DraftKey;
  recoveredDraft?: ExperimentDraft | null;
}) {
  const [initial, setInitial] = useState<Partial<Experiment> | undefined>(initialFields);
  // Bump the key so the (uncontrolled) form remounts with pre-filled defaults.
  const [version, setVersion] = useState(0);
  const [rawNote, setRawNote] = useState("");

  return (
    <>
      <PasteNotes
        aiEnabled={aiEnabled}
        extractAction={extractAction}
        onExtract={(fields) => {
          setInitial(fields);
          setVersion((v) => v + 1);
        }}
        onNotesChange={setRawNote}
      />
      <ExperimentForm
        key={version}
        projects={projects}
        action={createAction}
        initial={initial}
        submitLabel="Save experiment"
        vocab={vocab}
        sampleVocab={sampleVocab}
        quantityKinds={quantityKinds}
        templateVersionId={templateVersionId}
        basedOnExperimentId={basedOnExperimentId}
        draftKey={draftKey}
        recoveredDraft={recoveredDraft}
        rawNote={rawNote}
      />
    </>
  );
}
