"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isLlmEnabled, summarizeExperiment, activeChatModel } from "@/lib/anthropic";

// Generate + cache a grounded single-experiment summary. No-ops (inert) until
// an ANTHROPIC key exists. Regenerating replaces the prior single-scope row.
export async function generateSummary(experimentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!isLlmEnabled()) return; // Phase 10 flips this on

  // Read via the user's session so RLS confirms they may see this experiment.
  const { data: experiment } = await supabase
    .from("experiments")
    .select("*")
    .eq("id", experimentId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!experiment) return;

  const summary = await summarizeExperiment(experiment);
  if (!summary) return;

  // Write with the service role (AI content is trusted server output); replace
  // any existing single-scope summary so the cache holds just the latest.
  const admin = createAdminClient();
  await admin
    .from("ai_summaries")
    .delete()
    .eq("experiment_id", experimentId)
    .eq("scope", "single");
  await admin.from("ai_summaries").insert({
    experiment_id: experimentId,
    scope: "single",
    summary,
    model: activeChatModel(),
    source_ids: [experimentId],
  });

  revalidatePath(`/experiments/${experimentId}`);
}
