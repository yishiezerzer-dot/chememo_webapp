export type Project = {
  id: string;
  label: string;
  color: string | null;
  owner_id: string | null;
};

// Result shape for user-facing server actions so the client can toast a
// friendly message instead of throwing to the error boundary.
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

// A prior state of an experiment, captured by the update trigger (audit #24).
export type ExperimentRevision = {
  id: string;
  experiment_id: string;
  editor_id: string | null;
  snapshot: Experiment;
  created_at: string;
};

export type ExperimentFile = {
  id: string;
  experiment_id: string;
  kind: "upload" | "link";
  file_type: string | null;
  label: string | null;
  storage_path: string | null;
  url: string | null;
  mime_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  uploaded_by: string | null;
  created_at: string;
};

export type Experiment = {
  id: string;
  name: string;
  date: string | null;
  researcher: string | null;
  owner_id: string | null;
  project: string | null;
  reaction_type: string | null;
  compounds: string[];
  metals: string[];
  ph: number | null;
  concentration: string | null;
  temperature: string | null;
  cycles: number | null;
  methods: string[];
  mz: number[];
  observations: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

// Shape written by the New/Edit form (id + owner_id assigned server-side).
export type ExperimentInput = {
  name: string;
  date: string | null;
  researcher: string | null;
  project: string | null;
  reaction_type: string | null;
  compounds: string[];
  metals: string[];
  ph: number | null;
  concentration: string | null;
  temperature: string | null;
  cycles: number | null;
  methods: string[];
  mz: number[];
  observations: string | null;
  notes: string | null;
};

export const METHOD_OPTIONS = [
  "LC-MS/MS (neg)",
  "LC-MS/MS (pos)",
  "NMR",
  "Microscopy",
  "UV-Vis",
] as const;
