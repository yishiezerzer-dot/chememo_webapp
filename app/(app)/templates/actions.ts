"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as templatesService from "@/lib/templates/service";
import { listSampleVocab } from "@/lib/experiments/service";
import { toActionResult } from "@/lib/errors";
import { parseExperimentForm } from "@/lib/experiment-form-parse";
import { experimentInputSchema, fieldErrorsFromZod, validateSampleMatrixVocab } from "@/lib/schemas";
import type { ActionResult, ExperimentInput } from "@/lib/types";
import { z } from "zod";

export async function createNewTemplate(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) {
    return { ok: false, error: "Name is required.", fieldErrors: { name: "Name is required." } };
  }
  const description = ((formData.get("description") as string | null) ?? "").trim() || null;

  let id: string;
  try {
    id = await templatesService.createTemplate(supabase, user.id, name, description);
  } catch (e) {
    return toActionResult("createNewTemplate", e);
  }

  revalidatePath("/templates");
  redirect(`/templates/${id}/edit`);
}

// A template's defaults are a Partial<ExperimentInput> (T1.2 D4) — every
// field optional, since a template only pre-fills the sections its author
// chose to. .partial() reuses the same per-field rules (max lengths, the
// sample-matrix row shape) without a parallel schema — except `name`, whose
// base rule (min 1 char) still applies to an empty string even under
// .partial() (that only makes the key omittable, not the value optional),
// and a template has no fixed experiment name to require at all.
const templateDefaultsSchema = experimentInputSchema.partial().extend({
  name: z.string().trim().max(300, "Too long (max 300 characters)."),
});

export async function saveTemplateVersion(
  templateId: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const parsed = templateDefaultsSchema.safeParse(parseExperimentForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  if (parsed.data.sample_matrix) {
    const vocabError = validateSampleMatrixVocab(parsed.data.sample_matrix, await listSampleVocab());
    if (vocabError) return { ok: false, error: vocabError };
  }

  const requiredFields = ((formData.get("required_fields") as string | null) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as (keyof ExperimentInput)[];

  try {
    await templatesService.createOrUpdateVersion(supabase, user.id, templateId, parsed.data, requiredFields);
  } catch (e) {
    return toActionResult("saveTemplateVersion", e);
  }

  revalidatePath(`/templates/${templateId}/edit`);
  revalidatePath("/templates");
  redirect("/templates");
}

export async function archiveTemplateAction(templateId: string) {
  const { supabase } = await requireUser();
  await templatesService.archiveTemplate(supabase, templateId);
  revalidatePath("/templates");
  redirect("/templates");
}
