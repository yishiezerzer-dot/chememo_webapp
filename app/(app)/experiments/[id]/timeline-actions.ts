"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as timelineService from "@/lib/timeline/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import type { TimelineEvent, TimelineEventType } from "@/lib/timeline/service";

// The one place a sentence goes. Everything else on the page writes structured
// rows that project into the log by trigger; this is the direct path for
// "here is what just happened", which is most of what a bench notebook holds.
export async function addLogEntryAction(
  experimentId: string,
  text: string,
  eventType: TimelineEventType,
  correctsEventId?: string
): Promise<ActionResult<TimelineEvent>> {
  const { supabase, user } = await requireUser();
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: "Write something before logging it." };

  let created: TimelineEvent;
  try {
    created = await timelineService.addTimelineEvent(supabase, user.id, {
      experimentId,
      eventType,
      // Free text lands in `observation` rather than `action`: §3.3 keeps raw
      // observation separate from interpretation, and what someone types at a
      // bench is an observation until they say otherwise. The structured
      // action/next_action fields are filled by the projections and, later, by
      // the AI filer.
      observation: trimmed,
      correctsEventId: correctsEventId ?? null,
    });
  } catch (e) {
    return toActionResult("addLogEntryAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true, data: created };
}
