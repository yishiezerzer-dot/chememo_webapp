import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Experiment } from "@/lib/types";

// Keyless, deterministic search: parse a plain-language question into exact
// filters over the typed columns and run them as Postgres queries. No LLM —
// every result is a real row, fully citable by EXP-###.

const METAL_ALIASES: Record<string, string> = {
  zinc: "Zn",
  zn: "Zn",
  copper: "Cu",
  cu: "Cu",
  iron: "Fe",
  fe: "Fe",
  calcium: "Ca",
  ca: "Ca",
};

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
    if (new RegExp(`\\b${alias}\\b`).test(lower)) {
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
  if (/cycling/.test(lower)) {
    reactionLike = "%cycling%";
    consumed.add("cycling");
  } else if (/wet.{0,3}dry|wet[\s-]?dry/.test(lower)) {
    reactionLike = "%wet%dry%";
    consumed.add("wet"); consumed.add("dry");
  } else if (/depsi/.test(lower)) {
    reactionLike = "%depsi%";
    consumed.add("depsipeptide"); consumed.add("depsi");
  } else if (/coacerv/.test(lower)) {
    reactionLike = "%coacerv%";
    consumed.add("coacervate"); consumed.add("coacervation");
  } else if (/fibr|fiber/.test(lower)) {
    reactionLike = "%fibr%";
  } else if (/self.?assembl|assembly/.test(lower)) {
    reactionLike = "%assembly%";
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

  // build interpretation
  if (compounds.size) interpretation.push(`compounds include ${[...compounds].join(" + ")}`);
  if (metals.size) interpretation.push(`metal ${[...metals].join(", ")}`);
  if (ph) interpretation.push(`pH ${PH_LABEL[ph.op]} ${ph.value}`);
  if (mz.length) interpretation.push(`m/z ${mz.join(", ")}`);
  if (methods.size) interpretation.push(`method ${[...methods].join(", ")}`);
  if (reactionLike) interpretation.push(`reaction ~ "${reactionLike.replace(/%/g, "").replace(/wetdry/, "wet-dry")}"`);
  if (freeText.length) interpretation.push(`text mentions "${freeText.join(", ")}"`);

  return {
    filters: {
      compounds: [...compounds],
      metals: [...metals],
      methods: [...methods],
      mz,
      ph,
      reactionLike,
      freeText,
    },
    interpretation,
  };
}

export async function keylessSearch(query: string): Promise<SearchResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { query, interpretation: [], results: [], emptyReason: null };
  }

  const supabase = await createClient();
  const vocab = await loadVocab(supabase);
  const { filters, interpretation } = parseQuery(trimmed, vocab);

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
        `observations.ilike.%${w}%`,
        `name.ilike.%${w}%`,
        `notes.ilike.%${w}%`,
      ])
      .join(",");
    q = q.or(ors);
  }
  q = q.order("date", { ascending: false });

  const { data, error } = await q;
  if (error) throw error;

  const results = data ?? [];
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
