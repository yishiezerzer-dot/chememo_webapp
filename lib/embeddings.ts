import type { Experiment } from "@/lib/types";

// Phase 6 — embeddings plumbing. Written now, INERT until an OpenAI key exists
// (Phase 10). Every embed call no-ops (returns null) when the key is absent, so
// the app never crashes pre-key.

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536; // must match experiment_embeddings.embedding vector(1536)

export function isEmbeddingEnabled(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

// Deterministic string fed to the embedder. Includes the semantic fields a
// researcher would search on. Pure + side-effect free so it is unit-testable
// and reusable from the backfill script.
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

// Lazily construct the client so importing this module never requires a key.
async function getClient() {
  const { default: OpenAI } = await import("openai");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Returns a 1536-dim vector, or null when embeddings are disabled (no key).
export async function embedText(text: string): Promise<number[] | null> {
  if (!isEmbeddingEnabled()) return null;
  const client = await getClient();
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
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
