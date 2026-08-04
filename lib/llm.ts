import type { SearchFilters } from "@/lib/search";
import { METHOD_OPTIONS, type Experiment, type ExperimentInput } from "@/lib/types";

// Provider-agnostic LLM layer. Switch via AI_PROVIDER (gemini | openai |
// anthropic); each provider's code path is kept so you can flip back instantly.
// INERT when the selected provider has no key: every entry point returns null
// and the app falls back to the deterministic keyless search.

type ChatProvider = "gemini" | "openai" | "anthropic";

function chatProvider(): ChatProvider {
  const p = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  return p === "openai" ? "openai" : p === "anthropic" ? "anthropic" : "gemini";
}

function chatKey(p: ChatProvider): string | undefined {
  if (p === "gemini") return process.env.GEMINI_API_KEY;
  if (p === "openai") return process.env.OPENAI_API_KEY;
  return process.env.ANTHROPIC_API_KEY;
}

export function activeChatModel(): string {
  const p = chatProvider();
  if (p === "gemini") return process.env.GEMINI_CHAT_MODEL || "gemini-flash-latest";
  if (p === "openai") return process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
}

export function isLlmEnabled(): boolean {
  return !!chatKey(chatProvider());
}

// Single completion. Returns trimmed text, or null when disabled.
async function chatComplete(opts: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string | null> {
  const p = chatProvider();
  const key = chatKey(p);
  if (!key) return null;
  const model = activeChatModel();

  if (p === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: [{ text: opts.user }] }],
          // Minimal thinking budget: these are extraction/answer tasks, not
          // reasoning, so we keep thinking small to avoid the model spending the
          // output budget on hidden thinking. Must be > 0 — the current
          // gemini-flash-latest (→ gemini-3.x) rejects thinkingBudget:0 with a
          // 400, unlike the 2.5-era model this was built against.
          generationConfig: {
            maxOutputTokens: opts.maxTokens,
            temperature: 0,
            thinkingConfig: { thinkingBudget: 128 },
          },
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`Gemini chat ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const j = await res.json();
    const parts = j?.candidates?.[0]?.content?.parts ?? [];
    const text = parts.map((x: { text?: string }) => x.text ?? "").join("").trim();
    return text || null;
  }

  if (p === "anthropic") {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });
    const res = await client.messages.create({
      model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    const block = res.content.find((b) => b.type === "text");
    const text = block && "text" in block ? block.text : "";
    return text.trim() || null;
  }

  // openai
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: key });
  const res = await client.chat.completions.create({
    model,
    max_tokens: opts.maxTokens,
    temperature: 0,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || null;
}

// Streaming completion. Yields text chunks as they arrive. Gemini streams via
// SSE; openai/anthropic fall back to yielding the full completion once (still
// correct, just not incremental). Yields nothing when disabled.
async function* chatStream(opts: {
  system: string;
  user: string;
  maxTokens: number;
}): AsyncGenerator<string> {
  const p = chatProvider();
  const key = chatKey(p);
  if (!key) return;
  const model = activeChatModel();

  if (p === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: opts.system }] },
          contents: [{ role: "user", parts: [{ text: opts.user }] }],
          generationConfig: {
            maxOutputTokens: opts.maxTokens,
            temperature: 0,
            // Must be > 0 for gemini-3.x (see chatComplete); 0 now returns 400.
            thinkingConfig: { thinkingBudget: 128 },
          },
        }),
        // Gemini occasionally accepts the connection but never sends a chunk;
        // without a deadline that hangs the reader (and the client) forever.
        signal: AbortSignal.timeout(30_000),
      }
    );
    if (!res.ok || !res.body) {
      throw new Error(`Gemini stream ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const j = JSON.parse(payload);
          const parts = j?.candidates?.[0]?.content?.parts ?? [];
          const t = parts.map((x: { text?: string }) => x.text ?? "").join("");
          if (t) yield t;
        } catch {
          // partial JSON across chunks is rare with line-framed SSE; skip
        }
      }
    }
    return;
  }

  // openai / anthropic: no incremental streaming here — yield the whole answer.
  const full = await chatComplete(opts);
  if (full) yield full;
}

const GROUNDED_SYSTEM = `You answer questions about a chemistry lab's experiments using ONLY the provided records. Rules:
- Cite every claim inline with the experiment ID in square brackets, e.g. [EXP-004].
- If the records do not contain the answer, reply exactly: "No matching experiments found."
- Never invent compounds, values, or results that are not in the records.
- Be concise and specific.`;

const GENERAL_SYSTEM = `You are a helpful, knowledgeable assistant for a prebiotic-chemistry research lab. The user's question did not match any of the lab's stored experiments, so answer from your own general knowledge.
- Be accurate and concise.
- Do NOT cite experiment IDs or claim anything about the lab's specific experiments.
- If the question is outside your knowledge or ambiguous, say so briefly.`;

