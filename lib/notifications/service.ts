import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { Notification } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function listNotifications(userId: string): Promise<Notification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function unreadCount(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  return count ?? 0;
}

// Returns the updated row so the list can patch its sticky state from the
// server's own read_at rather than one assembled on the client.
export async function markRead(supabase: Supabase, notificationId: string): Promise<Notification> {
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .select("*")
    .single();
  if (error) throw new AppError("conflict", "Could not mark this notification read.", { cause: error });
  return data as Notification;
}

export async function markAllRead(supabase: Supabase, userId: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw new AppError("conflict", "Could not mark notifications read.", { cause: error });
}
