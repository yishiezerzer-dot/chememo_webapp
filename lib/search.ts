import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Experiment } from "@/lib/types";

// Keyless, deterministic search: parse a plain-language question into exact
// filters over the typed columns and run them as Postgres queries. No LLM —
// every result is a real row, fully citable by EXP-###.

// T3.3 D3 — canonical metal aliases, shared by the keyless parser's raw-text
// scan (below) and lib/llm.ts's AI router (which resolves its own free-typed
// metals through resolveMetalAlias, deterministically, not via a prompt hint
// the model might ignore). Expanded with the ionic forms actually relevant to
// this lab's catalysis chemistry (audit §11.2's own literal example: "zinc"/
// "Zn"/"Zn2+" should all resolve to the same canonical value).
export const METAL_ALIASES: Record<string, string> = {
  zinc: "Zn",
  zn: "Zn",
  "zn2+": "Zn",
  copper: "Cu",
  cu: "Cu",
  "cu2+": "Cu",
  "cu+": "Cu",
  iron: "Fe",
  fe: "Fe",
  "fe2+": "Fe",
  "fe3+": "Fe",
  calcium: "Ca",
  ca: "Ca",
  "ca2+": "Ca",
};

// A single already-identified token (e.g. one element of the AI router's own
// metals: string[]) resolves via a plain lookup — no text-scanning needed.
export function resolveMetalAlias(raw: string): string {
  return METAL_ALIASES[raw.trim().toLowerCase()] ?? raw;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Word-boundary-safe even for aliases ending in a non-word character (e.g.
// "zn2+") — \b only makes sense on a side that's actually a word character.
function aliasRegex(alias: string): RegExp {
  const escaped = escapeRegExp(alias);
  const prefix = /^\w/.test(alias) ? "\\b" : "";
  const suffix = /\w$/.test(alias) ? "\\b" : "";
  return new RegExp(`${prefix}${escaped}${suffix}`);
}

// T3.3 D3 — the reaction-type keyword chain, extracted from parseQuery's
// former inline if/else so lib/llm.ts's AI router can resolve the model's own
// free-typed reaction phrase (e.g. "wet-dry cycling") to the SAME canonical
// ilike pattern the keyless parser produces from raw query text.
const REACTION_ALIASES: { pattern: RegExp; canonical: string; consumedWords: string[] }[] = [
  { pattern: /cycling/, canonical: "%cycling%", consumedWords: ["cycling"] },
  { pattern: /wet.{0,3}dry|wet[\s-]?dry/, canonical: "%wet%dry%", consumedWords: ["wet", "dry"] },
  { pattern: /depsi/, canonical: "%depsi%", consumedWords: ["depsipeptide", "depsi"] },
  { pattern: /coacerv/, canonical: "%coacerv%", consumedWords: ["coacervate", "coacervation"] },
  { pattern: /fibr|fiber/, canonical: "%fibr%", consumedWords: [] },
  { pattern: /self.?assembl|assembly/, canonical: "%assembly%", consumedWords: [] },
];

export function resolveReactionAlias(raw: string): string {
  const lower = raw.toLowerCase();
  for (const { pattern, canonical } of REACTION_ALIASES) {
    if (pattern.test(lower)) return canonical;
  }
  return `%${raw}%`;
}

// words that carry no discriminating signal for free-text / compound matching
const STOP = new Set([
  "acid", "chloride", "sulfate", "the", "and", "all", "which", "that", "did",
  "we", "already", "run", "ran", "experiment", "experiments", "show", "showed",
  "find", "sample", "samples", "with", "for", "used", "using", "have", "has",
  "had", "get", "list", "between", "were", "was", "any", "some", "produced",
  "produce", "include", "included", "including", "contain", "contains",
  "containing", "made", "gave", "give", "what", "where", "when", "how", "many",
  "ph", "mz", "above", "over", "below", "under", "greater", "less", "than",
  "more", "at", "of", "in", "on", "to", "a", "an",
]);

type PhOp = "gt" | "lt" | "gte" | "lte" | "eq";
type PhCond = { op: PhOp; value: number };

export type SearchFilters = {
  compounds: string[];
  metals: string[];
  methods: string[];
  mz: number[];
  ph: PhCond | null;
  reactionLike: string | null;
  freeText: string[];
};

export type SearchResult = {
  query: string;
  interpretation: string[];
  results: Experiment[];
  emptyReason: string | null;
};

async function loadVocab(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase
    .from("experiments")
    .select("compounds, methods")
    .is("deleted_at", null);
  const compounds = new Set<string>();
  const methods = new Set<string>();
  for (const row of data ?? []) {
    (row.compounds ?? []).forEach((c: string) => compounds.add(c));
    (row.methods ?? []).forEach((m: string) => methods.add(m));
  }
  return { compounds: [...compounds], methods: [...methods] };
}

function parsePh(lower: string): PhCond | null {
  const m = lower.match(
    /ph\s*(>=|<=|=|>|<)?\s*(above|over|greater than|greater|more than|more|below|under|less than|less|at|of|equal to|equals|equal)?\s*(\d+(?:\.\d+)?)/
  );
  if (!m) return null;
  const sym = m[1];
  const word = m[2];
  const value = Number(m[3]);
  let op: PhOp = "eq";
  if (sym === ">") op = "gt";
  else if (sym === "<") op = "lt";
  else if (sym === ">=") op = "gte";
  else if (sym === "<=") op = "lte";
  else if (word && /above|over|greater|more/.test(word)) op = "gt";
  else if (word && /below|under|less/.test(word)) op = "lt";
  return { op, value };
}

function parseMz(lower: string): number[] {
  const out = new Set<number>();
  const re = /m\/?z\s*=?\s*(\d{2,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower))) out.add(Number(m[1]));
  return [...out];
}

const PH_LABEL: Record<PhOp, string> = {
  gt: ">", lt: "<", gte: "≥", lte: "≤", eq: "=",
};

export function parseQuery(
  query: string,
  vocab: { compounds: string[]; methods: string[] }
): { filters: SearchFilters; interpretation: string[] } {
  const lower = ` ${query.toLowerCase()} `;
  const consumed = new Set<string>();
  const interpretation: string[] = [];

  // metals
  const metals = new Set<string>();
  for (const [alias, sym] of Object.entries(METAL_ALIASES)) {
    if (aliasRegex(alias).test(lower)) {
      metals.add(sym);
      consumed.add(alias);
    }
  }

  // compounds — match a distinct DB compound if any of its significant words appear
  const compounds = new Set<string>();
  for (const comp of vocab.compounds) {
    const words = comp
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w));
    if (words.some((w) => new RegExp(`\\b${w}`).test(lower))) {
      compounds.add(comp);
      words.forEach((w) => consumed.add(w));
    }
  }

  // methods
  const methods = new Set<string>();
  const wantNeg = /\bneg\b|negative/.test(lower);
  const wantPos = /\bpos\b|positive/.test(lower);
  if (/lc-?\s?ms|lcms|mass spec|\bms\b/.test(lower)) {
    for (const m of vocab.methods.filter((x) => x.startsWith("LC-MS"))) {
      if (wantNeg && !/neg/i.test(m)) continue;
      if (wantPos && !/pos/i.test(m)) continue;
      methods.add(m);
    }
    consumed.add("lc"); consumed.add("ms"); consumed.add("lcms");
  }
  if (/nmr/.test(lower) && vocab.methods.includes("NMR")) methods.add("NMR");
  if (/microscop/.test(lower) && vocab.methods.includes("Microscopy")) {
    methods.add("Microscopy");
    consumed.add("microscopy");
  }
  if (/uv/.test(lower) && vocab.methods.includes("UV-Vis")) methods.add("UV-Vis");

  // m/z and pH
  const mz = parseMz(lower);
  const ph = parsePh(lower);

  // reaction type (single best keyword)
  let reactionLike: string | null = null;
  for (const alias of REACTION_ALIASES) {
    if (alias.pattern.test(lower)) {
      reactionLike = alias.canonical;
      alias.consumedWords.forEach((w) => consumed.add(w));
      break;
    }
  }

  // free text — leftover meaningful words (e.g. "droplets", "precipitate")
  const freeText: string[] = [];
  for (const raw of lower.split(/[^a-z/]+/)) {
    const w = raw.trim();
    if (w.length < 4 || STOP.has(w) || consumed.has(w)) continue;
    // skip words already covered by a matched compound keyword
    if ([...consumed].some((c) => w.startsWith(c) || c.startsWith(w))) continue;
    if (!freeText.includes(w)) freeText.push(w);
  }

  const filters: SearchFilters = {
    compounds: [...compounds],
    metals: [...metals],
    methods: [...methods],
    mz,
    ph,
    reactionLike,
    freeText,
  };
  interpretation.push(...describeFilters(filters));

  return { filters, interpretation };
}

