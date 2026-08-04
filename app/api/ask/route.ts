import { createClient } from "@/lib/supabase/server";
import { keylessSearch } from "@/lib/search";
import { retrieveRecords } from "@/lib/rag";
import { isLlmEnabled, streamAnswer, streamGeneralAnswer } from "@/lib/llm";
import { MAX_BODY_BYTES, MAX_QUERY_CHARS } from "@/lib/rate-limit";
import { acquireAiSlot, logAiRequest } from "@/lib/ai/service";
import { AppError, HTTP_STATUS_FOR_CODE } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type { Experiment } from "@/lib/types";

// POST { query }. Body is line-framed: the FIRST line is JSON metadata
// (mode/grounded/results/…), and — for AI answers — the rest of the body is the
// streamed answer text. Query travels in the POST body, not the URL (no logging).

type AskMeta = {
  mode: "keyless" | "ai";
  askMode: "lab" | "context";
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
  // Never trust the client blindly — anything but the literal "context" is
  // treated as "lab" (the safe default that never emits general knowledge).
  const askMode: "lab" | "context" = body?.mode === "context" ? "context" : "lab";

  const enc = new TextEncoder();
  const line = (meta: AskMeta) => enc.encode(JSON.stringify(meta) + "\n");

  if (!query) {
    return new Response(
      line({ mode: "keyless", askMode, grounded: false, streaming: false, interpretation: [], results: [], emptyReason: null }),
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  // Keyless (no key): deterministic search, no answer stream.
  if (!isLlmEnabled()) {
    const ks = await keylessSearch(query);
    return new Response(
      line({
        mode: "keyless",
        askMode,
        grounded: false,
        streaming: false,
        interpretation: ks.interpretation,
        results: ks.results,
        emptyReason: ks.emptyReason,
      }),
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  let slot: { release: () => void };
  try {
    slot = await acquireAiSlot(user.id);
  } catch (e) {
    if (e instanceof AppError) {
      return new Response(e.message, { status: HTTP_STATUS_FOR_CODE[e.code] });
    }
    throw e;
  }

  // Lab mode: retrieve first. If nothing matches, say so explicitly — never
  // fall back to general knowledge, which could read as a lab conclusion.
  const retrieved = askMode === "lab" ? await retrieveRecords(query) : { records: [], routerFailed: false };
  const records = retrieved.records;
  const grounded = askMode === "lab" && records.length > 0;

  if (askMode === "lab" && !grounded) {
    slot.release();
    return new Response(
      line({
        mode: "ai",
        askMode,
        grounded: false,
        streaming: false,
        interpretation: [],
        results: [],
        emptyReason: retrieved.routerFailed
          ? "Couldn't parse that question for lab search — try rephrasing it."
          : "No matching experiments found in your lab.",
      }),
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const meta: AskMeta = {
    mode: "ai",
    askMode,
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
        logError("api/ask", "stream failed", { error: e });
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
