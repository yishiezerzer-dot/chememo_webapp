import { z } from "zod";
import { METHOD_OPTIONS, type QuantityKind, type SampleMatrixRow } from "@/lib/types";

// T1.2 §8.2 sample-matrix row and §8.5 control checklist item. All 19
// columns are free-text strings (no unit typing yet — T1.4); sample_id is
// allowed blank because a template default or a fresh clone has none yet
// (T1.2 D2/D6) — it's filled in only once the record is actually created.
const sampleMatrixRowSchema = z.object({
  sample_id: z.string().trim().max(60),
  vial_label: z.string().trim().max(60),
  legacy_code: z.string().trim().max(60),
  batch: z.string().trim().max(60),
  replicate: z.string().trim().max(60),
  sample_type: z.string().trim().max(100),
  component_1: z.string().trim().max(200),
  amount_1: z.string().trim().max(60),
  component_2: z.string().trim().max(200),
  amount_2: z.string().trim().max(60),
  ratio: z.string().trim().max(60),
  initial_volume: z.string().trim().max(60),
  reaction_mode: z.string().trim().max(100),
  temperature: z.string().trim().max(60),
  duration: z.string().trim().max(60),
  atmosphere: z.string().trim().max(100),
  treatment: z.string().trim().max(300),
  planned_analysis: z.string().trim().max(300),
  status: z.string().trim().max(100),
});

const controlItemSchema = z.object({
  label: z.string().trim().min(1).max(300),
  checked: z.boolean(),
});

// T1.4 D1 — one structured physical/concentration value. unit_code is
// checked against its kind's compatible_units by validateQuantityUnits
// below, not here — same reason sample_type isn't checked inline in
// sampleMatrixRowSchema (the allow-list is runtime, per-request data).
const quantitySchema = z.object({
  value: z.number({ invalid_type_error: "Value must be a number." }),
  unit_code: z.string().trim().min(1).max(30),
  uncertainty: z.number().optional(),
  qualifier: z.string().trim().max(200).optional(),
});

// Shared client/server validation for the experiment form (T0.1).
// concentration/temperature are deliberately absent (T1.4 D4) — they're
// legacy/display-only now; new structured values go in `quantities` instead.
export const experimentInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(300, "Name is too long (max 300 characters)."),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")
    .nullable(),
  researcher: z.string().trim().max(200, "Too long (max 200 characters).").nullable(),
  project: z.string().trim().max(60).nullable(),
  reaction_type: z.string().trim().max(200, "Too long (max 200 characters).").nullable(),
  compounds: z.array(z.string().trim().max(100)).max(50, "Too many compounds."),
  metals: z.array(z.string().trim().max(100)).max(50, "Too many metals."),
  ph: z
    .number({ invalid_type_error: "pH must be a number." })
    .min(-2, "pH must be between -2 and 16.")
    .max(16, "pH must be between -2 and 16.")
    .nullable(),
  cycles: z
    .number({ invalid_type_error: "Cycles must be a number." })
    .int("Cycles must be a whole number.")
    .min(0, "Cycles cannot be negative.")
    .nullable(),
  methods: z.array(z.enum(METHOD_OPTIONS)),
  mz: z
    .array(z.number({ invalid_type_error: "m/z values must be numbers." }).positive("m/z values must be positive."))
    .max(200, "Too many m/z values."),
  observations: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  notes: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),

  // T1.1 §8.1 narrative sections (C2) and §8.6 acceptance criteria. Status
  // itself is never in this schema (D10) — it moves only through lifecycle-actions.ts.
  scientific_question: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  rationale: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  hypothesis: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  primary_outcome: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  secondary_outcomes: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  data_analysis_plan: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  risks_failure_modes: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  conclusion: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  next_steps: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  acceptance_criteria: z.string().trim().max(4000, "Too long (max 4000 characters).").nullable(),
  planned_start_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, "Enter a valid date and time.")
    .nullable(),
  planned_end_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, "Enter a valid date and time.")
    .nullable(),

  // T1.2 §8.1 sections deferred by T1.1's C2. Structured units aren't built
  // yet (T1.4), so every field here is free text (T1.2 D1).
  independent_variables: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  controlled_variables: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  // T1.5 D4 — protocol_version (free text) is superseded by a real FK;
  // legacy/display-only now, same reasoning as concentration/temperature (T1.4 D4).
  protocol_version_id: z.string().trim().min(1).nullable(),
  planned_analyses: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  sample_storage_plan: z.string().trim().max(20000, "Too long (max 20000 characters).").nullable(),
  // §8.2's 19-column sample matrix (T1.2 D2). sample_type/reaction_mode/status
  // are meant to hold controlled_vocabularies values, but that allow-list is
  // runtime data fetched per-request, not something a static schema object
  // can check — see validateSampleMatrixVocab below, called separately by the
  // action after this schema parses successfully.
  sample_matrix: z.array(sampleMatrixRowSchema).max(500, "Too many sample rows."),
  // §8.5 control checklist (T1.2 D3).
  controls: z.array(controlItemSchema).max(100, "Too many control items."),
  // T1.4 D1 — a map of quantity_kind key -> Quantity. Legacy temperature/
  // concentration text fields above are untouched (D4); this is new
  // structured data only. Kind/unit membership checked by
  // validateQuantityUnits below (runtime allow-list, not a static schema).
  quantities: z.record(z.string(), quantitySchema),
});

