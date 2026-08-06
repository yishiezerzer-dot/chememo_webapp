"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace, requireUser } from "@/lib/authorization/policies";
import * as analyticalService from "@/lib/analytical/service";
import { listControlledVocab } from "@/lib/experiments/service";
import { validateMethodType } from "@/lib/schemas";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, MethodType } from "@/lib/types";

export async function createInstrumentAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, user, workspaceId } = await requireWorkspace();
  const str = (k: string) => ((formData.get(k) as string | null) ?? "").trim() || null;

  const name = str("name");
  if (!name) return { ok: false, error: "Name is required.", fieldErrors: { name: "Required." } };

  try {
    await analyticalService.createInstrument(supabase, user.id, workspaceId, name, str("model"), str("serial_number"), str("location"));
  } catch (e) {
    return toActionResult("createInstrumentAction", e);
  }
  revalidatePath("/instruments");
  return { ok: true };
}

export async function createMethodAction(instrumentId: string, name: string, methodType: MethodType): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a method name." };

  const allowed = await listControlledVocab("method_type");
  const err = validateMethodType(methodType, allowed);
  if (err) return { ok: false, error: err };

  try {
    await analyticalService.createMethod(supabase, instrumentId, trimmed, methodType, {});
  } catch (e) {
    return toActionResult("createMethodAction", e);
  }
  revalidatePath("/instruments");
  return { ok: true };
}

export async function getInstrumentMethodsAction(instrumentId: string) {
  return analyticalService.listMethods(instrumentId);
}
