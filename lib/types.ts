import type { Database } from "@/lib/database.types";

// Table-shaped types are sourced from the generated schema (`npm run types:gen`)
// so a migration that adds/renames/removes a column surfaces as a type error
// here instead of silently drifting the way the handwritten copies did before
// (this project already hit that once, adding `owner_id` by hand).
type ExperimentRow = Database["public"]["Tables"]["experiments"]["Row"];
type ExperimentFileRow = Database["public"]["Tables"]["experiment_files"]["Row"];
type ExperimentRevisionRow =
  Database["public"]["Tables"]["experiment_revisions"]["Row"];
type ExperimentLockEventRow =
  Database["public"]["Tables"]["experiment_lock_events"]["Row"];
type ExperimentTemplateRow =
  Database["public"]["Tables"]["experiment_templates"]["Row"];
type ExperimentTemplateVersionRow =
  Database["public"]["Tables"]["experiment_template_versions"]["Row"];

export type Project = Database["public"]["Tables"]["projects"]["Row"];

// Result shape for user-facing server actions so the client can toast a
// friendly message instead of throwing to the error boundary.
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

// T1.2, §8.2: the 19 required sample-matrix columns, one row per sample.
// sample_id is blank on a template default and on a fresh clone (D2/D6 in
// the spec) — it's filled in only once the record is actually created, since
// it implies a real, ID-consuming row and §8.3 forbids reserving-then-
// abandoning an ID. sample_type/reaction_mode/status hold
// controlled_vocabularies values but are typed as plain string here — the
// allow-list is runtime data, not a literal union, so the constraint is
// enforced in lib/schemas.ts at write time (T1.2 D2), not by the type system.
export type SampleMatrixRow = {
  sample_id: string;
  vial_label: string;
  legacy_code: string;
  batch: string;
  replicate: string;
  sample_type: string;
  component_1: string;
  amount_1: string;
  component_2: string;
  amount_2: string;
  ratio: string;
  initial_volume: string;
  reaction_mode: string;
  temperature: string;
  duration: string;
  atmosphere: string;
  treatment: string;
  planned_analysis: string;
  status: string;
};

// T1.2, §8.5: a control checklist item. Kept as a checklist, not a
// paragraph, so it renders as checkboxes and stays exportable to Markdown
// checklist syntax later (T1.11) with no translation (T1.2 D3).
export type ControlItem = { label: string; checked: boolean };

// experiments.compounds/metals/methods/mz and created_at/updated_at are
// nullable at the DB level (no NOT NULL constraint) but every write path sets
// them (`default '{}'` / `now()`, never written null) — narrowed here to match
// that real invariant instead of forcing null-checks the app never needs.
// short_code is a generated column derived from id (never null: id is the
// primary key) — narrowed the same way (T1.1, standard §6.2).
// sample_matrix/controls are stored as jsonb (generic `Json`) but every write
// path sends the typed array shape above (T1.2, D2/D3) — narrowed the same way.
export type Experiment = Omit<
  ExperimentRow,
  | "compounds"
  | "metals"
  | "methods"
  | "mz"
  | "created_at"
  | "updated_at"
  | "short_code"
  | "sample_matrix"
  | "controls"
> & {
  compounds: string[];
  metals: string[];
  methods: string[];
  mz: number[];
  created_at: string;
  updated_at: string;
  short_code: string;
  sample_matrix: SampleMatrixRow[];
  controls: ControlItem[];
};

// A prior state of an experiment, captured by the update trigger (audit #24).
// `snapshot` is stored as jsonb (generic `Json`) but the trigger always writes
// an `Experiment`-shaped row.
export type ExperimentRevision = Omit<
  ExperimentRevisionRow,
  "experiment_id" | "created_at" | "snapshot"
> & {
  experiment_id: string;
  created_at: string;
  snapshot: Experiment;
};

// `kind` is DB-checked to 'upload'|'link' but stored as plain `text`, so the
// generated type only knows it's a string — narrowed here for the literal union.
export type ExperimentFile = Omit<
  ExperimentFileRow,
  "kind" | "experiment_id" | "created_at"
> & {
  kind: "upload" | "link";
  experiment_id: string;
  created_at: string;
};

// A lock or reopen event (T1.1, §10.2 append-only). `event` is DB-checked to
// 'lock'|'reopen' but stored as plain `text`.
export type ExperimentLockEvent = Omit<ExperimentLockEventRow, "event"> & {
  event: "lock" | "reopen";
};

// Shape written by the New/Edit form (id + owner_id assigned server-side).
// Lifecycle columns (status, locked_at, completed_at/by, reviewed_at/by,
// acceptance_criteria_locked_at) are deliberately absent (T1.1, D10) — status
// moves only through the dedicated lifecycle-actions.ts gates.
// template_version_id/based_on_experiment_id are also absent (T1.2, D6 —
// provenance is never a plain form field): the instantiate/clone actions set
// them explicitly before the first save, the same way status never moves
// through a plain form submit.
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
  scientific_question: string | null;
  rationale: string | null;
  hypothesis: string | null;
  primary_outcome: string | null;
  secondary_outcomes: string | null;
  data_analysis_plan: string | null;
  risks_failure_modes: string | null;
  conclusion: string | null;
  next_steps: string | null;
  acceptance_criteria: string | null;
  planned_start_at: string | null;
  planned_end_at: string | null;
  independent_variables: string | null;
  controlled_variables: string | null;
  sample_matrix: SampleMatrixRow[];
  controls: ControlItem[];
  protocol_version: string | null;
  planned_analyses: string | null;
  sample_storage_plan: string | null;
};

export type ExperimentStatus = Database["public"]["Enums"]["experiment_status"];

// C1's ownership table, as a comment that survives grep:
//   task status     -> T1.9  (standard 10.3)
//   sample status   -> T2.3  (standard 23.3)
//   analysis status -> T2.5  (standard 23.4)
// Values for all three are already seeded in controlled_vocabularies (G11).

// T1.2, D4/D5 — a shared template library. created_by is always stamped
// even though any authenticated user can create/edit (no role model until
// T2.1), so that model can attribute authorship without a backfill later.
export type ExperimentTemplate = Omit<ExperimentTemplateRow, "created_at"> & {
  created_at: string;
};

// A version's `defaults` is a jsonb blob shaped like Partial<ExperimentInput>
// (T1.2, D4) — not a parallel schema, so instantiating a template is
// mechanically the same "produce a Partial<Experiment>, pass it as
// ExperimentForm's `initial`" prefill PasteNotes already established.
// `frozen_at` is set the first time any experiment references this version
// (the experiments_freeze_template_version trigger) and is never cleared.
export type ExperimentTemplateVersion = Omit<
  ExperimentTemplateVersionRow,
  "created_at" | "defaults" | "required_fields"
> & {
  created_at: string;
  defaults: Partial<ExperimentInput>;
  required_fields: (keyof ExperimentInput)[];
};

export const METHOD_OPTIONS = [
  "LC-MS/MS (neg)",
  "LC-MS/MS (pos)",
  "NMR",
  "Microscopy",
  "UV-Vis",
] as const;
