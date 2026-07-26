"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import { extractExperimentFields } from "@/lib/llm";
import * as experimentsService from "@/lib/experiments/service";
import { toActionResult } from "@/lib/errors";
import { METHOD_OPTIONS, type ActionResult, type ExperimentInput } from "@/lib/types";
import { experimentInputSchema, fieldErrorsFromZod } from "@/lib/schemas";

// LLM-assisted entry: parse pasted notes into structured fields for the user to
// confirm/edit. No-ops (null) until a key exists (Phase 10). Never saves.
export async function extractFromNotes(
  notes: string
): Promise<Partial<ExperimentInput> | null> {
  await requireUser();
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
  const { supabase, user } = await requireUser();

  const parsed = experimentInputSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  let id: string;
  try {
    id = await experimentsService.createExperiment(supabase, user.id, parsed.data);
  } catch (e) {
    return toActionResult("createExperiment", e);
  }

  revalidatePath("/experiments");
  redirect(`/experiments/${id}`);
}

export async function updateExperiment(
  id: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const parsed = experimentInputSchema.safeParse(parseForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  try {
    await experimentsService.updateExperiment(supabase, id, parsed.data);
  } catch (e) {
    return toActionResult("updateExperiment", e);
  }

  revalidatePath(`/experiments/${id}`);
  revalidatePath("/experiments");
  redirect(`/experiments/${id}`);
}

export async function softDeleteExperiment(id: string) {
  const { supabase } = await requireUser();
  await experimentsService.softDeleteExperiment(supabase, id);
  revalidatePath("/experiments");
  redirect("/experiments");
}
