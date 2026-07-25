"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractExperimentFields } from "@/lib/llm";
import { nextExperimentId } from "@/lib/experiment-id";
import { runIndexJob } from "@/lib/index-jobs";
import { METHOD_OPTIONS, type ActionResult, type ExperimentInput } from "@/lib/types";
import { experimentInputSchema, fieldErrorsFromZod } from "@/lib/schemas";

// LLM-assisted entry: parse pasted notes into structured fields for the user to
// confirm/edit. No-ops (null) until a key exists (Phase 10). Never saves.
export async function extractFromNotes(
  notes: string
): Promise<Partial<ExperimentInput> | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  if (!notes.trim()) return null;
  return extractExperimentFields(notes);
}

// Candidate values straight off the form — numeric fields may be `NaN` when
// the input was non-empty but not a valid number; the schema below is what
// rejects that, not this parser (never silently coerce invalid input to null).
function parseForm(formData: FormData) {
  const str = (k: string) => {
    const v = (formData.get(k) as string | null)?.trim();
    return v ? v : null;
  };
  const list = (k: string) =>
    (formData.get(k) as string | null || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const numList = (k: string) => list(k).map((s) => Number(s));
  const num = (k: string) => {
    const v = str(k);
    return v === null ? null : Number(v);
  };

  const methods = METHOD_OPTIONS.filter((m) => formData.get(`method:${m}`) === "on");

  return {
    name: str("name") ?? "",
    date: str("date"),
    researcher: str("researcher"),
    project: str("project"),
    reaction_type: str("reaction_type"),
    compounds: list("compounds"),
    metals: list("metals"),
    ph: num("ph"),
    concentration: str("concentration"),
    temperature: str("temperature"),
    cycles: num("cycles"),
    methods,
    mz: numList("mz"),
    observations: str("observations"),
    notes: str("notes"),
  };
}

export async function createExperiment(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = experimentInputSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input: ExperimentInput = parsed.data;

  const id = await nextExperimentId();
  const { error } = await supabase
    .from("experiments")
    .insert({ id, owner_id: user.id, ...input });
  if (error) throw error;

  // Keep semantic search current; fire-and-forget so a slow embed API can't
  // block the redirect (Railway's persistent server finishes it in the bg).
  // The DB trigger already durably enqueued this experiment's index_jobs
  // row — runIndexJob is the fast-path attempt at that job; if it fails or
  // the process dies before it finishes, the poller in lib/index-jobs.ts
  // picks it up from the durable row instead of losing it silently (T0.5).
  void runIndexJob(id).catch((e) =>
    console.error(`[index-jobs] create ${id} failed:`, e)
  );

  revalidatePath("/experiments");
  redirect(`/experiments/${id}`);
}

export async function updateExperiment(
  id: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = experimentInputSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }
  const input: ExperimentInput = parsed.data;

  // RLS enforces ownership; this update no-ops for non-owners.
  const { error } = await supabase.from("experiments").update(input).eq("id", id);
  if (error) throw error;

  // Re-embed the edited record so semantic search reflects the changes.
  void runIndexJob(id).catch((e) =>
    console.error(`[index-jobs] update ${id} failed:`, e)
  );

  // Edited fields make any cached AI summary stale — drop it so the detail page
  // shows "regenerate" instead of an out-of-date summary. Best-effort.
  void createAdminClient()
    .from("ai_summaries")
    .delete()
    .eq("experiment_id", id)
    .eq("scope", "single")
    .then(({ error }) => {
      if (error) console.error(`[summary-invalidate] update ${id} failed:`, error);
    });

  revalidatePath(`/experiments/${id}`);
  revalidatePath("/experiments");
  redirect(`/experiments/${id}`);
}

export async function softDeleteExperiment(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("experiments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  // Drop the now-deleted experiment from semantic search.
  void runIndexJob(id).catch((e) =>
    console.error(`[index-jobs] delete ${id} failed:`, e)
  );

  revalidatePath("/experiments");
  redirect("/experiments");
}
