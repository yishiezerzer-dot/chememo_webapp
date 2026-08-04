import type { Experiment } from "@/lib/types";

// Provider-agnostic embeddings. Switch via AI_PROVIDER: "gemini" (default) or
// "openai" (anthropic has no embeddings → falls back to openai). Both produce
// 1536-dim vectors to match experiment_embeddings.embedding vector(1536).
// INERT (returns null) when the selected provider has no key.
//
// Kept free of runtime @/ imports so the backfill/test scripts can import it
// directly under Node's TS type-stripping.

export const EMBEDDING_DIM = 1536;

type EmbedProvider = "gemini" | "openai";

function embedProvider(): EmbedProvider {
  const p = (process.env.AI_PROVIDER || "gemini").toLowerCase();
  return p === "openai" || p === "anthropic" ? "openai" : "gemini";
}

function embedKey(p: EmbedProvider): string | undefined {
  return p === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
}

export function embeddingModel(): string {
  return embedProvider() === "gemini"
    ? process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001"
    : process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
}

export function isEmbeddingEnabled(): boolean {
  return !!embedKey(embedProvider());
}

// Deterministic string fed to the embedder. Pure + reusable from the backfill.
export function buildEmbeddingInput(
  e: Pick<
    Experiment,
    | "name"
    | "reaction_type"
    | "compounds"
    | "metals"
    | "methods"
    | "observations"
    | "notes"
  >
): string {
  const parts: string[] = [e.name.trim()];
  if (e.reaction_type) parts.push(`Reaction: ${e.reaction_type}`);
  if (e.compounds.length) parts.push(`Compounds: ${e.compounds.join(", ")}`);
  if (e.metals.length) parts.push(`Metals: ${e.metals.join(", ")}`);
  if (e.methods.length) parts.push(`Methods: ${e.methods.join(", ")}`);
  if (e.observations) parts.push(`Observations: ${e.observations}`);
  if (e.notes) parts.push(`Notes: ${e.notes}`);
  return parts.join("\n");
}

// Returns a 1536-dim vector, or null when embeddings are disabled (no key).
export async function embedText(text: string): Promise<number[] | null> {
  const p = embedProvider();
  const key = embedKey(p);
  if (!key) return null;
  const model = embeddingModel();

  if (p === "gemini") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          outputDimensionality: EMBEDDING_DIM,
        }),
      }
    );
    if (!res.ok) {
      throw new Error(`Gemini embed ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const j = await res.json();
    const v = j?.embedding?.values;
    return Array.isArray(v) ? v : null;
  }

  // openai
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: key });
  const res = await client.embeddings.create({
    model,
    input: text,
    dimensions: EMBEDDING_DIM,
  });
  return res.data[0].embedding;
}

export async function embedExperiment(
  e: Parameters<typeof buildEmbeddingInput>[0]
): Promise<{ content: string; embedding: number[] } | null> {
  const content = buildEmbeddingInput(e);
  const embedding = await embedText(content);
  if (!embedding) return null;
  return { content, embedding };
}
