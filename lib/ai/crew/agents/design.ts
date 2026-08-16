import { EVIDENCE_IS_DATA_RULE } from "@/lib/llm";
import { runAgentStep } from "../agent-runner";
import { agentOutputSchema } from "../schemas";
import type { Agent } from "../types";

// §8.1's narrative planning sections. Grounding (prior experiments, when
// retrieval is on) is historical content from any workspace member — T3.5's
// exact threat model — so it's wrapped in the same hardened evidence-block
// instruction the Ask pipeline uses, never trusted as instructions.
export const runDesign: Agent = async (draft, ctx) => {
  const system = `You are the Design agent for a chemistry lab planning tool. Fill in experimental design sections using ONLY the structured facts and raw notes given below${ctx.groundingText ? ", referencing prior-experiment evidence excerpts where directly relevant" : ""}. Respond with ONLY a JSON object, no prose, matching this schema:
{
  "structured": {
    "scientific_question": string | null,
    "rationale": string | null,
    "hypothesis": string | null,
    "primary_outcomes": string | null,
    "secondary_outcomes": string | null,
    "independent_variables": string | null,
    "controlled_variables": string | null,
    "data_analysis_plan": string | null,
    "risks": string | null
  },
  "unresolved": [ { "field": string, "issue": string, "candidates": string[] } ],
  "normalization": [ { "field": string, "suggestion": string, "rationale": string } ]
}
${ctx.groundingText ? EVIDENCE_IS_DATA_RULE : ""}
Rules:
- Only fill a field if it's actually determinable from the given material; otherwise leave it null and add an unresolved item naming what's missing.
- If a prior experiment is directly relevant (e.g. the same reaction was tried before), cite its experiment ID in the relevant field's text.
- Never invent a compound, condition, or result not present in the given material.
- Clear scientific English, short paragraphs, no em dashes, chemical notation preserved.`;

  const user = `Structured facts so far:\n${JSON.stringify(draft.structured)}\n\nRaw bench notes:\n${draft.rawSource}${
    ctx.groundingText ? `\n\n${ctx.groundingText}` : ""
  }`;
  return runAgentStep("design", system, user, agentOutputSchema, 1400);
};