export type ExperimentInputParsed = z.infer<typeof experimentInputSchema>;

// T1.2 D2 — sample_type/reaction_mode/status should each be a
// controlled_vocabularies value (§23.1/§23.2/§23.3), checked against the
// live seed-table rows rather than a hardcoded literal union (G11: the
// vocabulary is meant to change via an UPDATE, not a code deploy). Returns
// the first field error found, or null if every row is valid; empty strings
// pass (an unset cell isn't a wrong vocabulary value, just an unfilled one).
export function validateSampleMatrixVocab(
  rows: SampleMatrixRow[],
  allowed: { sampleTypes: string[]; reactionModes: string[]; sampleStatuses: string[] }
): string | null {
  for (const row of rows) {
    if (row.sample_type && !allowed.sampleTypes.includes(row.sample_type)) {
      return `"${row.sample_type}" is not a recognized sample type.`;
    }
    if (row.reaction_mode && !allowed.reactionModes.includes(row.reaction_mode)) {
      return `"${row.reaction_mode}" is not a recognized reaction mode.`;
    }
    if (row.status && !allowed.sampleStatuses.includes(row.status)) {
      return `"${row.status}" is not a recognized sample status.`;
    }
  }
  return null;
}

// T1.4 D2/D7 — each quantity's key must be a real, active quantity_kind, and
// its unit_code must be one of that kind's compatible_units. Checked against
// the live registry rather than a hardcoded literal union, matching T1.2
// D2's validateSampleMatrixVocab precedent (the registry is meant to change
// via an UPDATE, not a code deploy). Returns the first error found, or null.
export function validateQuantityUnits(
  quantities: Record<string, { value: number; unit_code: string }>,
  kinds: QuantityKind[]
): string | null {
  const byKey = new Map(kinds.map((k) => [k.key, k]));
  for (const [key, q] of Object.entries(quantities)) {
    const kind = byKey.get(key);
    if (!kind) return `"${key}" is not a recognized quantity.`;
    if (!kind.compatible_units.includes(q.unit_code)) {
      return `"${q.unit_code}" is not a valid unit for ${kind.label}.`;
    }
  }
  return null;
}

// T1.5 D7 — a deviation's category must be one of the 20 §11.1 values, seeded
// as controlled_vocabularies rows (vocabulary "deviation_category") rather
// than a new table or enum — same live-registry check as validateQuantityUnits.
export function validateDeviationCategory(category: string, allowed: string[]): string | null {
  if (!allowed.includes(category)) {
    return `"${category}" is not a recognized deviation category.`;
  }
  return null;
}

// T2.2 D4/D3 — material_role, output_role, and solubility_status are all
// controlled_vocabularies values (§7.6, §23.5), checked against the live
// seed rows the same way deviation_category is above.
export function validateMaterialRole(role: string, allowed: string[]): string | null {
  if (!allowed.includes(role)) {
    return `"${role}" is not a recognized material role.`;
  }
  return null;
}

export function validateOutputRole(role: string, allowed: string[]): string | null {
  if (!allowed.includes(role)) {
    return `"${role}" is not a recognized output role.`;
  }
  return null;
}

export function validateSolubilityStatus(status: string, allowed: string[]): string | null {
  if (!allowed.includes(status)) {
    return `"${status}" is not a recognized solubility status.`;
  }
  return null;
}

export const projectLabelSchema = z
  .string()
  .trim()
  .min(1, "Enter a project name.")
  .max(60, "Name is too long (max 60 characters).");

// Flattens a ZodError into the first message per top-level field, matching
// ActionResult.fieldErrors (a flat Record<string, string>).
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
