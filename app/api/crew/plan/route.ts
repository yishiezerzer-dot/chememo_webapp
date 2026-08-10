import { createClient } from "@/lib/supabase/server";
import { isLlmEnabled } from "@/lib/llm";
import { runCrew } from "@/lib/ai/crew/coordinator";
import { MAX_CREW_BODY_BYTES, MAX_CREW_INPUT_CHARS } from "@/lib/rate-limit";
import { acquireAiSlot, logAiRequest } from "@/lib/ai/service";
import { AppError, HTTP_STATUS_FOR_CODE } from "@/lib/errors";
import { logError } from "@/lib/logger";

// POST { notes, projectId }. One crew run = one ai_requests row and ONE
// concurrency slot (D3) — the four agent calls inside runCrew are an
// implementation detail of a single logical request, not four separate
// rate-limited operations. Non-streaming: the whole CrewDraft returns in one
// JSON body once the run completes (spec's revalidated simplification —
// structured-JSON validation over perceived latency, matching T3.2).
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  if (!isLlmEnabled()) {
    return new Response("AI planning is not configured.", { status: 503 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_CREW_BODY_BYTES) {
    return new Response("Request too large.", { status: 413 });
  }

  const body = await req.json().catch(() => ({}));
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  const projectId = typeof body?.projectId === "string" && body.projectId ? body.projectId : null;

  if (!notes) {
    return new Response("Notes are required.", { status: 400 });
  }
  // D5 — reject over-limit input with the limit named; never silently
  // truncate (a truncated plan could drop the very detail that matters).
  if (notes.length > MAX_CREW_INPUT_CHARS) {
    return new Response(`Notes are too long (max ${MAX_CREW_INPUT_CHARS} characters).`, { status: 413 });
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

  const startedAt = Date.now();
  try {
    const draft = await runCrew(notes, projectId, true);
    const status = draft.failedAgents.length === 0 ? "ok" : "error";
    void logAiRequest({
      userId: user.id,
      endpoint: "crew_plan",
      status,
      sourceCount: projectId ? 1 : 0,
      latencyMs: Date.now() - startedAt,
      estTokens: Math.ceil((notes.length + JSON.stringify(draft).length) / 4),
    });
    return Response.json(draft);
  } catch (e) {
    logError("api/crew/plan", "runCrew failed", { error: e });
    void logAiRequest({
      userId: user.id,
      endpoint: "crew_plan",
      status: "error",
      sourceCount: projectId ? 1 : 0,
      latencyMs: Date.now() - startedAt,
      estTokens: null,
    });
    return new Response("Could not generate a plan right now.", { status: 502 });
  } finally {
    slot.release();
  }
}
