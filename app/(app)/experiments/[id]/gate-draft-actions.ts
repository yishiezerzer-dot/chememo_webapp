"use server";

import { requireUser } from "@/lib/authorization/policies";
import { getExperiment } from "@/lib/experiments/service";
import { listTimeline } from "@/lib/timeline/service";
import { acquireAiSlot, logAiRequest } from "@/lib/ai/service";
import { suggestFieldsFromRecordText } from "@/lib/llm";
import { logError } from "@/lib/logger";

// Drafts an answer to one of the two lifecycle gate questions, from what the
// experiment already knows.
//
// Returns the text and writes NOTHING. The scientist reads it in the box they
// were already typing in, edits it, and presses the button themselves — the
// answer to "how will you know this worked" is a commitment, and a commitment
// nobody consciously made is worthless. §18.6's line is the same: AI proposes,
// the scientist decides.
//
// For the conclusion this is genuinely useful rather than decorative: the log
// holds everything that happened, so summarising it is exactly the job a model
// is good at, and the scientist is reviewing a summary of their own words.
export async function draftGateAnswerAction(
  experimentId: string,
  field: "acceptance_criteria" | "conclusion"
): Promise<string | null> {
  const { user } = await requireUser();

  const result = await getExperiment(experimentId);
  if (!result) return null;
  const e = result.experiment;

  // The log is the context that matters. For acceptance criteria there is
  // usually little of it yet, which is correct — criteria are written before
  // the work, so the draft leans on the plan instead.
  const log = await listTimeline(experimentId);
  const logText = log
    .slice(0, 30)
    .reverse()
    .map((t) => `- ${[t.action, t.observation, t.deviation_note].filter(Boolean).join(" — ")}`)
    .join("\n");

  const record = [
    `[${e.id}] ${e.name}`,
    e.reaction_type ? `Reaction type: ${e.reaction_type}` : null,
    e.compounds.length ? `Compounds: ${e.compounds.join(", ")}` : null,
    e.metals.length ? `Metals: ${e.metals.join(", ")}` : null,
    e.ph !== null ? `pH: ${e.ph}` : null,
    field === "conclusion" && e.acceptance_criteria
      ? `The criteria set before starting: ${e.acceptance_criteria}`
      : null,
    logText ? `Execution log:\n${logText}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let slot: { release: () => void };
  try {
    slot = await acquireAiSlot(user.id);
  } catch {
    // Rate limited. The box stays empty and the scientist writes it themselves,
    // which is the normal path anyway.
    return null;
  }

  const started = Date.now();
  try {
    const suggestions = await suggestFieldsFromRecordText(record, [field]);
    const value = suggestions?.find((s) => s.field === field)?.suggestedValue ?? null;

    void logAiRequest({
      userId: user.id,
      endpoint: "gap_scan",
      status: value ? "ok" : "error",
      sourceCount: value ? 1 : 0,
      latencyMs: Date.now() - started,
      estTokens: null,
    }).catch((err) => logError("gate-draft", "ai_requests insert failed", { error: err }));

    return value;
  } finally {
    slot.release();
  }
}
