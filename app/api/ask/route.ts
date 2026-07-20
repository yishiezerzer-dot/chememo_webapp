import { createClient } from "@/lib/supabase/server";
import { keylessSearch } from "@/lib/search";
import { retrieveRecords } from "@/lib/rag";
import { isLlmEnabled, streamAnswer, streamGeneralAnswer } from "@/lib/llm";
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

  const body = await req.json().catch(() => ({}));
  const query = typeof body?.query === "string" ? body.query.trim() : "";

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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(line(meta));
      try {
        const gen = grounded ? streamAnswer(query, records) : streamGeneralAnswer(query);
        for await (const chunk of gen) controller.enqueue(enc.encode(chunk));
      } catch (e) {
        controller.enqueue(enc.encode(`\n[error generating answer]`));
        console.error("[api/ask] stream failed:", e);
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
