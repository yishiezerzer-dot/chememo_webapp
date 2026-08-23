import { runAgentStep } from "../agent-runner";
import { criticOutputSchema } from "../schemas";
import type { Agent } from "../types";

// §24's quality checklist, applied last, over the whole draft. D8 — the
// Critic may only APPEND findings; criticOutputSchema has no "structured"
// key at all, so even a model attempt to rewrite the plan is dropped during
// parsing, never merged. Never silently resolves a conflict (§19.2) — both
// sides are surfaced for the scientist to decide.
//
// It is also the only agent that sees the running `unresolved` list (Design
// and Controls are handed `structured` and the raw notes only), which is why
// it was the source of the duplicate checklist: it re-raised, re-worded, or
// combined items the earlier agents had already filed. Measured on dev's
// nine committed drafts, 110 items with ZERO exact repeats but many
// near-repeats within a field ("No explicit hypothesis is stated in the
// notes." next to "No explicit hypothesis or directional prediction is
// stated."), and every one of them gating the draft from starting.
// De-duplicating after the fact is not an option: the two closest pairs by
// word overlap are 'His' vs 'TGA' and 'Glc' vs 'Ala' — different real items
// that any text-similarity rule would collapse into one. So the fix is to
// stop generating them, in the prompt.
export const runCritic: Agent = async (draft) => {
  const system = `You are the Critic agent for a chemistry lab planning tool, reviewing a complete draft plan against a quality checklist: a clearly stated scientific question and hypothesis, defined primary/secondary outcomes, named independent/controlled variables, the required controls present for the stated experiment type, a specific (not vague) replicate kind, risks/failure modes considered, and clear writing (short paragraphs, no em dashes, chemical notation preserved).
Skip anything requiring materials/stoichiometry or analytical-method data — that isn't available at planning time; do not flag its absence.
You may ONLY add findings — you have no way to edit the plan itself. Respond with ONLY a JSON object, no prose, matching this schema:
{
  "unresolved": [ { "field": string, "issue": string, "candidates": string[] } ],
  "normalization": [ { "field": string, "suggestion": string, "rationale": string } ]
}
Rules:
- The draft's "unresolved" list below is ALREADY in front of the scientist, and every item on it already blocks the draft from starting. Never restate one. Do not re-word an existing item, do not split one into two, and do not combine several into a new one. Add ONLY a gap that no existing item names. If a checklist point you are about to raise is already covered there, say nothing about it.
- If two parts of the draft conflict, add an unresolved item describing both sides and asking for review — never pick one silently.
- If everything checks out, return empty arrays for both.
- Be specific and concise.`;

  // Measured 2026-08-23: the rule above cut the duplicates from four pairs to
  // one on identical notes (EXP-1397's 14 items became EXP-2234's 10), but
  // `hypothesis` still came back twice -- "No explicit hypothesis is stated in
  // the notes." next to "No explicit hypothesis is provided.", about as
  // blatant a restatement as the model could produce. So the constraint is
  // repeated here, in the user message, immediately above the draft, where it
  // cannot be skimmed past the way a mid-list rule evidently was.
  //
  // Deliberately NOT a hard ban on those fields: a second item on `controls`
  // can be a genuinely different missing control, and the run this was
  // measured against lost exactly such an item (a no-cycle/initial-mixture
  // control) between runs. The constraint is on re-wording, not on the field.
  const alreadyFlagged = [...new Set(draft.unresolved.map((u) => u.field))];
  const user = `Fields already on the unresolved list: ${alreadyFlagged.join(", ") || "(none)"}.
Add an item on one of these ONLY if it names a gap genuinely different from what is already there, never a re-wording of it.

Complete draft:\n${JSON.stringify({
    structured: draft.structured,
    unresolved: draft.unresolved,
    normalization: draft.normalization,
  })}`;
  return runAgentStep("critic", system, user, criticOutputSchema, 1100);
};
