import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { keylessSearch } from "@/lib/search";
import { retrieveRecords } from "@/lib/rag";
import { isLlmEnabled, activeChatModel, streamAnswer, streamGeneralAnswer } from "@/lib/llm";
import { acquireConcurrency, checkRate, MAX_BODY_BYTES, MAX_QUERY_CHARS } from "@/lib/rate-limit";
import type { Experiment } from "@/lib/types";

// POST { query }. Body is line-framed: the FIRST line is JSON metadata
// (mode/grounded/results/…), and — for AI answers — the rest of the body is the
// streamed answer text. Query travels in the POST body, not the URL (no logging).

type AskMeta = {
  mode: "keyless" | "ai";
  grounded: boolean;
  streaming: boolean;
  interpretation: string[];
  results: Experiment[];
  emptyReason: string | null;
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return new Response("Request too large.", { status: 413 });
  }

  const body = await req.json().catch(() => ({}));
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (query.length > MAX_QUERY_CHARS) {
    return new Response("Question is too long.", { status: 413 });
  }

  const enc = new TextEncoder();
  const line = (meta: AskMeta) => enc.encode(JSON.stringify(meta) + "\n");

  if (!query) {
    return new Response(
      line({ mode: "keyless", grounded: false, streaming: false, interpretation: [], results: [], emptyReason: null }),
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  // Keyless (no key): deterministic search, no answer stream.
  if (!isLlmEnabled()) {
    const ks = await keylessSearch(query);
    return new Response(
      line({
        mode: "keyless",
        grounded: false,
        streaming: false,
        interpretation: ks.interpretation,
        results: ks.results,
        emptyReason: ks.emptyReason,
      }),
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const rate = checkRate(user.id);
  if (!rate.ok) return new Response(rate.error, { status: 429 });
  const slot = acquireConcurrency(user.id);
  if (!slot.ok) return new Response(slot.error, { status: 429 });

  // AI: retrieve first, then stream the answer.
  const records = await retrieveRecords(query);
  const grounded = records.length > 0;
  const meta: AskMeta = {
    mode: "ai",
    grounded,
    streaming: true,
    interpretation: [],
    results: grounded ? records : [],
    emptyReason: null,
  };

  const startedAt = Date.now();
  let answerChars = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line(meta));
      let status: "ok" | "error" = "ok";
      try {
        const gen = grounded ? streamAnswer(query, records) : streamGeneralAnswer(query);
        for await (const chunk of gen) {
          answerChars += chunk.length;
          controller.enqueue(enc.encode(chunk));
        }
      } catch (e) {
        status = "error";
        controller.enqueue(enc.encode(`\n[error generating answer]`));
        console.error("[api/ask] stream failed:", e);
      } finally {
        slot.release();
        void logAiRequest({
          userId: user.id,
          endpoint: grounded ? "ask_grounded" : "ask_general",
          status,
          sourceCount: records.length,
          latencyMs: Date.now() - startedAt,
          estTokens: Math.ceil((query.length + answerChars) / 4),
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function logAiRequest(row: {
  userId: string;
  endpoint: "ask_grounded" | "ask_general";
  status: "ok" | "error";
  sourceCount: number;
  latencyMs: number;
  estTokens: number;
}) {
  const { error } = await createAdminClient().from("ai_requests").insert({
    user_id: row.userId,
    endpoint: row.endpoint,
    status: row.status,
    source_count: row.sourceCount,
    model: activeChatModel(),
    est_tokens: row.estTokens,
    latency_ms: row.latencyMs,
  });
  if (error) console.error("[api/ask] failed to log ai_requests row:", error);
}
