"use client";

import { useState } from "react";
import type { Experiment, Project } from "@/lib/types";
import { ExperimentForm } from "@/components/experiment-form";
import { PasteNotes } from "@/components/paste-notes";

export function NewExperimentClient({
  projects,
  aiEnabled,
  createAction,
  extractAction,
}: {
  projects: Project[];
  aiEnabled: boolean;
  createAction: (formData: FormData) => void | Promise<void>;
  extractAction: (notes: string) => Promise<Partial<Experiment> | null>;
}) {
  const [initial, setInitial] = useState<Partial<Experiment> | undefined>();
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
      />
    </>
  );
}
