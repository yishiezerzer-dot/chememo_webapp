import "server-only";
import { createClient } from "@/lib/supabase/server";

// Sprint S2 — hand out the next EXP-### id from the DB sequence (atomic, no
// races). Backed by the next_experiment_id() SQL function; granted to
// authenticated so the caller's own session can invoke it.
export async function nextExperimentId(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("next_experiment_id");
  if (error) throw error;
  return data as string;
}
