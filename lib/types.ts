import type { Database } from "@/lib/database.types";

// Table-shaped types are sourced from the generated schema (`npm run types:gen`)
// so a migration that adds/renames/removes a column surfaces as a type error
// here instead of silently drifting the way the handwritten copies did before
// (this project already hit that once, adding `owner_id` by hand).
type ExperimentRow = Database["public"]["Tables"]["experiments"]["Row"];
type ExperimentFileRow = Database["public"]["Tables"]["experiment_files"]["Row"];
type ExperimentRevisionRow =
  Database["public"]["Tables"]["experiment_revisions"]["Row"];

export type Project = Database["public"]["Tables"]["projects"]["Row"];

// Result shape for user-facing server actions so the client can toast a
// friendly message instead of throwing to the error boundary.
export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

// experiments.compounds/metals/methods/mz and created_at/updated_at are
// nullable at the DB level (no NOT NULL constraint) but every write path sets
// them (`default '{}'` / `now()`, never written null) — narrowed here to match
// that real invariant instead of forcing null-checks the app never needs.
export type Experiment = Omit<
  ExperimentRow,
  "compounds" | "metals" | "methods" | "mz" | "created_at" | "updated_at"
> & {
  compounds: string[];
  metals: string[];
  methods: string[];
  mz: number[];
  created_at: string;
  updated_at: string;
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
