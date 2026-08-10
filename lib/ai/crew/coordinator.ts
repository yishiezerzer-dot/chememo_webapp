import { formatEvidenceBlock } from "@/lib/llm";
import { retrieveRecords } from "@/lib/rag";
import { runIntake } from "./agents/intake";
import { runDesign } from "./agents/design";
import { runControls } from "./agents/controls";
import { runCritic } from "./agents/critic";
import { EMPTY_PLAN_FIELDS, type Agent, type AgentName, type CrewContext, type CrewDraft } from "./types";

// D3 — the coordinator sequences four agents over one shared draft; the
// caller (the API route) holds ONE concurrency slot for the whole run, not
// one per agent — a crew run is one logical request that happens to make
// several provider calls. Agents run in a fixed order (each reads what the
// previous produced) — Intake → Design → Controls → Critic, never parallel.
const STEPS: { name: AgentName; run: Agent }[] = [
  { name: "intake", run: runIntake },
  { name: "design", run: runDesign },
  { name: "controls", run: runControls },
  { name: "critic", run: runCritic },
];

// Retrieval is best-effort grounding, not authoritative — a failure here
// (e.g. the router being unavailable) must never fail the whole crew run.
// A short topic query synthesized from the notes' own opening text stands
// in for retrieveRecords' expected natural-language question.
async function buildGroundingText(rawSource: string): Promise<string> {
  try {
    const topicQuery = rawSource.slice(0, 200);
    const retrieved = await retrieveRecords(topicQuery);
    const blocks = retrieved.records.slice(0, 5).map((r, i) => {
      const ev = retrieved.evidence.get(r.id);
      const content = ev?.content ?? r.name;
      return formatEvidenceBlock(`P${i + 1}`, `Prior experiment ${r.id}`, content);
    });
    if (blocks.length === 0) return "";
    return `Prior-experiment evidence excerpts, for reference only:\n${blocks.join("\n\n")}`;
  } catch {
    return "";
  }
}

export async function runCrew(
  rawSource: string,
  projectId: string | null,
  withGrounding: boolean
): Promise<CrewDraft> {
  let draft: CrewDraft = {
    rawSource,
    structured: { ...EMPTY_PLAN_FIELDS },
    unresolved: [],
    normalization: [],
    provenance: {},
    failedAgents: [],
  };

  const groundingText = withGrounding ? await buildGroundingText(rawSource) : "";
  const ctx: CrewContext = { projectId, groundingText };

  for (const step of STEPS) {
    const result = await step.run(draft, ctx);
    if (!result) {
      draft = { ...draft, failedAgents: [...draft.failedAgents, step.name] };
      continue;
    }

    const provenance = { ...draft.provenance };
    const structured = { ...draft.structured };
    if (result.structured) {
      for (const [key, value] of Object.entries(result.structured)) {
        if (value === null || value === undefined) continue;
        if (Array.isArray(value) && value.length === 0) continue;
        (structured as Record<string, unknown>)[key] = value;
        provenance[key as keyof typeof provenance] = step.name;
      }
    }

    draft = {
      ...draft,
      structured,
      unresolved: [...draft.unresolved, ...(result.unresolved ?? [])],
      normalization: [...draft.normalization, ...(result.normalization ?? [])],
      provenance,
    };
  }

  return draft;
}
