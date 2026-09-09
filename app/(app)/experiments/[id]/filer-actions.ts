"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as timelineService from "@/lib/timeline/service";
import { acquireAiSlot, logAiRequest } from "@/lib/ai/service";
import { proposeEntries, proposeEntriesDeterministically } from "@/lib/timeline/file-entry";
import { isTimelineEventType } from "@/lib/timeline/classify";
import { toActionResult } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type { ActionResult } from "@/lib/types";
import type { ProposedEntry } from "@/lib/timeline/file-entry";
import type { TimelineEvent } from "@/lib/timeline/service";

export type FileResult = {
  proposal: ProposedEntry[];
  /** Set when the proposal is the deterministic one, and why. */
  degraded: "no_key" | "rate_limited" | "unparseable" | null;
  /** Written already, because the AI path failed and the words must not be lost. */
  written: TimelineEvent | null;
};

// Reads a note and proposes how to file it. Nothing is written on the happy
// path — the scientist sees the proposal first, because an entry they did not
// agree to is not their record.
//
// The exception is the whole point: if the AI path fails for ANY reason, the
// note is written immediately, verbatim, as a single entry. A rate limit, a
// provider outage or a missing key must never be able to swallow a sentence
// somebody typed at a bench. That is why this returns `written` alongside
// `proposal` rather than an error.
export async function proposeLogEntriesAction(
  experimentId: string,
  text: string,
  context: { experimentName: string; recentEntries: string[] }
): Promise<ActionResult<FileResult>> {
  const { supabase, user } = await requireUser();
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Write something before logging it." };

  // Saves the note verbatim and hands back a result that says why the AI did
  // not get to organise it.
  const saveVerbatim = async (why: FileResult["degraded"]): Promise<ActionResult<FileResult>> => {
    try {
      const row = await timelineService.addTimelineEvent(supabase, user.id, {
        experimentId,
        eventType: proposeEntriesDeterministically(trimmed)[0].eventType,
        observation: trimmed,
      });
      revalidatePath(`/experiments/${experimentId}`);
      return { ok: true, data: { proposal: [], degraded: why, written: row } };
    } catch (e) {
      return toActionResult("proposeLogEntriesAction", e);
    }
  };

  let slot: { release: () => void };
  try {
    slot = await acquireAiSlot(user.id);
  } catch {
    // Rate limited or at the global cap. The note still lands.
    return saveVerbatim("rate_limited");
  }

  const started = Date.now();
  try {
    const proposal = await proposeEntries(trimmed, context);
    if (!proposal) {
      // Either no key configured, or the model's output failed validation
      // twice. Both mean the same thing to the scientist: it is saved, just
      // not organised.
      void logAiRequest({
        userId: user.id,
        endpoint: "log_filer",
        // The union is ok|error; an unusable response is an error from the
        // observability point of view even though the note was still saved.
        status: "error",
        sourceCount: 0,
        latencyMs: Date.now() - started,
        estTokens: null,
      }).catch((e) => logError("filer", "ai_requests insert failed", { error: e }));
      return saveVerbatim("unparseable");
    }

    void logAiRequest({
      userId: user.id,
      endpoint: "log_filer",
      status: "ok",
      sourceCount: proposal.length,
      latencyMs: Date.now() - started,
      estTokens: null,
    }).catch((e) => logError("filer", "ai_requests insert failed", { error: e }));

    return { ok: true, data: { proposal, degraded: null, written: null } };
  } finally {
    slot.release();
  }
}

// Writes the entries the scientist agreed to, after any edits they made. Each
// is validated again here: the client is not a trust boundary, and an event
// type that reached this point from a model rather than the picker would
// otherwise go straight at the table's CHECK.
export async function commitLogEntriesAction(
  experimentId: string,
  entries: ProposedEntry[]
): Promise<ActionResult<TimelineEvent[]>> {
  const { supabase, user } = await requireUser();
  if (entries.length === 0) return { ok: false, error: "Nothing to save." };
  if (entries.length > 8) return { ok: false, error: "That is too many entries for one note." };

  const written: TimelineEvent[] = [];
  try {
    for (const e of entries) {
      if (!isTimelineEventType(e.eventType)) {
        return { ok: false, error: `"${e.eventType}" is not a kind of log entry.` };
      }
      written.push(
        await timelineService.addTimelineEvent(supabase, user.id, {
          experimentId,
          eventType: e.eventType,
          action: e.action,
          observation: e.observation,
          nextAction: e.nextAction,
          deviationNote: e.deviationNote,
          subjectLabel: e.subjectLabel,
          details: { filed_by: "ai" },
        })
      );
    }
  } catch (err) {
    const failure = toActionResult("commitLogEntriesAction", err);
    revalidatePath(`/experiments/${experimentId}`);
    return written.length > 0
      ? { ...failure, error: `${written.length} of ${entries.length} entries were saved. ${failure.error}` }
      : failure;
  }

  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true, data: written };
}
