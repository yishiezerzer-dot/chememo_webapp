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
type ExperimentDraftRow = Database["public"]["Tables"]["experiment_drafts"]["Row"];
type QuantityKindRow = Database["public"]["Tables"]["quantity_kinds"]["Row"];
type ProtocolRow = Database["public"]["Tables"]["protocols"]["Row"];
type ProtocolVersionRow = Database["public"]["Tables"]["protocol_versions"]["Row"];
type ProtocolStepRow = Database["public"]["Tables"]["protocol_steps"]["Row"];
type ExperimentStepRow = Database["public"]["Tables"]["experiment_steps"]["Row"];
type StepObservationRow = Database["public"]["Tables"]["step_observations"]["Row"];
type StepDeviationRow = Database["public"]["Tables"]["step_deviations"]["Row"];
type SavedViewRow = Database["public"]["Tables"]["saved_views"]["Row"];
type ExperimentRelationshipRow = Database["public"]["Tables"]["experiment_relationships"]["Row"];
type ExperimentSeriesRow = Database["public"]["Tables"]["experiment_series"]["Row"];
type ExperimentSeriesMemberRow = Database["public"]["Tables"]["experiment_series_members"]["Row"];
type CommentRow = Database["public"]["Tables"]["comments"]["Row"];
type CommentMentionRow = Database["public"]["Tables"]["comment_mentions"]["Row"];
type ExperimentTaskRow = Database["public"]["Tables"]["experiment_tasks"]["Row"];
type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
type FileVersionRow = Database["public"]["Tables"]["file_versions"]["Row"];
type FileJobRow = Database["public"]["Tables"]["file_jobs"]["Row"];

export type Project = Database["public"]["Tables"]["projects"]["Row"];

// Result shape for user-facing server actions so the client can toast a
// friendly message instead of throwing to the error boundary.
// `conflict` (T1.3 D4/D5) distinguishes "someone else saved a change since
// you started editing" from an ordinary validation/server error, so the UI
// can show "reload" instead of a generic field error.
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; conflict?: boolean };

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

// T1.4 D1 — one physical/concentration value. unit_code is checked against
// its kind's compatible_units at write time (lib/schemas.ts), the same
// allow-list pattern T1.2 D2 already established for sample_type.
export type Quantity = { value: number; unit_code: string; uncertainty?: number; qualifier?: string };

// T1.4 D2 — read side of the quantity_kinds seed registry (T1.1 G11's
// pattern: reference data as rows, not an enum, so a standard revision is
// an UPDATE not a migration).
export type QuantityKind = QuantityKindRow;

// T1.5 D2 — a lab document identity (mutable name); everything the standard
// actually versions (purpose, steps, safety, etc.) lives on ProtocolVersion.
export type Protocol = ProtocolRow;

// T1.5 §9.1's "critical parameters"/"known failure modes" tables, stored as
// jsonb arrays on the version (same convention as ControlItem/SampleMatrixRow).
export type CriticalParameter = { parameter: string; target: string; acceptable_range: string; action_if_outside: string };
export type KnownFailureMode = { failure_mode: string; evidence: string; likely_cause: string; corrective_action: string };

// T1.5 D2 — freeze-on-first-use, same shape as ExperimentTemplateVersion.
// critical_parameters/known_failure_modes are jsonb (generic `Json`) but
// every write path sends the typed array shape above — narrowed here.
export type ProtocolVersion = Omit<ProtocolVersionRow, "critical_parameters" | "known_failure_modes"> & {
  critical_parameters: CriticalParameter[];
  known_failure_modes: KnownFailureMode[];
};

// T1.5 D3 — target_quantities is jsonb shaped Record<"temperature"|"duration", Quantity>,
// reusing T1.4's quantity_kinds registry instead of bespoke numeric columns.
export type ProtocolStep = Omit<ProtocolStepRow, "target_quantities"> & {
  target_quantities: Record<string, Quantity>;
};

