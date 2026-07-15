// Phase 10 verification for the active AI provider. Needs a key + backfilled
// embeddings. Usage: node --env-file=.env.local scripts/verify-ai.ts
import { createClient } from "@supabase/supabase-js";
import { embedText } from "../lib/embeddings.ts";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, svc);

async function main() {
  // 1) Semantic retrieval — a fuzzy description with no exact keyword overlap.
  const q = "samples that formed droplets or a coacervate phase";
  const embedding = await embedText(q);
  if (!embedding) throw new Error("embedText returned null — no key?");
  console.log(`embedding dims: ${embedding.length}`);

  const { data: matches, error } = await supabase.rpc("match_experiments", {
    query_embedding: JSON.stringify(embedding),
    match_count: 5,
  });
  if (error) throw error;
  console.log("\nsemantic top-5 for:", JSON.stringify(q));
  for (const m of matches as { id: string; name: string; similarity: number }[]) {
    console.log(`  ${m.id}  sim=${m.similarity.toFixed(3)}  ${m.name}`);
  }

  // 2) Grounded generation — feed those records to the chat model and check it
  //    answers with [EXP-###] citations and doesn't invent.
  const ids = (matches as { id: string }[]).map((m) => m.id);
  const { data: recs } = await supabase
    .from("experiments")
    .select("id,name,reaction_type,ph,observations")
    .in("id", ids);
  const context = (recs ?? [])
    .map(
      (e) =>
        `[${e.id}] ${e.name}\nReaction: ${e.reaction_type}\npH: ${e.ph}\nObservations: ${e.observations}`
    )
    .join("\n\n");

  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_CHAT_MODEL || "gemini-flash-latest";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text: "Answer ONLY from the provided records. Cite every claim with [EXP-###]. Never invent. Be concise.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: `Question: Which samples produced droplets?\n\nRecords:\n${context}` }],
          },
        ],
        generationConfig: { maxOutputTokens: 400, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }
  );
  const j = await res.json();
  const answer = (j?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();
  console.log("\ngrounded answer:\n" + answer);
  console.log("\ncites [EXP-###]:", /\[EXP-\d+\]/.test(answer) ? "YES ✓" : "NO ✗");
}

main().catch((e) => {
  console.error("verify failed:", e.message);
  process.exit(1);
});
