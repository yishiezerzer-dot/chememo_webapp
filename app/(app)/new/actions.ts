"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractExperimentFields } from "@/lib/llm";
import { nextExperimentId } from "@/lib/experiment-id";
import { syncExperimentEmbedding } from "@/lib/sync-embedding";
import { METHOD_OPTIONS, type ExperimentInput } from "@/lib/types";

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

function parseForm(formData: FormData): ExperimentInput {
  const str = (k: string) => {
    const v = (formData.get(k) as string | null)?.trim();
    return v ? v : null;
  };
  const list = (k: string) =>
    (formData.get(k) as string | null || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  const numList = (k: string) =>
    list(k)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n));
  const num = (k: string) => {
    const v = str(k);
    if (v === null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
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

export async function createExperiment(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const input = parseForm(formData);
  if (!input.name) return; // name is required; the form enforces this too

  const id = await nextExperimentId();
  const { error } = await supabase
    .from("experiments")
    .insert({ id, owner_id: user.id, ...input });
  if (error) throw error;

  // Keep semantic search current; fire-and-forget so a slow embed API can't
  // block the redirect (Railway's persistent server finishes it in the bg).
  void syncExperimentEmbedding(id).catch((e) =>
    console.error(`[sync-embedding] create ${id} failed:`, e)
  );

  revalidatePath("/experiments");
  redirect(`/experiments/${id}`);
}

export async function updateExperiment(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const input = parseForm(formData);
  if (!input.name) return;

  // RLS enforces ownership; this update no-ops for non-owners.
  const { error } = await supabase.from("experiments").update(input).eq("id", id);
  if (error) throw error;

  // Re-embed the edited record so semantic search reflects the changes.
  void syncExperimentEmbedding(id).catch((e) =>
    console.error(`[sync-embedding] update ${id} failed:`, e)
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
  void syncExperimentEmbedding(id).catch((e) =>
    console.error(`[sync-embedding] delete ${id} failed:`, e)
  );

  revalidatePath("/experiments");
  redirect("/experiments");
}