// T1.5 D5 — references protocol_steps directly; nothing is copied at
// instantiation time since the parent version is already frozen by then.
export type ExperimentStep = Omit<ExperimentStepRow, "actual_quantities"> & {
  actual_quantities: Record<string, Quantity>;
};

// T1.5 D6 — append-only (no update/delete path exists at the RLS level).
export type StepObservation = StepObservationRow;

// T1.5 D7 — category is a controlled_vocabularies value ("deviation_category"),
// checked against the live seed rows the same way sample_type/quantities are.
export type StepDeviation = StepDeviationRow;

// experiments.compounds/metals/methods/mz and created_at/updated_at are
// nullable at the DB level (no NOT NULL constraint) but every write path sets
// them (`default '{}'` / `now()`, never written null) — narrowed here to match
// that real invariant instead of forcing null-checks the app never needs.
// short_code is a generated column derived from id (never null: id is the
// primary key) — narrowed the same way (T1.1, standard §6.2).
// sample_matrix/controls are stored as jsonb (generic `Json`) but every write
// path sends the typed array shape above (T1.2, D2/D3) — narrowed the same way.
// quantities is stored the same way (T1.4, D1) — a map of quantity_kind key
// to Quantity, never the bare Json the generated type would otherwise imply.
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
  | "quantities"
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
  quantities: Record<string, Quantity>;
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
// T2.7 D3 — file_role/retention_state are controlled string unions;
// parsed_metadata (§16.5's legacy-filename token decoding) is a jsonb map.
export type FileRole = "raw" | "processed" | "report";
export const FILE_ROLES: FileRole[] = ["raw", "processed", "report"];
export type FileRetentionState = "active" | "archived";
export type ExperimentFile = Omit<
  ExperimentFileRow,
  "kind" | "experiment_id" | "created_at" | "file_role" | "retention_state" | "parsed_metadata"
> & {
  kind: "upload" | "link";
  experiment_id: string;
  created_at: string;
  file_role: FileRole | null;
  retention_state: FileRetentionState;
  parsed_metadata: Record<string, unknown>;
};

// T2.7 D1/D4 — each physical upload; processing_state reflects the file_jobs
// queue's outcome for this version (jobs themselves are internal bookkeeping
// with no authenticated RLS, mirroring T0.5's index_jobs precedent).
export type FileProcessingState = "pending" | "processing" | "done" | "failed" | "not_applicable";
export type FileVersion = Omit<FileVersionRow, "processing_state"> & { processing_state: FileProcessingState };

export type FileJobType = "text_extract" | "thumbnail";
export type FileJobStatus = "pending" | "processing" | "done" | "failed" | "not_applicable";
export type FileJob = Omit<FileJobRow, "job_type" | "status" | "result"> & {
  job_type: FileJobType;
  status: FileJobStatus;
  result: Record<string, unknown>;
};

// A lock/reopen/restore event (T1.1, §10.2 append-only). `event` is
// DB-checked to 'lock'|'reopen'|'restore' (T1.8 added restore) but stored as
// plain `text`.
export type ExperimentLockEvent = Omit<ExperimentLockEventRow, "event"> & {
  event: "lock" | "reopen" | "restore";
};

