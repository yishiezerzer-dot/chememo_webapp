"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { METHOD_OPTIONS, type ExperimentInput } from "@/lib/types";

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

async function nextExperimentId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  // Continue the EXP-### sequence. Reads the current max; fine for a lab-scale
  // single-writer-at-a-time tool. A DB sequence would harden this later.
  const { data } = await supabase
    .from("experiments")
    .select("id")
    .like("id", "EXP-%")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = data?.id ? parseInt(data.id.replace("EXP-", ""), 10) : 0;
  const n = Number.isFinite(last) ? last + 1 : 1;
  return `EXP-${String(n).padStart(3, "0")}`;
}

export async function createExperiment(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const input = parseForm(formData);
  if (!input.name) return; // name is required; the form enforces this too

  const id = await nextExperimentId(supabase);
  const { error } = await supabase
    .from("experiments")
    .insert({ id, owner_id: user.id, ...input });
  if (error) throw error;

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

  revalidatePath("/experiments");
  redirect("/experiments");
}
