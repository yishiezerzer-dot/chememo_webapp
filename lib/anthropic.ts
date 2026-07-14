import type { SearchFilters } from "@/lib/search";
import type { Experiment } from "@/lib/types";

// Phase 7 — Claude router + grounded answer generation. INERT until Phase 10:
// both entry points return null when ANTHROPIC_API_KEY is absent, so the app
// falls back to the deterministic keyless search.

export const ANSWER_MODEL = "claude-sonnet-5";

export function isLlmEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function getClient() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

export type RouteIntent = {
  mode: "filter" | "semantic" | "both";
  filters: SearchFilters;
  semanticQuery: string | null;
};

const EMPTY_FILTERS: SearchFilters = {
  compounds: [],
  metals: [],
  methods: [],
  mz: [],
  ph: null,
  reactionLike: null,
  freeText: [],
};

function firstText(res: { content: Array<{ type: string; text?: string }> }): string {
  const block = res.content.find((b) => b.type === "text");
  return block?.text ?? "";
}

// Ask Claude to turn the question into a retrieval plan. Structured/parametric
// intent → filters; fuzzy/free-text intent → semanticQuery. Returns null when
// disabled or if the model output can't be parsed (caller falls back to keyless).
export async function routeQuery(query: string): Promise<RouteIntent | null> {
  if (!isLlmEnabled()) return null;

  const system = `You are a retrieval router for a chemistry lab notebook. Convert the user's question into a JSON plan. Respond with ONLY a JSON object, no prose.
Schema:
{
  "mode": "filter" | "semantic" | "both",
  "compounds": string[],   // exact compound names, e.g. "Histidine"
  "metals": string[],      // element symbols, e.g. "Zn"
  "methods": string[],     // e.g. "NMR", "LC-MS/MS (neg)"
  "mz": number[],          // m/z peaks
  "ph": { "op": "gt"|"lt"|"gte"|"lte"|"eq", "value": number } | null,
  "reaction": string | null, // substring to match reaction_type, e.g. "cycling"
  "semanticQuery": string | null // free-text meaning for semantic search, e.g. "formed droplets"
}
Use "filter" for exact/parametric questions (pH, compound, metal, method, m/z), "semantic" for fuzzy descriptions ("looked cloudy", "droplets"), "both" when the question mixes them.`;

  try {
    const client = await getClient();
    const res = await client.messages.create({
      model: ANSWER_MODEL,
      max_tokens: 500,
      system,
      messages: [{ role: "user", content: query }],
    });
    const raw = firstText(res).trim().replace(/^```json\s*|\s*```$/g, "");
    const j = JSON.parse(raw);
    const filters: SearchFilters = {
      ...EMPTY_FILTERS,
      compounds: Array.isArray(j.compounds) ? j.compounds : [],
      metals: Array.isArray(j.metals) ? j.metals : [],
      methods: Array.isArray(j.methods) ? j.methods : [],
      mz: Array.isArray(j.mz) ? j.mz : [],
      ph: j.ph && typeof j.ph.value === "number" ? j.ph : null,
      reactionLike: j.reaction ? `%${j.reaction}%` : null,
    };
    const mode: RouteIntent["mode"] =
      j.mode === "semantic" || j.mode === "both" ? j.mode : "filter";
    return { mode, filters, semanticQuery: j.semanticQuery ?? null };
  } catch {
    return null;
  }
}

function formatRecord(e: Experiment): string {
  const f = (label: string, v: unknown) =>
    v && (!Array.isArray(v) || v.length) ? `${label}: ${Array.isArray(v) ? v.join(", ") : v}` : null;
  return [
    `[${e.id}] ${e.name}`,
    f("Reaction", e.reaction_type),
    f("Compounds", e.compounds),
    f("Metals", e.metals),
    f("pH", e.ph),
    f("Cycles", e.cycles),
    f("Methods", e.methods),
    f("m/z", e.mz),
    f("Observations", e.observations),
  ]
    .filter(Boolean)
    .join("\n");
}

// Grounded generation: answer ONLY from the provided records, with inline
// [EXP-###] citations. Returns null when disabled.
export async function generateAnswer(
  query: string,
  records: Experiment[]
): Promise<string | null> {
  if (!isLlmEnabled()) return null;
  if (records.length === 0) return "No matching experiments found.";

  const system = `You answer questions about a chemistry lab's experiments using ONLY the provided records. Rules:
- Cite every claim inline with the experiment ID in square brackets, e.g. [EXP-004].
- If the records do not contain the answer, reply exactly: "No matching experiments found."
- Never invent compounds, values, or results that are not in the records.
- Be concise and specific.`;

  const context = records.map(formatRecord).join("\n\n");
  const client = await getClient();
  const res = await client.messages.create({
    model: ANSWER_MODEL,
    max_tokens: 800,
    system,
    messages: [
      { role: "user", content: `Question: ${query}\n\nExperiment records:\n${context}` },
    ],
  });
  return firstText(res).trim() || null;
}
