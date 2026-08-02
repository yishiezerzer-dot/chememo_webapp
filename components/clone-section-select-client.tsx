"use client";

import { useState } from "react";
import type { ActionResult, Experiment, Project } from "@/lib/types";
import { NewExperimentClient } from "@/components/new-experiment-client";

// T1.2 D6 — groups the copyable §8.1 sections. Files, results/analyses, and
// lock/revision history are never offered here at all (the plan's explicit
// exclusion) — there's simply no checkbox for them, not a disabled one.
const GROUPS = [
  { key: "identity", label: "Identity", fields: ["date", "researcher", "project", "reaction_type"] as const },
  {
    key: "chemistry",
    label: "Chemistry",
    fields: ["compounds", "metals", "ph", "concentration", "temperature", "cycles"] as const,
  },
  { key: "analysis", label: "Analysis methods", fields: ["methods", "mz"] as const },
  {
    key: "planning",
    label: "Planning narrative",
    fields: [
      "scientific_question",
      "rationale",
      "hypothesis",
      "primary_outcome",
      "secondary_outcomes",
      "data_analysis_plan",
      "risks_failure_modes",
      "acceptance_criteria",
    ] as const,
  },
  { key: "sample_matrix", label: "Sample matrix", fields: ["sample_matrix"] as const },
  { key: "controls", label: "Controls", fields: ["controls"] as const },
  {
    key: "protocol",
    label: "Protocol & analyses",
    fields: [
      "protocol_version",
      "planned_analyses",
      "sample_storage_plan",
      "independent_variables",
      "controlled_variables",
    ] as const,
  },
];

export function CloneSectionSelectClient({
  source,
  projects,
  aiEnabled,
  createAction,
  extractAction,
  vocab,
  sampleVocab,
}: {
  source: Experiment;
  projects: Project[];
  aiEnabled: boolean;
  createAction: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  extractAction: (notes: string) => Promise<Partial<Experiment> | null>;
  vocab?: { compounds: string[]; metals: string[] };
  sampleVocab?: { sampleTypes: string[]; reactionModes: string[]; sampleStatuses: string[] };
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(GROUPS.map((g) => [g.key, true]))
  );
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    const initialFields: Partial<Experiment> = {};
    for (const g of GROUPS) {
      if (!checked[g.key]) continue;
      for (const f of g.fields) {
        (initialFields as Record<string, unknown>)[f] = source[f];
      }
    }
    // §8.3 — a clone mints fresh sample identity; never reuse the source's IDs.
    if (checked.sample_matrix && initialFields.sample_matrix) {
      initialFields.sample_matrix = initialFields.sample_matrix.map((row) => ({ ...row, sample_id: "" }));
    }

    return (
      <NewExperimentClient
        projects={projects}
        aiEnabled={aiEnabled}
        createAction={createAction}
        extractAction={extractAction}
        vocab={vocab}
        sampleVocab={sampleVocab}
        initialFields={initialFields}
        basedOnExperimentId={source.id}
      />
    );
  }

  return (
    <div className="obs-box glass" style={{ maxWidth: 480 }}>
      <h4 style={{ marginTop: 0 }}>Sections to copy</h4>
      {GROUPS.map((g) => (
        <label key={g.key} style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
          <input
            type="checkbox"
            checked={checked[g.key]}
            onChange={() => setChecked((cur) => ({ ...cur, [g.key]: !cur[g.key] }))}
          />
          {g.label}
        </label>
      ))}
      <p className="sec-sub">Files, results, and history are never copied.</p>
      <button type="button" className="btn btn-primary" onClick={() => setConfirmed(true)}>
        Continue
      </button>
    </div>
  );
}
