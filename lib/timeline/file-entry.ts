import "server-only";
import { z } from "zod";
import { runAgentStep } from "@/lib/ai/agent-runner";
import { isLlmEnabled, EVIDENCE_IS_DATA_RULE, sanitizeEvidenceContent } from "@/lib/llm";
import { classifyLogText } from "@/lib/timeline/classify";
import { TIMELINE_EVENT_TYPES, type TimelineEventType } from "@/lib/timeline/event-types";

// Turning what a scientist said into entries the notebook can order.
//
// A bench sentence is usually several events at once — "took it out of the
// freezer, spun it down, resuspended in 200 uL" is a thaw, a measurement and a
// preparation. Filed as one row it is a paragraph you have to re-read; filed
// as three it is a record you can sort, filter and compare across experiments,
// which is the whole reason for having a log rather than a notes field.
//
// THE RULE THIS FILE EXISTS UNDER: the scientist's own words are never at risk.
// The caller writes the raw sentence to the log the moment anything here fails
// — no key, rate limited, provider down, unparseable response. The AI decides
// how well the sentence is *organised*, never whether it is *kept*.

export type ProposedEntry = {
  /** Client-side identity for the review list; never reaches the database. */
  id: string;
  eventType: TimelineEventType;
  action: string | null;
  observation: string | null;
  nextAction: string | null;
  deviationNote: string | null;
  subjectLabel: string | null;
};

const proposalSchema = z.object({
  entries: z
    .array(
      z.object({
        // z.enum over the same list the DB CHECK enforces. A model asked for an
        // event type will eventually return one that is not in the vocabulary,
        // and that must fail here rather than at the database.
        event_type: z.enum(TIMELINE_EVENT_TYPES),
        action: z.string().trim().max(2000).nullable(),
        observation: z.string().trim().max(2000).nullable(),
        next_action: z.string().trim().max(2000).nullable(),
        deviation_note: z.string().trim().max(2000).nullable(),
        subject_label: z.string().trim().max(200).nullable(),
      })
    )
    .min(1)
    .max(8),
});

const SYSTEM = `You split a lab scientist's note into chronological log entries for an electronic lab notebook.

${EVIDENCE_IS_DATA_RULE}

Rules, in order of importance:
1. NEVER invent anything. Every word you emit must be traceable to the note. If the note does not say a temperature, there is no temperature.
2. Split only where the note genuinely describes separate actions. One action is one entry. Do not pad a short note into several entries.
3. Keep the scientist's own wording. You are re-filing their sentence, not rewriting it. Correct nothing — not spelling, not units, not chemistry.
4. Separate what was DONE (action) from what was SEEN (observation). A measured value is an observation. This separation is required by the lab's standard; do not merge them.
5. next_action is only for something the note says will happen later. deviation_note is only for something that went wrong.
6. subject_label is the sample, vial or batch the note names, copied verbatim. Null if it names none.
7. Choose event_type from the allowed list. If nothing fits, use "observed" — that is what it is for. Never force a closer-sounding type.

Respond with ONLY a JSON object: {"entries":[{"event_type","action","observation","next_action","deviation_note","subject_label"}]}`;

// One provider call per utterance, matching how the crew held a single
// concurrency slot across a whole run. The rate limiter allows one in-flight
// request per user, so anything chattier than this is unusable by design.
export async function proposeEntries(
  text: string,
  context: { experimentName: string; recentEntries: string[] }
): Promise<ProposedEntry[] | null> {
  if (!isLlmEnabled()) return null;

  const user = [
    `Experiment: ${sanitizeEvidenceContent(context.experimentName)}`,
    context.recentEntries.length
      ? `Recently logged (for context only — do not re-file these):\n${context.recentEntries
          .slice(0, 5)
          .map((e) => `- ${sanitizeEvidenceContent(e)}`)
          .join("\n")}`
      : "",
    `The note to file:\n${sanitizeEvidenceContent(text)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await runAgentStep("timeline/file-entry", SYSTEM, user, proposalSchema, 900);
  if (!result) return null;

  const entries = result.entries
    .map((e, i) => ({
      id: `p${i}`,
      eventType: e.event_type,
      action: nullIfBlank(e.action),
      observation: nullIfBlank(e.observation),
      nextAction: nullIfBlank(e.next_action),
      deviationNote: nullIfBlank(e.deviation_note),
      subjectLabel: nullIfBlank(e.subject_label),
    }))
    // An entry with nothing in it would fail the table's own CHECK anyway;
    // dropping it here keeps a useless row out of the review list.
    .filter((e) => e.action || e.observation || e.nextAction || e.deviationNote);

  return entries.length > 0 ? entries : null;
}

// What the composer proposes with no model available: the classifier's reading,
// as a single entry. Identical shape, so the review step is the same code and
// the keyless path is never a different, lesser UI.
export function proposeEntriesDeterministically(text: string): ProposedEntry[] {
  const c = classifyLogText(text);
  return [
    {
      id: "p0",
      eventType: c.eventType,
      action: null,
      observation: text.trim(),
      nextAction: null,
      deviationNote: null,
      subjectLabel: c.subjects[0] ?? null,
    },
  ];
}

const nullIfBlank = (v: string | null): string | null => {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
};