// Shape written by the New/Edit form (id + owner_id assigned server-side).
// Lifecycle columns (status, locked_at, completed_at/by, reviewed_at/by,
// acceptance_criteria_locked_at) are deliberately absent (T1.1, D10) — status
// moves only through the dedicated lifecycle-actions.ts gates.
// template_version_id/based_on_experiment_id are also absent (T1.2, D6 —
// provenance is never a plain form field): the instantiate/clone actions set
// them explicitly before the first save, the same way status never moves
// through a plain form submit.
// concentration/temperature (the pre-T1.4 free-text columns) are also
// absent — they're legacy/display-only now (T1.4 D4): read straight from
// Experiment, never written again, so an update payload can never silently
// wipe them.
export type ExperimentInput = {
  name: string;
  date: string | null;
  researcher: string | null;
  project: string | null;
  reaction_type: string | null;
  compounds: string[];
  metals: string[];
  ph: number | null;
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
  // T1.5 D4 — protocol_version (free text, pre-T1.5) is absent here for the
  // same reason concentration/temperature are: it's legacy/display-only now,
  // read straight from Experiment, never written again by a form save.
  protocol_version_id: string | null;
  planned_analyses: string | null;
  sample_storage_plan: string | null;
  // T1.4 D1/D4 — new structured values only; the legacy temperature/
  // concentration text columns above are untouched, display-only for
  // pre-T1.4 records.
  quantities: Record<string, Quantity>;
};

// T1.8 D6 — the exact keys ExperimentInput carries, kept as one literal
// array so restore builds a patch from a revision snapshot touching exactly
// the fields a normal edit can touch (no more, no less) — and so drift is a
// compile error (typed as (keyof ExperimentInput)[]) rather than a silently
// stale allowlist.
export const EXPERIMENT_INPUT_KEYS: (keyof ExperimentInput)[] = [
  "name", "date", "researcher", "project", "reaction_type",
  "compounds", "metals", "ph", "cycles", "methods", "mz",
  "observations", "notes", "scientific_question", "rationale", "hypothesis",
  "primary_outcome", "secondary_outcomes", "data_analysis_plan", "risks_failure_modes",
  "conclusion", "next_steps", "acceptance_criteria",
  "planned_start_at", "planned_end_at", "independent_variables", "controlled_variables",
  "sample_matrix", "controls", "protocol_version_id", "planned_analyses",
  "sample_storage_plan", "quantities",
];

// T1.8 D6 — build an ExperimentInput-shaped restore patch from a revision's
// full-row snapshot, touching only the fields a normal edit could touch
// (never status/locked_at/etc — restoring content must not silently
// un-complete or re-lock a record).
export function experimentInputFromSnapshot(snapshot: Experiment): ExperimentInput {
  const patch = {} as ExperimentInput;
  for (const key of EXPERIMENT_INPUT_KEYS) {
    (patch as Record<string, unknown>)[key] = snapshot[key];
  }
  return patch;
}

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

// T1.3 D1/D2 — private scratch space, never validated against
// experimentInputSchema (half-typed/invalid-shaped data is the normal case).
// Exactly one of targetExperimentId/clientDraftId is set, matching the DB
// check constraint: editing an existing record keys on its real id; every
// other entry point (blank/template/clone/template-editor) keys on a
// deterministic, route-derived string (D2).
// T1.3 D2 — exactly one of these is ever set, matching the DB check
// constraint. Defined here (not in lib/drafts/service.ts, which has
// `import "server-only"`) so client components can import the type without
// pulling a server-only sentinel into the client bundle.
export type DraftKey = { targetExperimentId: string } | { clientDraftId: string };

export type ExperimentDraft = Omit<
  ExperimentDraftRow,
  "target_experiment_id" | "client_draft_id" | "fields" | "raw_note" | "base_updated_at" | "created_at"
> & {
  target_experiment_id: string | null;
  client_draft_id: string | null;
  fields: Partial<ExperimentInput>;
  raw_note: string | null;
  base_updated_at: string | null;
  created_at: string;
};

// T1.6 D5 — the one shape shared by the URL query string, searchExperiments(),
// exportExperimentsCsvAction, and a saved_views.query blob. sort/dir default
// to "date"/"desc" when absent (matches the pre-T1.6 default view).
export type ExperimentSortKey = "date" | "name" | "ph" | "cycles" | "id";
export type ExperimentSearchParams = {
  q?: string;
  project?: string;
  status?: ExperimentStatus;
  reactionType?: string;
  methods?: string[];
  dateFrom?: string;
  dateTo?: string;
  phMin?: number;
  phMax?: number;
  sort?: ExperimentSortKey;
  dir?: "asc" | "desc";
};

