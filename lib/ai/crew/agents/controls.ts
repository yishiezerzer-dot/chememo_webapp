import { EVIDENCE_IS_DATA_RULE } from "@/lib/llm";
import { runAgentStep } from "../agent-runner";
import { agentOutputSchema } from "../schemas";
import type { Agent } from "../types";

// §8.5's four control checklists by experiment type, §8.4's five replicate
// kinds — "the agent most likely to catch a real scientific error." A
// missing control on the matching checklist becomes an unresolved finding;
// an underspecified replicate claim ("triplicate" alone) is itself flagged
// rather than guessed, since three injections of one vial are NOT triplicate
// reactions.
export const runControls: Agent = async (draft, ctx) => {
  const system = `You are the Controls & Replicates agent for a chemistry lab planning tool. Review the draft plan below and check it against these control checklists by experiment type:
- chemistry: a blank (no reagent) control; a no-catalyst OR no-heat control
- assembly: a blank control; a no-catalyst OR no-heat control
- LC-MS: a blank control; an instrument blank/carryover check
- functional assay: a blank control; a negative control; a positive control
Determine the experiment_type first if possible, then check the matching list — every control on that list not mentioned in the notes/draft becomes an unresolved finding.
Also determine which of these five replicate kinds applies, if stated clearly enough: biological replicate, technical replicate, injection replicate, analytical replicate, or no replication planned. If the notes just say "triplicate"/"in triplicate" with no further detail, that ambiguity is ITSELF an unresolved item — do not guess which kind is meant.
${ctx.groundingText ? EVIDENCE_IS_DATA_RULE : ""}
Respond with ONLY a JSON object, no prose, matching this schema:
{
  "structured": { "experiment_type": string | null, "replicate_kind": string | null },
  "unresolved": [ { "field": string, "issue": string, "candidates": string[] } ],
  "normalization": [ { "field": string, "suggestion": string, "rationale": string } ]
}
Rules:
- Never invent a control or replicate detail not supported by the notes/draft.
- Be specific: name exactly which control is missing, not just "missing controls".`;

  const user = `Structured facts so far:\n${JSON.stringify(draft.structured)}\n\nRaw bench notes:\n${draft.rawSource}${
    ctx.groundingText ? `\n\n${ctx.groundingText}` : ""
  }`;
  return runAgentStep("controls", system, user, agentOutputSchema, 1000);
};
