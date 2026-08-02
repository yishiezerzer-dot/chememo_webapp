"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import { extractExperimentFields } from "@/lib/llm";
import * as experimentsService from "@/lib/experiments/service";
import { getTemplateVersion } from "@/lib/templates/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { discardDraftAction } from "@/app/(app)/drafts-actions";
import { toActionResult } from "@/lib/errors";
import { parseExperimentForm, isEmptyValue } from "@/lib/experiment-form-parse";
import { type ActionResult, type ExperimentInput } from "@/lib/types";
import { experimentInputSchema, fieldErrorsFromZod, validateSampleMatrixVocab, validateQuantityUnits } from "@/lib/schemas";

// LLM-assisted entry: parse pasted notes into structured fields for the user to
// confirm/edit. No-ops (null) until a key exists (Phase 10). Never saves.
export async function extractFromNotes(
  notes: string
): Promise<Partial<ExperimentInput> | null> {
  await requireUser();
  if (!notes.trim()) return null;
  return extractExperimentFields(notes);
}

// T1.2 D2 — shared by create and update, since both write sample_matrix
// through the same schema and the vocabulary constraint applies either way.
async function checkSampleMatrixVocab(
  rows: ExperimentInput["sample_matrix"]
): Promise<string | null> {
  return validateSampleMatrixVocab(rows, await experimentsService.listSampleVocab());
}

// T1.4 D2/D7 — same pattern, for quantities' kind/unit membership.
async function checkQuantityUnits(quantities: ExperimentInput["quantities"]): Promise<string | null> {
  return validateQuantityUnits(quantities, await listQuantityKinds());
}

export async function createExperiment(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const parsed = experimentInputSchema.safeParse(parseExperimentForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const vocabError = await checkSampleMatrixVocab(parsed.data.sample_matrix);
  if (vocabError) return { ok: false, error: vocabError };

  const quantityError = await checkQuantityUnits(parsed.data.quantities);
  if (quantityError) return { ok: false, error: quantityError };

  // Provenance (T1.2 D6/D10) — never part of the schema; set by the
  // instantiate/clone pages as hidden fields, read directly here.
  const templateVersionId = (formData.get("template_version_id") as string | null) || null;
  const basedOnExperimentId = (formData.get("based_on_experiment_id") as string | null) || null;

  if (templateVersionId) {
    const version = await getTemplateVersion(templateVersionId);
    const missing = (version?.required_fields ?? []).filter((key) =>
      isEmptyValue((parsed.data as Record<string, unknown>)[key])
    );
    if (missing.length > 0) {
      const fieldErrors: Record<string, string> = {};
      for (const key of missing) fieldErrors[key] = "Required by this template.";
      return { ok: false, error: "Please fill in the fields required by this template.", fieldErrors };
    }
  }

  let id: string;
  try {
    id = await experimentsService.createExperiment(supabase, user.id, parsed.data, {
      templateVersionId,
      basedOnExperimentId,
    });
  } catch (e) {
    return toActionResult("createExperiment", e);
  }

  // T1.3 — the draft's job is done once the real record exists.
  const draftClientId = (formData.get("draft_client_id") as string | null) || null;
  if (draftClientId) void discardDraftAction({ clientDraftId: draftClientId });

  revalidatePath("/experiments");
  redirect(`/experiments/${id}`);
}

export async function updateExperiment(
  id: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const parsed = experimentInputSchema.safeParse(parseExperimentForm(formData));
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const vocabError = await checkSampleMatrixVocab(parsed.data.sample_matrix);
  if (vocabError) return { ok: false, error: vocabError };

  const quantityError = await checkQuantityUnits(parsed.data.quantities);
  if (quantityError) return { ok: false, error: quantityError };

  // T1.3 D4 — optimistic concurrency: the edit page stamps the record's
  // updated_at at render time; a mismatch means someone else's save landed
  // in between (D5: block and ask, never silently overwrite).
  const baseUpdatedAt = (formData.get("base_updated_at") as string | null) || null;

  let result: { conflict: boolean };
  try {
    result = await experimentsService.updateExperiment(supabase, id, parsed.data, baseUpdatedAt);
  } catch (e) {
    return toActionResult("updateExperiment", e);
  }
  if (result.conflict) {
    return {
      ok: false,
      conflict: true,
      error: "Someone else changed this experiment since you started editing.",
    };
  }

  void discardDraftAction({ targetExperimentId: id });

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
