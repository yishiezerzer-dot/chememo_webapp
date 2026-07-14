import type { SearchFilters } from "@/lib/search";
import { METHOD_OPTIONS, type Experiment, type ExperimentInput } from "@/lib/types";

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

// Grounded single-experiment summary: 2–3 sentences from ONLY this record's
// fields. Returns null when disabled (no key).
export async function summarizeExperiment(e: Experiment): Promise<string | null> {
  if (!isLlmEnabled()) return null;

  const system = `You summarise a single chemistry experiment using ONLY the fields provided. Rules:
- 2–3 sentences, plain and specific.
- Use only values present in the record; never invent compounds, pH, m/z, or results.
- No preamble ("This experiment…") — state the substance directly.`;

  const client = await getClient();
  const res = await client.messages.create({
    model: ANSWER_MODEL,
    max_tokens: 300,
    system,
    messages: [{ role: "user", content: formatRecord(e) }],
  });
  return firstText(res).trim() || null;
}

// LLM-assisted entry: extract structured fields from messy pasted notes. Only
// fields actually stated are returned; the user always confirms before saving.
// Returns null when disabled (no key) or unparseable.
export async function extractExperimentFields(
  notes: string
): Promise<Partial<ExperimentInput> | null> {
  if (!isLlmEnabled()) return null;

  const system = `Extract structured fields from a chemist's messy experiment notes. Respond with ONLY a JSON object; omit any field you cannot determine (do NOT guess). Never invent values.
Fields:
{
  "name": string,            // short descriptive title
  "date": string,            // ISO "YYYY-MM-DD" if a date is stated
  "researcher": string,
  "reaction_type": string,
  "compounds": string[],     // full names, e.g. "Zinc chloride"
  "metals": string[],        // element symbols, e.g. "Zn"
  "ph": number,
  "concentration": string,
  "temperature": string,
  "cycles": number,
  "methods": string[],       // only from: ${METHOD_OPTIONS.join(", ")}
  "mz": number[],
  "observations": string,
  "notes": string
}`;

  try {
    const client = await getClient();
    const res = await client.messages.create({
      model: ANSWER_MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: notes }],
    });
    const raw = firstText(res).trim().replace(/^```json\s*|\s*```$/g, "");
    const j = JSON.parse(raw);
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string") : undefined);
    const numArr = (v: unknown) =>
      Array.isArray(v) ? v.filter((x) => typeof x === "number" && Number.isFinite(x)) : undefined;

    const out: Partial<ExperimentInput> = {};
    if (str(j.name)) out.name = str(j.name);
    if (str(j.date)) out.date = str(j.date) ?? null;
    if (str(j.researcher)) out.researcher = str(j.researcher) ?? null;
    if (str(j.reaction_type)) out.reaction_type = str(j.reaction_type) ?? null;
    if (arr(j.compounds)) out.compounds = arr(j.compounds);
    if (arr(j.metals)) out.metals = arr(j.metals);
    if (num(j.ph) !== undefined) out.ph = num(j.ph) ?? null;
    if (str(j.concentration)) out.concentration = str(j.concentration) ?? null;
    if (str(j.temperature)) out.temperature = str(j.temperature) ?? null;
    if (num(j.cycles) !== undefined) out.cycles = num(j.cycles) ?? null;
    if (arr(j.methods)) out.methods = arr(j.methods)!.filter((m) => (METHOD_OPTIONS as readonly string[]).includes(m));
    if (numArr(j.mz)) out.mz = numArr(j.mz);
    if (str(j.observations)) out.observations = str(j.observations) ?? null;
    if (str(j.notes)) out.notes = str(j.notes) ?? null;
    return out;
  } catch {
    return null;
  }
}
