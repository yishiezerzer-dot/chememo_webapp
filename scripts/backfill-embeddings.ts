// Phase 6 backfill — READY BUT NOT RUN until Phase 10 (needs OPENAI_API_KEY).
// Usage: node --env-file=.env.local scripts/backfill-embeddings.ts
// Inert path: with no OPENAI_API_KEY it prints a notice and exits 0.

import { createClient } from "@supabase/supabase-js";
import {
  buildEmbeddingInput,
  embedText,
  isEmbeddingEnabled,
  embeddingModel,
} from "../lib/embeddings.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!isEmbeddingEnabled()) {
    console.log(
      "[backfill] OPENAI_API_KEY not set — embeddings are a Phase 10 step. Nothing to do."
    );
    process.exit(0);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("[backfill] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey);
  const { data: experiments, error } = await supabase
    .from("experiments")
    .select("id, name, reaction_type, compounds, metals, methods, observations, notes")
    .is("deleted_at", null);
  if (error) throw error;

  console.log(`[backfill] embedding ${experiments.length} experiments with ${embeddingModel()}…`);
  let done = 0;
  for (const e of experiments) {
    const content = buildEmbeddingInput(e);
    const embedding = await embedText(content);
    if (!embedding) continue; // guard flipped mid-run; skip safely
    const { error: upErr } = await supabase
      .from("experiment_embeddings")
      .upsert({ experiment_id: e.id, content, embedding });
    if (upErr) throw upErr;
    done++;
    console.log(`  ✓ ${e.id}`);
    await sleep(600); // stay under free-tier rate limits
  }
  console.log(`[backfill] done — ${done}/${experiments.length} embedded.`);
}

main().catch((err) => {
  console.error("[backfill] failed:", err.message);
  process.exit(1);
});