// T3.3 D2 — extracted from parseQuery's former inline "build interpretation"
// block so the AI router path (which builds a SearchFilters directly from the
// model's JSON, never through parseQuery) can describe its own filters the
// same human-readable way, for the Ask screen's per-source "why it matched" line.
export function describeFilters(filters: SearchFilters): string[] {
  const interpretation: string[] = [];
  if (filters.compounds.length) interpretation.push(`compounds include ${filters.compounds.join(" + ")}`);
  if (filters.metals.length) interpretation.push(`metal ${filters.metals.join(", ")}`);
  if (filters.ph) interpretation.push(`pH ${PH_LABEL[filters.ph.op]} ${filters.ph.value}`);
  if (filters.mz.length) interpretation.push(`m/z ${filters.mz.join(", ")}`);
  if (filters.methods.length) interpretation.push(`method ${filters.methods.join(", ")}`);
  if (filters.reactionLike) {
    interpretation.push(`reaction ~ "${filters.reactionLike.replace(/%/g, "").replace(/wetdry/, "wet-dry")}"`);
  }
  if (filters.freeText.length) interpretation.push(`text mentions "${filters.freeText.join(", ")}"`);
  return interpretation;
}

// Build one ilike condition for an .or() group. Double-quotes the value so
// PostgREST treats `, ( ) %` as literal instead of or()-syntax (matters for
// AI-router-supplied free text like "poly(A)"); wildcards stay active.
function ilikeCond(col: string, term: string): string {
  const v = term.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `${col}.ilike."%${v}%"`;
}

