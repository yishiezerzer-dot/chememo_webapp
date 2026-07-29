import { z } from "zod";
import { METHOD_OPTIONS } from "@/lib/types";

// Shared client/server validation for the experiment form (T0.1). Keep
// concentration/temperature as free text for now — structured units land in
// Tier 1 (T1.4); this only stops garbage from reaching the DB silently.
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
  concentration: z.string().trim().max(300, "Too long (max 300 characters).").nullable(),
  temperature: z.string().trim().max(300, "Too long (max 300 characters).").nullable(),
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
});

export type ExperimentInputParsed = z.infer<typeof experimentInputSchema>;

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