// T1.6 D4 — a named snapshot of the current filter/sort/search state.
// Private scratch space, not lab-shared like controlled_vocabularies/
// experiment_templates — owner-only, same RLS shape as experiment_drafts (T1.3).
export type SavedView = Omit<SavedViewRow, "created_at" | "query"> & {
  created_at: string;
  query: ExperimentSearchParams;
};

// T1.7 D2 — relationship_type is DB-checked to this list but stored as plain
// text (same pattern ExperimentFile.kind already uses for "upload"|"link").
export type RelationshipType =
  | "replicate_of"
  | "control_for"
  | "optimization_of"
  | "continuation_of"
  | "based_on"
  | "confirms"
  | "contradicts"
  | "same_series";

export type ExperimentRelationship = Omit<ExperimentRelationshipRow, "relationship_type"> & {
  relationship_type: RelationshipType;
};

export type ExperimentSeries = ExperimentSeriesRow;
export type ExperimentSeriesMember = ExperimentSeriesMemberRow;

// T1.7 D2 — the *other* experiment's page shows the same row with an
// inverse-phrased label instead of a second stored row. contradicts is
// symmetric (same phrasing from both sides).
export const RELATIONSHIP_LABEL: Record<RelationshipType, string> = {
  replicate_of: "replicate of",
  control_for: "control for",
  optimization_of: "optimization of",
  continuation_of: "continuation of",
  based_on: "based on",
  confirms: "confirms",
  contradicts: "contradicts",
  same_series: "same series as",
};

export const INVERSE_RELATIONSHIP_LABEL: Record<RelationshipType, string> = {
  replicate_of: "has a replicate",
  control_for: "uses control",
  optimization_of: "has an optimization",
  continuation_of: "has a continuation",
  based_on: "is the basis for",
  confirms: "is confirmed by",
  contradicts: "contradicts",
  same_series: "same series as",
};

export const RELATIONSHIP_TYPES: RelationshipType[] = [
  "replicate_of",
  "control_for",
  "optimization_of",
  "continuation_of",
  "based_on",
  "confirms",
  "contradicts",
  "same_series",
];

// T1.9 D1 — comments/tasks target one of three entities that are both real
// today and benefit from an in-context note (results/AI-answers deferred —
// neither has a persisted target yet).
export type CommentTargetType = "experiment" | "experiment_step" | "experiment_file";
export const COMMENT_TARGET_TYPES: CommentTargetType[] = ["experiment", "experiment_step", "experiment_file"];

export type Comment = Omit<CommentRow, "target_type"> & { target_type: CommentTargetType };
export type CommentMention = CommentMentionRow;

// T1.9 D4 — a review request is a task with task_type "review" and a
// checklist payload, not a separate entity.
export type TaskType = "task" | "review";
export type TaskStatus =
  | "not_started"
  | "ready"
  | "in_progress"
  | "blocked"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";
export const TASK_STATUSES: TaskStatus[] = [
  "not_started", "ready", "in_progress", "blocked", "waiting", "completed", "failed", "cancelled",
];

export type ExperimentTask = Omit<ExperimentTaskRow, "target_type" | "task_type" | "status" | "checklist"> & {
  target_type: CommentTargetType;
  task_type: TaskType;
  status: TaskStatus;
  checklist: string[] | null;
};

export type NotificationKind = "mention" | "task_assigned" | "review_requested";
export type Notification = Omit<NotificationRow, "kind"> & { kind: NotificationKind };

// T2.1 — workspace & role model.
export type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];
export const WORKSPACE_ROLES: WorkspaceRole[] = ["owner", "admin", "pi", "researcher", "student", "viewer"];
export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];
export type WorkspaceMembership = { id: string; name: string; role: WorkspaceRole };

