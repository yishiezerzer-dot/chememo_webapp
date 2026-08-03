"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as notificationsService from "@/lib/notifications/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";

export async function markNotificationReadAction(notificationId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await notificationsService.markRead(supabase, notificationId);
  } catch (e) {
    return toActionResult("markNotificationReadAction", e);
  }
  revalidatePath("/notifications");
  return { ok: true };
}

// Submitted via a plain <form action> (no client JS needed for this one), so
// unlike the others here it returns void rather than ActionResult.
export async function markAllNotificationsReadAction(): Promise<void> {
  const { supabase, user } = await requireUser();
  await notificationsService.markAllRead(supabase, user.id);
  revalidatePath("/notifications");
}
