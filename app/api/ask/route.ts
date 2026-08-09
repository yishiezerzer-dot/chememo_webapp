import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { keylessSearch } from "@/lib/search";
import { retrieveRecords, type MatchExplanation } from "@/lib/rag";
import { isLlmEnabled, generateCitedAnswer, streamGeneralAnswer, type CitedAnswer } from "@/lib/llm";
import { MAX_BODY_BYTES, MAX_QUERY_CHARS } from "@/lib/rate-limit";
import { acquireAiSlot, logAiRequest } from "@/lib/ai/service";
import { AppError, HTTP_STATUS_FOR_CODE } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type { Experiment } from "@/lib/types";

// POST { query }. Body is line-framed: the FIRST line is JSON metadata
// (mode/grounded/results/…), and the rest of the body is the answer.
// Query travels in the POST body, not the URL (no logging).
//
// T3.2 D2 — grounded lab-mode answers are ONE structured JSON body (written
// in a single enqueue, not incrementally) rather than streamed prose: citation
// determinism needs the whole model response parsed and validated before any
// of it can be shown (see lib/llm.ts's generateCitedAnswer). `meta.streaming`
// tells the client which shape to expect: true = live-streamed prose text
// (context/general-knowledge path, unchanged), false = a single already-
// complete JSON `CitedAnswer` body (grounded lab-mode) or no body at all
// (keyless / empty-result cases, unchanged).

type AskMeta = {
  mode: "keyless" | "ai";
  askMode: "lab" | "context";
  grounded: boolean;
  streaming: boolean;
  interpretation: string[];
  results: Experiment[];
  emptyReason: string | null;
  // T3.3 D2 — per-experiment "why it matched" (audit §11.4), keyed by
  // experiment id. A plain object, not a Map — Maps don't serialize to JSON.
  explanations: Record<string, MatchExplanation>;
  // T3.4 D4 — the ai_requests row id for this answer, so the client can
  // submit feedback against it. Null when no such row exists (keyless mode,
  // or the empty-results early return before any generation was attempted).
  requestId: string | null;
};

function explanationsObject(map: Map<string, MatchExplanation>): Record<string, MatchExplanation> {
  return Object.fromEntries(map);
}

// T3.4 D2 — persists T3.3's already-computed match explanations for the
// evidence inspector + eval, alongside whichever ai_requests row (if any)
// this retrieval fed into. Best-effort — a logging failure never blocks the
// answer itself.
async function logRetrievalEvent(row: {
  requestId: string | null;
  userId: string;
  query: string;
  askMode: "lab" | "context";
  routerMode: "filter" | "semantic" | "both" | null;
  explanations: Map<string, MatchExplanation>;
}): Promise<void> {
  const { error } = await createAdminClient().from("ai_retrieval_events").insert({
    ai_request_id: row.requestId,
    user_id: row.userId,
    query: row.query,
    ask_mode: row.askMode,
    router_mode: row.routerMode,
    retrieved: [...row.explanations.values()],
  });
  if (error) logError("api/ask", "failed to log ai_retrieval_events row", { error });
}

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
      line({ mode: "keyless", askMode, grounded: false, streaming: false, interpretation: [], results: [], emptyReason: null, explanations: {}, requestId: null }),
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
        explanations: {},
        requestId: null,
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
  const retrieved =
    askMode === "lab"
      ? await retrieveRecords(query)
      : { records: [], routerFailed: false, evidence: new Map(), explanations: new Map(), routerMode: null };
  const records = retrieved.records;

  if (askMode === "lab" && records.length === 0) {
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
        explanations: {},
        requestId: null,
      }),
      { headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const startedAt = Date.now();

  // Lab mode with candidate records: attempt a structured, cited answer.
  if (askMode === "lab") {
    let cited: CitedAnswer | null = null;
    let status: "ok" | "error" = "ok";
    try {
      cited = await generateCitedAnswer(query, records, retrieved.evidence);
    } catch (e) {
      status = "error";
      logError("api/ask", "generateCitedAnswer failed", { error: e });
    }

    if (cited) {
      slot.release();
      const requestId = await logAiRequest({
        userId: user.id,
        endpoint: "ask_grounded",
        status,
        sourceCount: records.length,
        latencyMs: Date.now() - startedAt,
        estTokens: Math.ceil((query.length + JSON.stringify(cited).length) / 4),
      });
      void logRetrievalEvent({
        requestId,
        userId: user.id,
        query,
        askMode,
        routerMode: retrieved.routerMode,
        explanations: retrieved.explanations,
      });
      const meta: AskMeta = {
        mode: "ai",
        askMode,
        grounded: true,
        streaming: false,
        interpretation: [],
        results: records,
        emptyReason: null,
        explanations: explanationsObject(retrieved.explanations),
        requestId,
      };
      return new Response(
        new Blob([line(meta), enc.encode(JSON.stringify(cited))]),
        { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }
      );
    }

    // The records didn't actually answer the question (or generation
    // failed/is disabled) — fall through to a general-knowledge answer,
    // clearly marked as not grounded, exactly like askMode "context" below.
    // Still log the retrieval attempt for observability, tagged to this
    // (failed-to-ground) request row.
    const fallthroughRequestId = await logAiRequest({
      userId: user.id,
      endpoint: "ask_grounded",
      status,
      sourceCount: records.length,
      latencyMs: Date.now() - startedAt,
      estTokens: null,
    });
    void logRetrievalEvent({
      requestId: fallthroughRequestId,
      userId: user.id,
      query,
      askMode,
      routerMode: retrieved.routerMode,
      explanations: retrieved.explanations,
    });
  }

  // Context mode, or lab mode that fell through above: stream a general-
  // knowledge answer, never citing experiment IDs.
  const meta: AskMeta = {
    mode: "ai",
    askMode,
    grounded: false,
    streaming: true,
    interpretation: [],
    results: [],
    emptyReason: null,
    explanations: {},
    // T3.4 D4 — no request id available yet at this point: the visible
    // general-knowledge answer's own ai_requests row isn't written until the
    // stream finishes (see the finally block below), so feedback isn't
    // offered on streamed answers this pass (frontend hides the widget when
    // requestId is null).
    requestId: null,
  };

  let answerChars = 0;
  const generalStartedAt = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line(meta));
      let status: "ok" | "error" = "ok";
      try {
        for await (const chunk of streamGeneralAnswer(query)) {
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
          endpoint: "ask_general",
          status,
          sourceCount: 0,
          latencyMs: Date.now() - generalStartedAt,
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
