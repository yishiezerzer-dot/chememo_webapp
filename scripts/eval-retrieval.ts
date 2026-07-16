// Retrieval eval (audit Sprint S5). Measures precision/recall of the retrieval
// layer against a fixed query set, independent of LLM answer generation.
// Usage: npm run eval:retrieval   (needs a key + backfilled embeddings on dev)
//
// Self-contained like the backfill: imports only the @/-import-free embeddings
// lib and talks to Supabase directly, so it runs under plain `node --env-file`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { embedText, isEmbeddingEnabled, embeddingModel } from "../lib/embeddings.ts";

const MIN_SIM = Number(process.env.SEMANTIC_MIN_SIMILARITY) || 0.5;
const SEMANTIC_K = 8;
const RECALL_GATE = 0.8; // fail the run if any query recalls below this

type Filter = {
  mz?: number;
  metals?: string[];
  ph_gt?: number;
};
type EvalQuery = {
  id: string;
  query: string;
  expected_ids: string[];
  mode: "semantic" | "filter";
  filter?: Filter;
};

type Supabase = ReturnType<typeof createClient>;

async function semanticIds(supabase: Supabase, query: string): Promise<string[]> {
  const embedding = await embedText(query);
  if (!embedding) return [];
  const { data, error } = await supabase.rpc("match_experiments", {
    query_embedding: JSON.stringify(embedding),
    match_count: SEMANTIC_K,
  });
  if (error) throw error;
  return ((data ?? []) as { id: string; similarity: number }[])
    .filter((r) => r.similarity >= MIN_SIM)
    .map((r) => r.id);
}

async function filterIds(supabase: Supabase, f: Filter): Promise<string[]> {
  let q = supabase.from("experiments").select("id").is("deleted_at", null);
  if (f.mz !== undefined) q = q.overlaps("mz", [f.mz]);
  if (f.metals?.length) q = q.overlaps("metals", f.metals);
  if (f.ph_gt !== undefined) q = q.gt("ph", f.ph_gt);
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

function score(retrieved: string[], expected: string[]) {
  const exp = new Set(expected);
  const hit = retrieved.filter((id) => exp.has(id));
  const recall = expected.length ? hit.length / expected.length : 1;
  const precision = retrieved.length ? hit.length / retrieved.length : 0;
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
  return { recall, precision, f1, missed: expected.filter((id) => !retrieved.includes(id)) };
}

const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

async function main() {
  if (!isEmbeddingEnabled()) {
    console.error("[eval] No embedding key set — semantic queries need one. Aborting.");
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[eval] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey);

  const here = dirname(fileURLToPath(import.meta.url));
  const queries: EvalQuery[] = JSON.parse(
    readFileSync(join(here, "..", "eval", "retrieval-queries.json"), "utf8")
  );

  console.log(`# Retrieval eval\n`);
  console.log(`Embedding model: \`${embeddingModel()}\` · MIN_SIM ${MIN_SIM} · semantic k=${SEMANTIC_K}\n`);
  console.log(`| Query | Mode | Recall | Precision | F1 | Missed |`);
  console.log(`|---|---|---|---|---|---|`);

  let sumR = 0;
  let sumP = 0;
  const failures: string[] = [];

  for (const q of queries) {
    const retrieved =
      q.mode === "semantic"
        ? await semanticIds(supabase, q.query)
        : await filterIds(supabase, q.filter ?? {});
    const s = score(retrieved, q.expected_ids);
    sumR += s.recall;
    sumP += s.precision;
    if (s.recall < RECALL_GATE) failures.push(q.id);
    const label = q.query.length > 34 ? q.query.slice(0, 33) + "…" : q.query;
    console.log(
      `| ${label} | ${q.mode} | ${pct(s.recall)} | ${pct(s.precision)} | ${s.f1.toFixed(2)} | ${s.missed.join(", ") || "—"} |`
    );
  }

  const n = queries.length;
  console.log(`\n**Mean recall ${pct(sumR / n)} · mean precision ${pct(sumP / n)}** over ${n} queries.`);

  if (failures.length) {
    console.error(`\n[eval] FAIL — recall < ${pct(RECALL_GATE)} on: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log(`\n[eval] PASS — all queries at or above ${pct(RECALL_GATE)} recall.`);
}

main().catch((err) => {
  console.error("[eval] failed:", err.message);
  process.exit(1);
});
