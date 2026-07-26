import "server-only";
import { createClient } from "@/lib/supabase/server";
import { keylessSearch, executeFilters } from "@/lib/search";
import {
  isLlmEnabled,
  routeQuery,
  generateAnswer,
  generateGeneralAnswer,
} from "@/lib/llm";
import { embedText } from "@/lib/embeddings";
import type { Experiment } from "@/lib/types";

// Only semantic hits at/above this cosine similarity count as a real match.
// Empirically: on-topic chemistry ≈ 0.59–0.70, off-topic ≈ 0.41–0.43.
const MIN_SIM = Number(process.env.SEMANTIC_MIN_SIMILARITY) || 0.5;

// Unified result for the Ask screen. `mode` = keyless (no key) vs ai. When
// `grounded` is false in ai mode, the answer is general knowledge, not the lab's.
export type AskResult = {
  mode: "keyless" | "ai";
  grounded: boolean;
  query: string;
  answer: string | null;
  interpretation: string[];
  results: Experiment[];
  emptyReason: string | null;
};

// Semantic retrieval: embed the query, keep only nearest experiments above the
// similarity threshold, hydrate full rows in similarity order. [] when disabled.
async function semanticSearch(semanticQuery: string, k = 8): Promise<Experiment[]> {
  const embedding = await embedText(semanticQuery);
  if (!embedding) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_experiments", {
    // pgvector expects the vector as its text form, e.g. "[0.1,0.2,…]".
    query_embedding: JSON.stringify(embedding),
    match_count: k,
  });
  if (error) throw error;

  const hits = ((data ?? []) as { id: string; similarity: number }[]).filter(
    (r) => r.similarity >= MIN_SIM
  );
  const ids = hits.map((r) => r.id);
  if (ids.length === 0) return [];

  const { data: rows } = await supabase
    .from("experiments")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null);

  const order = new Map(ids.map((id, i) => [id, i]));
  // See the narrowing note in lib/types.ts for why this cast is safe.
  return ((rows ?? []) as Experiment[]).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
}

// Retrieval only (no answer generation) — routes the query, runs filters and/or
// semantic search, returns the deduped records. Used by the streaming route
// handler, which generates the answer itself. [] when the router is unavailable.
export async function retrieveRecords(query: string): Promise<Experiment[]> {
  const intent = await routeQuery(query);
  if (!intent) return [];
  const seen = new Map<string, Experiment>();
  if (intent.mode !== "semantic") {
    for (const e of await executeFilters(intent.filters)) seen.set(e.id, e);
  }
  if (intent.mode !== "filter" && intent.semanticQuery) {
    for (const e of await semanticSearch(intent.semanticQuery)) {
      if (!seen.has(e.id)) seen.set(e.id, e);
    }
  }
  return [...seen.values()];
}

async function keylessAsk(query: string): Promise<AskResult> {
  const ks = await keylessSearch(query);
  return {
    mode: "keyless",
    grounded: false,
    query,
    answer: null,
    interpretation: ks.interpretation,
    results: ks.results,
    emptyReason: ks.emptyReason,
  };
}

export async function askAI(query: string): Promise<AskResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { mode: "keyless", grounded: false, query, answer: null, interpretation: [], results: [], emptyReason: null };
  }

  // Inert path (no key): deterministic keyless search (Phase 5).
  if (!isLlmEnabled()) return keylessAsk(trimmed);

  // AI path.
  const intent = await routeQuery(trimmed);
  if (!intent) return keylessAsk(trimmed); // router unavailable/unparseable → safe fallback

  const seen = new Map<string, Experiment>();
  if (intent.mode !== "semantic") {
    for (const e of await executeFilters(intent.filters)) seen.set(e.id, e);
  }
  if (intent.mode !== "filter" && intent.semanticQuery) {
    for (const e of await semanticSearch(intent.semanticQuery)) {
      if (!seen.has(e.id)) seen.set(e.id, e);
    }
  }
  const records = [...seen.values()];

  // Grounded answer when we have relevant records AND they actually answer.
  if (records.length > 0) {
    const grounded = await generateAnswer(trimmed, records);
    if (grounded && !/no matching experiments/i.test(grounded)) {
      return {
        mode: "ai",
        grounded: true,
        query: trimmed,
        answer: grounded,
        interpretation: [],
        results: records,
        emptyReason: null,
      };
    }
  }

  // Otherwise fall back to a general (non-grounded) answer — "more dynamic".
  const general = await generateGeneralAnswer(trimmed);
  return {
    mode: "ai",
    grounded: false,
    query: trimmed,
    answer: general,
    interpretation: [],
    results: [],
    emptyReason: general ? null : "No matching experiments found.",
  };
}