// Run a parsed filter set as deterministic Postgres queries. Shared by the
// keyless path and (in Phase 10) the AI router's structured path.
export async function executeFilters(
  filters: SearchFilters
): Promise<Experiment[]> {
  const supabase = await createClient();
  let q = supabase.from("experiments").select("*").is("deleted_at", null);
  if (filters.compounds.length) q = q.contains("compounds", filters.compounds);
  if (filters.metals.length) q = q.overlaps("metals", filters.metals);
  if (filters.methods.length) q = q.overlaps("methods", filters.methods);
  if (filters.mz.length) q = q.overlaps("mz", filters.mz);
  if (filters.ph) {
    const { op, value } = filters.ph;
    if (op === "gt") q = q.gt("ph", value);
    else if (op === "lt") q = q.lt("ph", value);
    else if (op === "gte") q = q.gte("ph", value);
    else if (op === "lte") q = q.lte("ph", value);
    else q = q.eq("ph", value);
  }
  if (filters.reactionLike) q = q.ilike("reaction_type", filters.reactionLike);
  if (filters.freeText.length) {
    const ors = filters.freeText
      .flatMap((w) => [
        ilikeCond("observations", w),
        ilikeCond("name", w),
        ilikeCond("notes", w),
      ])
      .join(",");
    q = q.or(ors);
  }
  q = q.order("date", { ascending: false });

  const { data, error } = await q;
  if (error) throw error;
  // See the narrowing note in lib/types.ts for why this cast is safe.
  return (data ?? []) as Experiment[];
}

export async function keylessSearch(query: string): Promise<SearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query, interpretation: [], results: [], emptyReason: null };
  }

  const supabase = await createClient();
  const vocab = await loadVocab(supabase);
  const { filters, interpretation } = parseQuery(trimmed, vocab);

  const results = await executeFilters(filters);
  const hadFilter =
    interpretation.length > 0 &&
    (filters.compounds.length ||
      filters.metals.length ||
      filters.methods.length ||
      filters.mz.length ||
      filters.ph ||
      filters.reactionLike ||
      filters.freeText.length);

  return {
    query: trimmed,
    interpretation,
    results,
    emptyReason: !hadFilter
      ? "Couldn't read a filter from that. Try a compound, metal, pH (e.g. \"pH > 8\"), m/z, method, or a word like \"droplets\"."
      : results.length === 0
      ? "No matching experiments found."
      : null,
  };
}
