import "server-only";
import { createClient } from "@/lib/supabase/server";
import { keylessSearch, executeFilters, describeFilters } from "@/lib/search";
import {
  isLlmEnabled,
  routeQuery,
  generateCitedAnswer,
  generateGeneralAnswer,
  type EvidenceSource,
} from "@/lib/llm";
import { embedText } from "@/lib/embeddings";
import { logInfo } from "@/lib/logger";
import type { Experiment } from "@/lib/types";

// T3.3 D1 — RRF's standard damping constant: large enough that rank 1 vs
// rank 2 in a single list isn't wildly different, small enough that a record
// found by BOTH retrieval methods clearly outranks one found by only one.
const RRF_K = 60;

function rrfFuse(idLists: string[][]): string[] {
  const scores = new Map<string, number>();
  for (const ids of idLists) {
    ids.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

// T3.3 D2 — per-record "why it matched" (audit §11.4), returned alongside
// retrieveRecords' fused records so the Ask screen can show it under each
// Source card. matchedVia/appliedFilters come from which retrieval list(s)
// produced the record; sourceType/sectionType/snippet/semanticScore come
// straight from the evidence map (T3.1/T3.2), null when the record was
// filter-only (no chunk search performed for it).
export type MatchExplanation = {
  matchedVia: "filter" | "semantic" | "both";
  appliedFilters: string[];
  semanticScore: number | null;
  sourceType: string | null;
  sectionType: string | null;
  snippet: string | null;
};

// Only semantic hits at/above this cosine similarity count as a real match.
//
// The old default of 0.5 sat between the numbers this comment used to quote
// — on-topic chemistry 0.59-0.70, off-topic 0.41-0.43 — but those were
// measured with gemini-embedding-001 (scripts/probe-sim.ts), and cosine
// similarity is not comparable across embedding models. When the provider
// switched to OpenAI nothing re-measured them, and text-embedding-3-small
// scores query-to-document pairs far lower: 0.2-0.45 is normal for genuinely
// related text, because a short question and a full record are different
// kinds of object. Document-to-document stays high on both models, which is
// exactly why this looked healthy from the outside — EXP-001 matches EXP-008
// at 0.85 through the same RPC.
//
// Net effect: a threshold tuned for one model silently rejected every real
// hit under another. Ask AI answered parametric questions perfectly (that
// path never touches embeddings) while every free-text question about the
// lab's own science returned "No matching experiments found in your lab" —
// most pointedly "which samples produced droplets?", the router prompt's own
// example of a semantic query.
//
// 0.3 is deliberately conservative for the new model rather than a
// re-derived optimum: the numbers above need re-measuring on
// text-embedding-3-small before this is tuned properly. semanticSearch now
// logs the candidate count and top similarity whenever it returns nothing,
// so that tuning can come from real traffic instead of a one-off probe.
const MIN_SIM = Number(process.env.SEMANTIC_MIN_SIMILARITY) || 0.3;

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

// T3.1 D5 — semantic retrieval now matches at chunk granularity (a single
// step observation or analysis result can surface the right experiment even
// when the rest of its content is noisy) instead of one whole-experiment
// vector. Each chunk hit resolves to its parent experiment id — directly via
// metadata.experiment_id for 8 of the 10 source types, or via a live fan-out
// against experiments.protocol_version_id for the two protocol-level source
// types (protocol_version/protocol_step have no single parent experiment —
// protocols are reusable across many). Hits are deduped to distinct
// experiment ids in similarity order, then hydrated exactly as before —
// lib/llm.ts's formatRecord()/generateAnswer() are unchanged.
async function resolveChunkExperimentIds(
  hits: { source_type: string; metadata: Record<string, unknown> }[],
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<(string | null)[]> {
  const protocolVersionIds = [
    ...new Set(
      hits
        .filter((h) => h.source_type === "protocol_version" || h.source_type === "protocol_step")
        .map((h) => h.metadata.protocol_version_id as string)
        .filter(Boolean)
    ),
  ];

  const experimentsByProtocolVersion = new Map<string, string[]>();
  if (protocolVersionIds.length > 0) {
    const { data: linked } = await supabase
      .from("experiments")
      .select("id, protocol_version_id")
      .in("protocol_version_id", protocolVersionIds)
      .is("deleted_at", null);
    for (const row of linked ?? []) {
      const list = experimentsByProtocolVersion.get(row.protocol_version_id!) ?? [];
      list.push(row.id);
      experimentsByProtocolVersion.set(row.protocol_version_id!, list);
    }
  }

  return hits.map((h) => {
    if (h.source_type === "protocol_version" || h.source_type === "protocol_step") {
      const pvId = h.metadata.protocol_version_id as string | undefined;
      return pvId ? experimentsByProtocolVersion.get(pvId)?.[0] ?? null : null;
    }
    return (h.metadata.experiment_id as string | undefined) ?? null;
  });
}

export type ChunkSearchResult = {
  experiments: Experiment[];
  // T3.2 D1 — keyed by experiment id: the single best-matching chunk that
  // resolved each experiment, so the citation engine can cite the actual
  // supporting passage instead of the whole record. Absent for an experiment
  // means no chunk evidence was available for it (the caller falls back to a
  // whole-record citation — see generateCitedAnswer).
  evidence: Map<string, EvidenceSource>;
};

// Semantic retrieval: embed the query, chunk-search, resolve to distinct
// parent experiments above the similarity threshold, hydrate full rows in
// similarity order, and surface each experiment's best-matching chunk content
// for T3.2's citation engine. {experiments: [], evidence: new Map()} when
// disabled. Exported (only) so tests can exercise the chunk-to-experiment
// resolution/dedup logic directly.
export async function semanticSearch(semanticQuery: string, k = 8): Promise<ChunkSearchResult> {
  const embedding = await embedText(semanticQuery);
  if (!embedding) return { experiments: [], evidence: new Map() };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("match_evidence_chunks", {
    // pgvector expects the vector as its text form, e.g. "[0.1,0.2,…]".
    query_embedding: JSON.stringify(embedding),
    // Over-fetch chunks since many can collapse onto the same experiment.
    match_count: k * 4,
  });
  if (error) throw error;

  const candidates = (data ?? []) as {
    id: string;
    source_type: string;
    source_id: string;
    section_type: string;
    metadata: Record<string, unknown>;
    similarity: number;
  }[];

  const hits = candidates.filter((r) => r.similarity >= MIN_SIM);

  // A query that retrieves nothing used to leave no trace anywhere: no
  // ai_requests row (the route returns before logging one) and no
  // ai_retrieval_event either, so the questions most worth learning from were
  // the only ones invisible. Log what the vector search actually scored, so
  // "nothing was close" can be told apart from "everything scored just under
  // the threshold" without attaching a debugger to production.
  if (hits.length === 0) {
    logInfo("rag", "semantic search returned nothing", {
      candidates: candidates.length,
      topSimilarity: candidates[0]?.similarity ?? null,
      minSim: MIN_SIM,
    });
    return { experiments: [], evidence: new Map() };
  }

  const experimentIds = await resolveChunkExperimentIds(hits, supabase);
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  const bestChunkByExperiment = new Map<
    string,
    { chunkId: string; sourceType: string; sectionType: string; similarity: number }
  >();
  for (let i = 0; i < hits.length; i++) {
    const id = experimentIds[i];
    if (id && !seen.has(id)) {
      seen.add(id);
      orderedIds.push(id);
      bestChunkByExperiment.set(id, {
        chunkId: hits[i].id,
        sourceType: hits[i].source_type,
        sectionType: hits[i].section_type,
        similarity: hits[i].similarity,
      });
      if (orderedIds.length >= k) break;
    }
  }
  if (orderedIds.length === 0) return { experiments: [], evidence: new Map() };

  const [{ data: rows }, { data: chunkRows }] = await Promise.all([
    supabase.from("experiments").select("*").in("id", orderedIds).is("deleted_at", null),
    supabase
      .from("evidence_chunks")
      .select("id, content")
      .in("id", [...bestChunkByExperiment.values()].map((c) => c.chunkId)),
  ]);

  const contentByChunkId = new Map((chunkRows ?? []).map((c) => [c.id, c.content]));
  const evidence = new Map<string, EvidenceSource>();
  for (const [expId, chunk] of bestChunkByExperiment) {
    const content = contentByChunkId.get(chunk.chunkId);
    if (content) {
      evidence.set(expId, {
        sourceType: chunk.sourceType,
        sectionType: chunk.sectionType,
        content,
        similarity: chunk.similarity,
      });
    }
  }

  const order = new Map(orderedIds.map((id, i) => [id, i]));
  // See the narrowing note in lib/types.ts for why this cast is safe.
  const experiments = ((rows ?? []) as Experiment[]).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  );
  return { experiments, evidence };
}

// Retrieval only (no answer generation) — routes the query, runs filters and/or
// semantic search, fuses them via RRF (T3.3 D1), returns the fused records
// plus chunk-level evidence for T3.2's citation engine and per-record match
// explanations for T3.3's "why it matched" (D2). Used by the /api/ask route,
// which generates the answer itself. `routerFailed` lets the caller tell "the
// router genuinely found nothing" apart from "the router itself was
// unavailable/unparseable" (audit §3 — these read as the same silent "no
// matches" to the user otherwise).
export async function retrieveRecords(query: string): Promise<{
  records: Experiment[];
  routerFailed: boolean;
  evidence: Map<string, EvidenceSource>;
  explanations: Map<string, MatchExplanation>;
  routerMode: "filter" | "semantic" | "both" | null;
}> {
  const intent = await routeQuery(query);
  if (!intent) {
    return { records: [], routerFailed: true, evidence: new Map(), explanations: new Map(), routerMode: null };
  }

  const byId = new Map<string, Experiment>();
  let filterIds: string[] = [];
  if (intent.mode !== "semantic") {
    const filterRecords = await executeFilters(intent.filters);
    filterIds = filterRecords.map((e) => e.id);
    for (const e of filterRecords) byId.set(e.id, e);
  }

  let semanticIds: string[] = [];
  let evidence = new Map<string, EvidenceSource>();
  if (intent.mode !== "filter" && intent.semanticQuery) {
    const semantic = await semanticSearch(intent.semanticQuery);
    semanticIds = semantic.experiments.map((e) => e.id);
    for (const e of semantic.experiments) {
      if (!byId.has(e.id)) byId.set(e.id, e);
    }
    evidence = semantic.evidence;
  }

  // Single-mode queries (only one non-empty list) trivially preserve that
  // list's original order — RRF only changes anything when both lists exist.
  const fusedIds = rrfFuse([filterIds, semanticIds].filter((ids) => ids.length > 0));
  const records = fusedIds.map((id) => byId.get(id)).filter((e): e is Experiment => !!e);

  const appliedFilters = intent.mode !== "semantic" ? describeFilters(intent.filters) : [];
  const filterIdSet = new Set(filterIds);
  const semanticIdSet = new Set(semanticIds);
  const explanations = new Map<string, MatchExplanation>();
  for (const id of fusedIds) {
    const inFilter = filterIdSet.has(id);
    const inSemantic = semanticIdSet.has(id);
    const ev = evidence.get(id);
    explanations.set(id, {
      matchedVia: inFilter && inSemantic ? "both" : inFilter ? "filter" : "semantic",
      appliedFilters: inFilter ? appliedFilters : [],
      semanticScore: ev?.similarity ?? null,
      sourceType: ev?.sourceType ?? null,
      sectionType: ev?.sectionType ?? null,
      snippet: ev?.content ?? null,
    });
  }

  return { records, routerFailed: false, evidence, explanations, routerMode: intent.mode };
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
  let evidence = new Map<string, EvidenceSource>();
  if (intent.mode !== "semantic") {
    for (const e of await executeFilters(intent.filters)) seen.set(e.id, e);
  }
  if (intent.mode !== "filter" && intent.semanticQuery) {
    const semantic = await semanticSearch(intent.semanticQuery);
    for (const e of semantic.experiments) {
      if (!seen.has(e.id)) seen.set(e.id, e);
    }
    evidence = semantic.evidence;
  }
  const records = [...seen.values()];

  // Grounded answer when we have relevant records AND they actually answer.
  if (records.length > 0) {
    const cited = await generateCitedAnswer(trimmed, records, evidence);
    if (cited) {
      return {
        mode: "ai",
        grounded: true,
        query: trimmed,
        answer: cited.segments.map((s) => s.text).join(" "),
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
