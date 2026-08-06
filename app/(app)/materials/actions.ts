"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace, requireUser } from "@/lib/authorization/policies";
import * as materialsService from "@/lib/materials/service";
import { listControlledVocab } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import { validateQuantityUnits, validateSolubilityStatus } from "@/lib/schemas";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, IdentifierType, Quantity } from "@/lib/types";

export async function deleteMaterialAction(materialId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await materialsService.deleteMaterial(supabase, materialId);
  } catch (e) {
    return toActionResult("deleteMaterialAction", e);
  }
  revalidatePath("/materials");
  return { ok: true };
}

export async function deleteLotAction(lotId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await materialsService.deleteLot(supabase, lotId);
  } catch (e) {
    return toActionResult("deleteLotAction", e);
  }
  revalidatePath("/materials");
  return { ok: true };
}

export async function createMaterialAction(_prevState: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const { supabase, user, workspaceId } = await requireWorkspace();
  const str = (k: string) => ((formData.get(k) as string | null) ?? "").trim() || null;
  const num = (k: string) => {
    const v = str(k);
    return v === null ? null : Number(v);
  };

  const preferredName = str("preferred_name");
  if (!preferredName) {
    return { ok: false, error: "Preferred name is required.", fieldErrors: { preferred_name: "Required." } };
  }

  try {
    await materialsService.createMaterial(supabase, user.id, workspaceId, {
      preferred_name: preferredName,
      short_code: str("short_code"),
      stereochemistry: str("stereochemistry"),
      formula: str("formula"),
      molecular_weight: num("molecular_weight"),
      exact_mass: num("exact_mass"),
      safety_notes: str("safety_notes"),
    });
  } catch (e) {
    return toActionResult("createMaterialAction", e);
  }
  revalidatePath("/materials");
  return { ok: true };
}

export async function addIdentifierAction(
  materialId: string,
  identifierType: IdentifierType,
  value: string
): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const trimmed = value.trim();
  if (!trimmed) return { ok: false, error: "Enter a value." };
  try {
    await materialsService.addIdentifier(supabase, materialId, identifierType, trimmed);
  } catch (e) {
    return toActionResult("addIdentifierAction", e);
  }
  revalidatePath("/materials");
  return { ok: true };
}

export async function createStorageLocationAction(name: string, conditions: string, notes: string): Promise<ActionResult> {
  const { supabase, user, workspaceId } = await requireWorkspace();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Enter a name." };
  try {
    await materialsService.createStorageLocation(supabase, user.id, workspaceId, trimmed, conditions.trim() || null, notes.trim() || null);
  } catch (e) {
    return toActionResult("createStorageLocationAction", e);
  }
  revalidatePath("/materials");
  return { ok: true };
}

export async function createLotAction(materialId: string, fields: materialsService.MaterialLotFields): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  try {
    await materialsService.createLot(supabase, user.id, materialId, fields);
  } catch (e) {
    return toActionResult("createLotAction", e);
  }
  revalidatePath("/materials");
  return { ok: true };
}

export async function createStockAction(
  materialLotId: string,
  fields: materialsService.StockSolutionFields
): Promise<ActionResult> {
  const { supabase } = await requireUser();

  const quantityKinds = await listQuantityKinds();
  const targetError = validateQuantityUnits(fields.target_quantities, quantityKinds);
  if (targetError) return { ok: false, error: targetError };
  const actualError = validateQuantityUnits(fields.actual_quantities, quantityKinds);
  if (actualError) return { ok: false, error: actualError };

  if (fields.solubility_status) {
    const allowed = await listControlledVocab("solubility_status");
    const err = validateSolubilityStatus(fields.solubility_status, allowed);
    if (err) return { ok: false, error: err };
  }

  try {
    await materialsService.createStock(supabase, materialLotId, fields);
  } catch (e) {
    return toActionResult("createStockAction", e);
  }
  revalidatePath("/materials");
  return { ok: true };
}

export async function verifyStockAction(stockId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  try {
    await materialsService.verifyStock(supabase, user.id, stockId);
  } catch (e) {
    return toActionResult("verifyStockAction", e);
  }
  revalidatePath("/materials");
  return { ok: true };
}

// Lazy-load getters: materials-client.tsx fetches a material's identifiers
// and lots only when its row is expanded, rather than the page's server
// component nesting every material -> lot -> stock -> attempt query upfront.
export async function getMaterialDetailAction(materialId: string) {
  const [identifiers, lots] = await Promise.all([
    materialsService.listIdentifiers(materialId),
    materialsService.listLots(materialId),
  ]);
  return { identifiers, lots };
}

export async function getLotStocksAction(lotId: string) {
  return materialsService.listStocks(lotId);
}

export async function getStockAttemptsAction(stockId: string) {
  return materialsService.listSolubilityAttempts(stockId);
}

export async function addSolubilityAttemptAction(
  stockId: string,
  attemptNumber: number,
  targetQuantities: Record<string, Quantity>,
  solvent: string,
  outcome: string,
  notes: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const allowed = await listControlledVocab("solubility_status");
  const err = validateSolubilityStatus(outcome, allowed);
  if (err) return { ok: false, error: err };

  try {
    await materialsService.addSolubilityAttempt(supabase, user.id, stockId, {
      attempt_number: attemptNumber,
      target_quantities: targetQuantities,
      solvent: solvent.trim() || null,
      outcome,
      notes: notes.trim() || null,
    });
  } catch (e) {
    return toActionResult("addSolubilityAttemptAction", e);
  }
  revalidatePath("/materials");
  return { ok: true };
}
