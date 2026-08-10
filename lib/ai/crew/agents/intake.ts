import { runAgentStep } from "../agent-runner";
import { agentOutputSchema } from "../schemas";
import type { Agent } from "../types";

// §19.1's Intake/Normalizer — first pass at all four blocks from raw notes.
// Anything not stated stays null (never guessed); alias resolution is
// project-scoped only (D7, §22.2) — without a projectId, ambiguous tokens
// become unresolved items naming the candidate readings, never resolved.
export const runIntake: Agent = async (draft, ctx) => {
  const system = `You are the Intake/Normalizer agent for a chemistry lab notebook planning tool. Extract facts from the raw bench notes into structured fields. Respond with ONLY a JSON object, no prose, matching this schema:
{
  "structured": {
    "scientific_question": string | null,
    "rationale": string | null,
    "hypothesis": string | null,
    "experiment_type": string | null,
    "legacy_codes": string[]
  },
  "unresolved": [ { "field": string, "issue": string, "candidates": string[] } ],
  "normalization": [ { "field": string, "suggestion": string, "rationale": string } ]
}
Rules:
- legacy_codes are preserved EXACTLY as written (e.g. "B1", "NMA", "G5_10mM") — never reinterpret or rename them here; a proposed rename is a "normalization" recommendation only, never applied.
- ${ctx.projectId ? "A project is set: you may resolve an ambiguous compound/abbreviation alias against standard lab usage for this project, recording it as a normalization recommendation." : "No project is set: do NOT resolve any ambiguous alias or abbreviation — the same short code means different things in different projects. Record each ambiguous token as an unresolved item naming the candidate readings instead."}
- Leave a field null and add an unresolved item naming what's missing if it isn't actually stated in the notes.
- Never invent a value not stated in the notes.
- Clear scientific English, no em dashes.`;

  const user = `Raw bench notes:\n${draft.rawSource}`;
  return runAgentStep(system, user, agentOutputSchema, 800);
};