export const METHOD_OPTIONS = [
  "LC-MS/MS (neg)",
  "LC-MS/MS (pos)",
  "NMR",
  "Microscopy",
  "UV-Vis",
] as const;

// T2.2 — materials, lots & stock solutions.
type MaterialRow = Database["public"]["Tables"]["materials"]["Row"];
type MaterialIdentifierRow = Database["public"]["Tables"]["material_identifiers"]["Row"];
type StorageLocationRow = Database["public"]["Tables"]["storage_locations"]["Row"];
type MaterialLotRow = Database["public"]["Tables"]["material_lots"]["Row"];
type StockSolutionRow = Database["public"]["Tables"]["stock_solutions"]["Row"];
type StockSolubilityAttemptRow = Database["public"]["Tables"]["stock_solubility_attempts"]["Row"];
type ExperimentInputRow = Database["public"]["Tables"]["experiment_inputs"]["Row"];
type ExperimentOutputRow = Database["public"]["Tables"]["experiment_outputs"]["Row"];

export type Material = MaterialRow;

export type IdentifierType = "cas" | "pubchem_cid" | "inchikey" | "inchi" | "smiles" | "internal_code" | "alias";
export type MaterialIdentifier = Omit<MaterialIdentifierRow, "identifier_type"> & { identifier_type: IdentifierType };

export type StorageLocation = StorageLocationRow;

export type ConcentrationBasis = "w/w" | "w/v" | "v/v" | "molarity";
export type MaterialLot = Omit<MaterialLotRow, "concentration_basis" | "commercial_solution_quantities"> & {
  concentration_basis: ConcentrationBasis | null;
  commercial_solution_quantities: Record<string, Quantity>;
};

// D3a — {formula, inputs: {target_molarity, target_volume, molecular_weight,
// purity_fraction}, calculated_mass_g, notes}. Every field optional since a
// stock may be prepared without a full calculation on file.
export type StockCalculation = {
  formula?: string;
  inputs?: Record<string, number>;
  calculated_mass_g?: number;
  notes?: string;
};

// D3 — solubility_status is a controlled_vocabularies value ("solubility_status"),
// checked against the live seed rows the same way deviation_category is.
export type StockSolution = Omit<
  StockSolutionRow,
  "target_quantities" | "actual_quantities" | "acid_or_base_quantities" | "calculation"
> & {
  target_quantities: Record<string, Quantity>;
  actual_quantities: Record<string, Quantity>;
  acid_or_base_quantities: Record<string, Quantity>;
  calculation: StockCalculation;
};

// D3 — append-only (no update/delete path exists at the RLS level), same
// shape as StepObservation/StepDeviation.
export type StockSolubilityAttempt = Omit<StockSolubilityAttemptRow, "target_quantities"> & {
  target_quantities: Record<string, Quantity>;
};

// D4 — polymorphic reference to an exact lot or stock, same shape as
// comments/experiment_tasks' target_type/target_id. Named "Material"Input/
// Output (not just "Experiment"Input/Output) to avoid colliding with T1.8's
// pre-existing ExperimentInput (the writable form-submission shape of an
// Experiment) — a different, unrelated concept that already owns that name.
export type InputSourceType = "lot" | "stock";
// T2.4 D1 — moles/equivalents/is_limiting_reagent/calculation added by the
// stoichiometry migration; calculation reuses StockCalculation's
// {formula, inputs, notes} shape (defined below, alongside StockSolution).
export type ExperimentMaterialInput = Omit<ExperimentInputRow, "source_type" | "quantities" | "calculation"> & {
  source_type: InputSourceType;
  quantities: Record<string, Quantity>;
  calculation: StockCalculation;
};

export type ExperimentMaterialOutput = Omit<ExperimentOutputRow, "quantities" | "calculation"> & {
  quantities: Record<string, Quantity>;
  calculation: StockCalculation;
};

