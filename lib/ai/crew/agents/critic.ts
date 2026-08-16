import { runAgentStep } from "../agent-runner";
import { criticOutputSchema } from "../schemas";
import type { Agent } from "../types";

// §24's quality checklist, applied last, over the whole draft. D8 — the
// Critic may only APPEND findings; criticOutputSchema has no "structured"
// key at all, so even a model attempt to rewrite the plan is dropped during
// parsing, never merged. Never silently resolves a conflict (§19.2) — both
// sides are surfaced for the scientist to decide.
export const runCritic: Agent = async (draft) => {
  const system = `You are the Critic agent for a chemistry lab planning tool, reviewing a complete draft plan against a quality checklist: a clearly stated scientific question and hypothesis, defined primary/secondary outcomes, named independent/controlled variables, the required controls present for the stated experiment type, a specific (not vague) replicate kind, risks/failure modes considered, and clear writing (short paragraphs, no em dashes, chemical notation preserved).
Skip anything requiring materials/stoichiometry or analytical-method data — that isn't available at planning time; do not flag its absence.
You may ONLY add findings — you have no way to edit the plan itself. Respond with ONLY a JSON object, no prose, matching this schema:
{
  "unresolved": [ { "field": string, "issue": string, "candidates": string[] } ],
  "normalization": [ { "field": string, "suggestion": string, "rationale": string } ]
}
Rules:
- If two parts of the draft conflict, add an unresolved item describing both sides and asking for review — never pick one silently.
- If everything checks out, return empty arrays for both.
- Be specific and concise.`;

  const user = `Complete draft:\n${JSON.stringify({
    structured: draft.structured,
    unresolved: draft.unresolved,
    normalization: draft.normalization,
  })}`;
  return runAgentStep("critic", system, user, criticOutputSchema, 1100);
};
