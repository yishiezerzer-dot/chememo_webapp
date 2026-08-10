import { z } from "zod";

// T3.7 D6 — zod-validated JSON per agent. One shared "partial plan fields"
// schema for Intake/Design/Controls (each only fills the subset it's
// responsible for; unfilled fields are simply absent, not defaulted to a
// guessed value). The Critic's schema deliberately has NO `structured` key
// at all (D8) — even if the model includes one in its JSON, zod's default
// non-strict object parsing drops any key not in the schema, so a Critic
// "edit" to the plan is discarded during parsing, never merged into the
// draft. This is D8 enforced at the schema level, not just by convention.

// `.default()`, not `.catch()` — see the note above `agentOutputSchema`:
// zod's `.catch()` type inference doesn't propagate cleanly through this
// nested shape in the installed zod version, and `.default()` gives the
// same practical benefit (a missing key degrades gracefully) while a truly
// malformed field still fails validation into the retry path, which is
// closer to D6's actual intent anyway.
const unresolvedItemSchema = z.object({
  field: z.string().default(""),
  issue: z.string().default(""),
  candidates: z.array(z.string()).default([]),
});

const recommendationSchema = z.object({
  field: z.string().default(""),
  suggestion: z.string().default(""),
  rationale: z.string().default(""),
});

const planFieldsPartialSchema = z
  .object({
    scientific_question: z.string().nullable(),
    rationale: z.string().nullable(),
    hypothesis: z.string().nullable(),
    primary_outcomes: z.string().nullable(),
    secondary_outcomes: z.string().nullable(),
    independent_variables: z.string().nullable(),
    controlled_variables: z.string().nullable(),
    data_analysis_plan: z.string().nullable(),
    risks: z.string().nullable(),
    experiment_type: z.string().nullable(),
    replicate_kind: z.string().nullable(),
    legacy_codes: z.array(z.string()),
  })
  .partial();

// D6 note: the array fields use `.default([])` (fills in only when the key
// is OMITTED entirely — a benign, common case) rather than `.catch([])` —
// a genuinely malformed array (wrong type, not just missing) fails
// validation and flows into the retry-once-then-fail-explicitly path
// instead of being silently swallowed, matching D6's own intent.
export const agentOutputSchema = z.object({
  structured: planFieldsPartialSchema.optional().default({}),
  unresolved: z.array(unresolvedItemSchema).default([]),
  normalization: z.array(recommendationSchema).default([]),
});
export type AgentOutput = z.infer<typeof agentOutputSchema>;

export const criticOutputSchema = z.object({
  unresolved: z.array(unresolvedItemSchema).default([]),
  normalization: z.array(recommendationSchema).default([]),
});
export type CriticOutput = z.infer<typeof criticOutputSchema>;