// T2.3 — samples & lineage.
type BatchRow = Database["public"]["Tables"]["batches"]["Row"];
type SampleRow = Database["public"]["Tables"]["samples"]["Row"];
type SampleAliasRow = Database["public"]["Tables"]["sample_aliases"]["Row"];
type SampleRelationshipRow = Database["public"]["Tables"]["sample_relationships"]["Row"];
type SampleLocationRow = Database["public"]["Tables"]["sample_locations"]["Row"];
type SampleEventRow = Database["public"]["Tables"]["sample_events"]["Row"];
type SampleMeasurementRow = Database["public"]["Tables"]["sample_measurements"]["Row"];

export type Batch = BatchRow;

// D2 — sample_type/reaction_mode/status are controlled_vocabularies values,
// checked against the live seed rows the same way material_role is (T2.2).
// origin_type/origin_id mirrors ExperimentMaterialInput's source_type/
// source_id polymorphic reference to a material_lot or stock_solution.
export type Sample = SampleRow;

export type SampleAlias = SampleAliasRow;

export type SampleRelationshipType =
  | "produced_from"
  | "consumed_by"
  | "split_into"
  | "combined_from"
  | "diluted_from"
  | "dried_from"
  | "transferred_from"
  | "analyzed_in";
export const SAMPLE_RELATIONSHIP_TYPES: SampleRelationshipType[] = [
  "produced_from",
  "consumed_by",
  "split_into",
  "combined_from",
  "diluted_from",
  "dried_from",
  "transferred_from",
  "analyzed_in",
];
export type SampleRelationship = Omit<SampleRelationshipRow, "relationship_type"> & {
  relationship_type: SampleRelationshipType;
};

export type SampleLocation = SampleLocationRow;

// D5 — G7's chain-of-custody transfer event is one event_type among
// several here, not a dedicated table. `details` shape depends on
// event_type: transfer carries {from_location_path, to_location_path,
// reason, transport_temperature, courier, tracking_number,
// condition_on_receipt, quantity_received, status}; reconstitution/dilution
// carry their own §13.1/§13.3 field lists.
export type SampleEventType =
  | "transfer"
  | "status_change"
  | "aliquoted"
  | "measured"
  | "note"
  | "reconstitution"
  | "dilution";
export const SAMPLE_EVENT_TYPES: SampleEventType[] = [
  "transfer",
  "status_change",
  "aliquoted",
  "measured",
  "note",
  "reconstitution",
  "dilution",
];
export type SampleEvent = Omit<SampleEventRow, "event_type" | "details"> & {
  event_type: SampleEventType;
  details: Record<string, unknown>;
};

export type SampleMeasurement = Omit<SampleMeasurementRow, "quantities"> & {
  quantities: Record<string, Quantity>;
};

// T2.5 — analytical run model.
type InstrumentRow = Database["public"]["Tables"]["instruments"]["Row"];
type InstrumentMethodRow = Database["public"]["Tables"]["instrument_methods"]["Row"];
type AnalysisRunRow = Database["public"]["Tables"]["analysis_runs"]["Row"];
type AnalysisFileRow = Database["public"]["Tables"]["analysis_files"]["Row"];
type AnalysisResultRow = Database["public"]["Tables"]["analysis_results"]["Row"];
type PeakAssignmentRow = Database["public"]["Tables"]["peak_assignments"]["Row"];

export type Instrument = InstrumentRow;

// D2 — method_type is a controlled_vocabularies value, checked against the
// live seed rows the same way material_role is (T2.2).
export type MethodType =
  | "lc_ms"
  | "nmr"
  | "ftir"
  | "microscopy"
  | "plate_reader"
  | "lumisizer"
  | "hplc"
  | "gc_ms"
  | "cd"
  | "epr"
  | "tga";
