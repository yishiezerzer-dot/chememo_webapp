"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, requireWorkspace } from "@/lib/authorization/policies";
import * as protocolsService from "@/lib/protocols/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { validateQuantityUnits } from "@/lib/schemas";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, CriticalParameter, KnownFailureMode, ProtocolStep, Quantity } from "@/lib/types";

export async function createNewProtocol(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user, workspaceId } = await requireWorkspace();
  const name = ((formData.get("name") as string | null) ?? "").trim();
  if (!name) {
    return { ok: false, error: "Name is required.", fieldErrors: { name: "Name is required." } };
  }

  let id: string;
  try {
    id = await protocolsService.createProtocol(supabase, user.id, workspaceId, name);
  } catch (e) {
    return toActionResult("createNewProtocol", e);
  }

  revalidatePath("/protocols");
  redirect(`/protocols/${id}/edit`);
}

function parseJsonArray<T>(formData: FormData, key: string): T[] {
  try {
    const v = JSON.parse((formData.get(key) as string | null) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function saveProtocolVersion(
  protocolId: string,
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const str = (k: string) => {
    const v = (formData.get(k) as string | null)?.trim();
    return v ? v : null;
  };

  const steps = parseJsonArray<Omit<ProtocolStep, "id" | "protocol_version_id">>(formData, "steps");
  const quantityKinds = await listQuantityKinds();
  for (const step of steps) {
    if (!step.instruction || !step.instruction.trim()) {
      return { ok: false, error: "Every step needs an instruction." };
    }
    const quantityError = validateQuantityUnits(step.target_quantities as Record<string, Quantity>, quantityKinds);
    if (quantityError) return { ok: false, error: quantityError };
  }

  try {
    await protocolsService.createOrUpdateVersion(
      supabase,
      user.id,
      protocolId,
      {
        purpose: str("purpose"),
        scope: str("scope"),
        required_materials: str("required_materials"),
        equipment: str("equipment"),
        critical_parameters: parseJsonArray<CriticalParameter>(formData, "critical_parameters"),
        safety_notes: str("safety_notes"),
        qc_checks: str("qc_checks"),
        known_failure_modes: parseJsonArray<KnownFailureMode>(formData, "known_failure_modes"),
      },
      steps
    );
  } catch (e) {
    return toActionResult("saveProtocolVersion", e);
  }

  revalidatePath(`/protocols/${protocolId}/edit`);
  revalidatePath("/protocols");
  redirect("/protocols");
}

export async function archiveProtocolAction(protocolId: string) {
  const { supabase } = await requireUser();
  await protocolsService.archiveProtocol(supabase, protocolId);
  revalidatePath("/protocols");
  redirect("/protocols");
}