// Streaming grounded answer (same prompt as generateAnswer).
export async function* streamAnswer(
  query: string,
  records: Experiment[]
): AsyncGenerator<string> {
  if (!isLlmEnabled() || records.length === 0) return;
  const context = records.map(formatRecord).join("\n\n");
  yield* chatStream({
    system: GROUNDED_SYSTEM,
    user: `Question: ${query}\n\nExperiment records:\n${context}`,
    maxTokens: 800,
  });
}

// Streaming general-knowledge answer (same prompt as generateGeneralAnswer).
export async function* streamGeneralAnswer(query: string): AsyncGenerator<string> {
  if (!isLlmEnabled()) return;
  yield* chatStream({ system: GENERAL_SYSTEM, user: query, maxTokens: 800 });
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

function parseJson(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text.trim().replace(/^```json\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
}

// Turn the question into a retrieval plan. Returns null when disabled or
// unparseable (caller falls back to keyless).
export async function routeQuery(query: string): Promise<RouteIntent | null> {
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

  const text = await chatComplete({ system, user: query, maxTokens: 500 });
  if (!text) return null;
  const j = parseJson(text);
  if (!j) return null;

  const filters: SearchFilters = {
    ...EMPTY_FILTERS,
    compounds: Array.isArray(j.compounds) ? (j.compounds as string[]) : [],
    metals: Array.isArray(j.metals) ? (j.metals as string[]) : [],
    methods: Array.isArray(j.methods) ? (j.methods as string[]) : [],
    mz: Array.isArray(j.mz) ? (j.mz as number[]) : [],
    ph:
      j.ph && typeof (j.ph as { value?: unknown }).value === "number"
        ? (j.ph as SearchFilters["ph"])
        : null,
    reactionLike: j.reaction ? `%${j.reaction}%` : null,
  };
  const mode: RouteIntent["mode"] =
    j.mode === "semantic" || j.mode === "both" ? j.mode : "filter";
  return { mode, filters, semanticQuery: (j.semanticQuery as string) ?? null };
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

// Grounded generation: answer ONLY from the provided records, inline [EXP-###]
// citations. Returns null when disabled.
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
  const text = await chatComplete({
    system,
    user: `Question: ${query}\n\nExperiment records:\n${context}`,
    maxTokens: 800,
  });
  return text;
}

// General-knowledge answer — used when the question doesn't match any stored
// experiment. Answers from general chemistry knowledge, clearly NOT the lab's
// data. Returns null when disabled.
export async function generateGeneralAnswer(query: string): Promise<string | null> {
  if (!isLlmEnabled()) return null;
  const system = `You are a helpful, knowledgeable assistant for a prebiotic-chemistry research lab. The user's question did not match any of the lab's stored experiments, so answer from your own general knowledge.
- Be accurate and concise.
- Do NOT cite experiment IDs or claim anything about the lab's specific experiments.
- If the question is outside your knowledge or ambiguous, say so briefly.`;
  return chatComplete({ system, user: query, maxTokens: 800 });
}

// Grounded single-experiment summary. Returns null when disabled.
export async function summarizeExperiment(e: Experiment): Promise<string | null> {
  const system = `You summarise a single chemistry experiment using ONLY the fields provided. Rules:
- 2–3 sentences, plain and specific.
- Use only values present in the record; never invent compounds, pH, m/z, or results.
- No preamble ("This experiment…") — state the substance directly.`;
  return chatComplete({ system, user: formatRecord(e), maxTokens: 400 });
}

export async function summarizeGroup(experiments: Experiment[]): Promise<string | null> {
  if (experiments.length === 0) return null;
  const system = `You summarise a SET of chemistry experiments using ONLY the fields provided. Rules:
- 3–5 sentences: shared themes, notable contrasts, and any standouts.
- Cite each experiment you reference as [EXP-###] using the IDs given; cite an ID at most once.
- Use only values present in the records; never invent compounds, pH, m/z, or results.
- No preamble — state the substance directly.`;
  const user = experiments
    .map((e) => `[${e.id}]\n${formatRecord(e)}`)
    .join("\n\n---\n\n");
  return chatComplete({ system, user, maxTokens: 600 });
}

// LLM-assisted entry: extract structured fields from messy notes. Only stated
// fields are returned. Returns null when disabled or unparseable.
export async function extractExperimentFields(
  notes: string
): Promise<Partial<ExperimentInput> | null> {
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
  "cycles": number,
  "methods": string[],       // only from: ${METHOD_OPTIONS.join(", ")}
  "mz": number[],
  "observations": string,
  "notes": string
}`;

  const text = await chatComplete({ system, user: notes, maxTokens: 700 });
  if (!text) return null;
  const j = parseJson(text);
  if (!j) return null;

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
  if (num(j.cycles) !== undefined) out.cycles = num(j.cycles) ?? null;
  if (arr(j.methods))
    out.methods = arr(j.methods)!.filter((m) => (METHOD_OPTIONS as readonly string[]).includes(m));
  if (numArr(j.mz)) out.mz = numArr(j.mz);
  if (str(j.observations)) out.observations = str(j.observations) ?? null;
  if (str(j.notes)) out.notes = str(j.notes) ?? null;
  return out;
}
