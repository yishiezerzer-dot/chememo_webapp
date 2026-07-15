// One-off: how similar are off-topic vs on-topic queries to the corpus?
import { createClient } from "@supabase/supabase-js";
import { embedText } from "../lib/embeddings.ts";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const queries = [
  "which samples formed droplets",           // on-topic, should match
  "wet-dry cycling at high pH with zinc",    // on-topic
  "what is the capital of France",           // off-topic
  "how do I bake sourdough bread",           // off-topic
  "explain the theory of relativity",        // off-topic
  "experiments using a platinum catalyst",   // on-topic-ish but Pt not in corpus
];

for (const q of queries) {
  const emb = await embedText(q);
  const { data } = await supabase.rpc("match_experiments", {
    query_embedding: JSON.stringify(emb),
    match_count: 1,
  });
  const top = (data as { similarity: number }[])?.[0]?.similarity ?? 0;
  console.log(`${top.toFixed(3)}  ${q}`);
  await new Promise((r) => setTimeout(r, 400));
}
