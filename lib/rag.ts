import "server-only";
import { createClient } from "@/lib/supabase/server";
import { keylessSearch, executeFilters } from "@/lib/search";
import { isLlmEnabled, routeQuery, generateAnswer } from "@/lib/anthropic";
import { embedText } from "@/lib/embeddings";
import type { Experiment } from "@/lib/types";

// Unified result for the Ask screen. `mode` tells the UI whether it is showing
// a deterministic keyless result (no key) or a grounded AI answer (Phase 10).
export type AskResult = {
  mode: "keyless" | "ai";
  query: string;
  answer: string | null;
  interpretation: string[];
  results: Experiment[];
  emptyReason: string | null;
};

// Semantic retrieval: embed the query, find nearest experiments via
// match_experiments, then hydrate full rows preserving similarity order.
// Returns [] when embeddings are disabled (no key) — inert-safe.
async function semanticSearch(semanticQuery: string, k = 8): Promise<Experiment[]> {
  const embedding = await embedText(semanticQuery);
  if (!embedding) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_experiments", {
    query_embedding: embedding as unknown as string,
    match_count: k,
  });
  if (error) throw error;

  const ids: string[] = (data ?? []).map((r: { id: string }) => r.id);
  if (ids.length === 0) return [];

  const { data: rows } = await supabase
    .from("experiments")
    .select("*")
    .in("id", ids)
    .is("deleted_at", null);

  const order = new Map(ids.map((id, i) => [id, i]));
  return (rows ?? []).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function keylessAsk(query: string): Promise<AskResult> {
  const ks = await keylessSearch(query);
  return {
    mode: "keyless",
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
    return { mode: "keyless", query, answer: null, interpretation: [], results: [], emptyReason: null };
  }

  // Inert path (no ANTHROPIC key): deterministic keyless search (Phase 5).
  if (!isLlmEnabled()) return keylessAsk(trimmed);

  // AI path — activates in Phase 10.
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
  const answer = await generateAnswer(trimmed, records);
  return {
    mode: "ai",
    query: trimmed,
    answer,
    interpretation: [],
    results: records,
    emptyReason: records.length === 0 ? "No matching experiments found." : null,
  };
}