export const METHOD_TYPES: MethodType[] = [
  "lc_ms",
  "nmr",
  "ftir",
  "microscopy",
  "plate_reader",
  "lumisizer",
  "hplc",
  "gc_ms",
  "cd",
  "epr",
  "tga",
];
export type InstrumentMethod = Omit<InstrumentMethodRow, "method_type" | "parameters"> & {
  method_type: MethodType;
  parameters: Record<string, unknown>;
};

// D3 — status is a controlled_vocabularies value ("analysis_status", §23.4).
export type AnalysisRun = Omit<AnalysisRunRow, "run_parameters"> & {
  run_parameters: Record<string, unknown>;
};

export type AnalysisFileRole = "raw" | "processed" | "report";
export type AnalysisFile = Omit<AnalysisFileRow, "file_role"> & { file_role: AnalysisFileRole };

// D5 — result_confidence is a controlled_vocabularies value ("result_confidence",
// §23.6); details holds each method's interpreted-result fields, keyed by the
// parent run's instrument_method.method_type.
export type AnalysisResult = Omit<AnalysisResultRow, "details"> & {
  details: Record<string, unknown>;
};

// D6 — confidence is a distinct, per-peak controlled_vocabularies value
// ("assignment_confidence", §14.1) from AnalysisResult's own result_confidence.
export type IonMode = "positive" | "negative";
export type PeakAssignment = Omit<PeakAssignmentRow, "ion_mode"> & { ion_mode: IonMode | null };

// T2.6 — prebiotic condition programs & controls.
type ConditionProgramTemplateRow = Database["public"]["Tables"]["condition_program_templates"]["Row"];
type BatchConditionProgramRow = Database["public"]["Tables"]["batch_condition_programs"]["Row"];
type ConditionProgramCycleRow = Database["public"]["Tables"]["condition_program_cycles"]["Row"];
type EnvironmentalConditionsRow = Database["public"]["Tables"]["environmental_conditions"]["Row"];
type ControlRow = Database["public"]["Tables"]["controls"]["Row"];

// D1 — a reusable definition (quantities: wet_temperature/dry_temperature/
// wet_duration/dry_duration/starting_volume/rehydration_volume).
export type ConditionProgramTemplate = Omit<ConditionProgramTemplateRow, "quantities"> & {
  quantities: Record<string, Quantity>;
};

// D1 — a frozen per-batch instance; editing the source template afterward
// never changes an already-applied instance (mirrors T1.5's protocol
// version freeze).
export type BatchConditionProgram = Omit<BatchConditionProgramRow, "quantities"> & {
  quantities: Record<string, Quantity>;
};

// D2 — one row per actual cycle (Standard §9.3's worked table). quantities
// holds cycle_wet_volume/aliquot_volume; deviation is a documented-shape
// jsonb (gap G1), same convention as sample_events.details.
export type ConditionProgramCycle = Omit<ConditionProgramCycleRow, "quantities" | "deviation"> & {
  quantities: Record<string, Quantity>;
  deviation: Record<string, unknown>;
};

// D3 — one row per batch; quantities holds buffer_concentration.
// custom_fields is the audit's explicit open-ended-fields instruction.
export type EnvironmentalConditions = Omit<EnvironmentalConditionsRow, "quantities" | "custom_fields"> & {
  quantities: Record<string, Quantity>;
  custom_fields: Record<string, unknown>;
};

// D4 — control_type is a controlled_vocabularies value (§8.5, 7 values),
// checked against the live seed rows the same way material_role is (T2.2).
// Which experiment(s) this control validates is recorded via T1.7's
// existing experiment_relationships 'control_for' type, not a new table.
export type ControlType =
  | "blank"
  | "no_catalyst"
  | "no_heat"
  | "single_component"
  | "positive"
  | "technical_replicate"
  | "independent_replicate";
export const CONTROL_TYPES: ControlType[] = [
  "blank",
  "no_catalyst",
  "no_heat",
  "single_component",
  "positive",
  "technical_replicate",
  "independent_replicate",
];
export type Control = Omit<ControlRow, "control_type"> & { control_type: ControlType };
