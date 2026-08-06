import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { convert } from "@/lib/quantities/convert";
import { deriveMoles, determineLimitingReagent, calculateYield } from "@/lib/stoichiometry/calculate";
import type { Json } from "@/lib/database.types";
import type {
  Material,
  MaterialIdentifier,
  StorageLocation,
  MaterialLot,
  StockSolution,
  StockSolubilityAttempt,
  ExperimentMaterialInput,
  ExperimentMaterialOutput,
  IdentifierType,
  InputSourceType,
  Quantity,
  StockCalculation,
} from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// materials + material_identifiers (D1, D2)
// ---------------------------------------------------------------------------

export async function listMaterials(): Promise<Material[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("materials").select("*").order("preferred_name");
  if (error) throw error;
  return (data ?? []) as Material[];
}

export async function getMaterial(id: string): Promise<Material | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("materials").select("*").eq("id", id).maybeSingle();
  return (data as Material | null) ?? null;
}

export async function createMaterial(
  supabase: Supabase,
  userId: string,
  workspaceId: string,
  fields: {
    preferred_name: string;
    short_code: string | null;
    stereochemistry: string | null;
    formula: string | null;
    molecular_weight: number | null;
    exact_mass: number | null;
    safety_notes: string | null;
  }
): Promise<string> {
  const { data, error } = await supabase
    .from("materials")
    .insert({ ...fields, created_by: userId, workspace_id: workspaceId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the material.", { cause: error });
  return data.id as string;
}

export async function listIdentifiers(materialId: string): Promise<MaterialIdentifier[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_identifiers")
    .select("*")
    .eq("material_id", materialId)
    .order("identifier_type");
  if (error) throw error;
  return (data ?? []) as MaterialIdentifier[];
}

export async function addIdentifier(
  supabase: Supabase,
  materialId: string,
  identifierType: IdentifierType,
  value: string,
  isPrimary = false
): Promise<void> {
  const { error } = await supabase
    .from("material_identifiers")
    .insert({ material_id: materialId, identifier_type: identifierType, value, is_primary: isPrimary });
  if (error) throw new AppError("conflict", "Could not add the identifier.", { cause: error });
}

// ---------------------------------------------------------------------------
// storage_locations (D6)
// ---------------------------------------------------------------------------

export async function listStorageLocations(): Promise<StorageLocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("storage_locations").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as StorageLocation[];
}

export async function createStorageLocation(
  supabase: Supabase,
  userId: string,
  workspaceId: string,
  name: string,
  conditions: string | null,
  notes: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from("storage_locations")
    .insert({ name, conditions, notes, created_by: userId, workspace_id: workspaceId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the storage location.", { cause: error });
  return data.id as string;
}

// material_lots.storage_location_id/stock_solutions.storage_location_id are
// real DB foreign keys with no `on delete` clause (RESTRICT), so a location
// still in use fails at the DB level — surfaced here as a friendly message
// rather than a raw constraint-violation error.
export async function deleteStorageLocation(supabase: Supabase, locationId: string): Promise<void> {
  const { error } = await supabase.from("storage_locations").delete().eq("id", locationId);
  if (error) throw new AppError("conflict", "Could not delete the location — it may still be in use by a lot or stock.", { cause: error });
}

// The picker experiment_inputs' UI renders (D4) — one option per lot or
// stock, labeled with its material's name so a researcher can tell them
// apart, matching listVersionOptions()'s exact shape/purpose for protocols.
export async function listLotAndStockOptions(): Promise<
  { id: string; source_type: "lot" | "stock"; label: string }[]
> {
  const supabase = await createClient();
  const [lotsRes, stocksRes] = await Promise.all([
    supabase.from("material_lots").select("id, lot_number, materials!inner(preferred_name)"),
    supabase
      .from("stock_solutions")
      .select("id, target_quantities, material_lots!inner(materials!inner(preferred_name))"),
  ]);
  if (lotsRes.error) throw lotsRes.error;
  if (stocksRes.error) throw stocksRes.error;

  const lotOptions = (lotsRes.data ?? []).map((row) => {
    const material = Array.isArray(row.materials) ? row.materials[0] : row.materials;
    return {
      id: row.id as string,
      source_type: "lot" as const,
      label: `${material?.preferred_name ?? "Material"} — lot ${row.lot_number ?? row.id.slice(0, 8)}`,
    };
  });
  const stockOptions = (stocksRes.data ?? []).map((row) => {
    const lot = Array.isArray(row.material_lots) ? row.material_lots[0] : row.material_lots;
    const material = lot ? (Array.isArray(lot.materials) ? lot.materials[0] : lot.materials) : undefined;
    const concentration = (row.target_quantities as Record<string, Quantity> | null)?.stock_concentration;
    const concLabel = concentration ? `${concentration.value} ${concentration.unit_code}` : "stock";
    return {
      id: row.id as string,
      source_type: "stock" as const,
      label: `${material?.preferred_name ?? "Material"} — ${concLabel}`,
    };
  });
  return [...lotOptions, ...stockOptions];
}

// ---------------------------------------------------------------------------
// material_lots (D1)
// ---------------------------------------------------------------------------

export async function listLots(materialId: string): Promise<MaterialLot[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("material_lots")
    .select("*")
    .eq("material_id", materialId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MaterialLot[];
}

export async function getLot(id: string): Promise<MaterialLot | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("material_lots").select("*").eq("id", id).maybeSingle();
  return (data as MaterialLot | null) ?? null;
}

export type MaterialLotFields = {
  supplier: string | null;
  catalog_number: string | null;
  lot_number: string | null;
  purity: number | null;
  physical_form: string | null;
  commercial_solution_quantities: Record<string, Quantity>;
  concentration_basis: string | null;
  density: number | null;
  density_temperature: number | null;
  water_content_or_hydrate_form: string | null;
  storage_location_id: string | null;
  date_opened: string | null;
  expiration_or_retest_date: string | null;
};

// Blocks deletion if any experiment_inputs row references this lot directly,
// or references a stock prepared from it — experiment_inputs.source_id has
// no real DB foreign key (it's polymorphic, T2.2 D4), so nothing would stop
// a dangling reference otherwise.
export async function deleteLot(supabase: Supabase, lotId: string): Promise<void> {
  const { count: directCount } = await supabase
    .from("experiment_inputs")
    .select("id", { count: "exact", head: true })
    .eq("source_type", "lot")
    .eq("source_id", lotId);
  if (directCount) {
    throw new AppError("conflict", "This lot is used by an experiment input — remove that input first.");
  }

  const { data: stocks } = await supabase.from("stock_solutions").select("id").eq("material_lot_id", lotId);
  const stockIds = (stocks ?? []).map((s) => s.id as string);
  if (stockIds.length > 0) {
    const { count: stockUseCount } = await supabase
      .from("experiment_inputs")
      .select("id", { count: "exact", head: true })
      .eq("source_type", "stock")
      .in("source_id", stockIds);
    if (stockUseCount) {
      throw new AppError("conflict", "A stock prepared from this lot is used by an experiment input — remove that input first.");
    }
  }

  const { error } = await supabase.from("material_lots").delete().eq("id", lotId);
  if (error) throw new AppError("conflict", "Could not delete the lot.", { cause: error });
}

export async function deleteMaterial(supabase: Supabase, materialId: string): Promise<void> {
  const { count } = await supabase.from("material_lots").select("id", { count: "exact", head: true }).eq("material_id", materialId);
  if (count) {
    throw new AppError("conflict", "This material still has lots — delete them first.");
  }
  const { error } = await supabase.from("materials").delete().eq("id", materialId);
  if (error) throw new AppError("conflict", "Could not delete the material — it may still be referenced by an experiment output.", { cause: error });
}

export async function createLot(
  supabase: Supabase,
  userId: string,
  materialId: string,
  fields: MaterialLotFields
): Promise<string> {
  const { data, error } = await supabase
    .from("material_lots")
    .insert({ ...fields, material_id: materialId, created_by: userId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the material lot.", { cause: error });
  return data.id as string;
}

// ---------------------------------------------------------------------------
// stock_solutions + stock_solubility_attempts (D3)
// ---------------------------------------------------------------------------

export async function listStocks(materialLotId: string): Promise<StockSolution[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_solutions")
    .select("*")
    .eq("material_lot_id", materialLotId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as StockSolution[];
}

export async function getStock(id: string): Promise<StockSolution | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("stock_solutions").select("*").eq("id", id).maybeSingle();
  return (data as StockSolution | null) ?? null;
}

export type StockSolutionFields = {
  target_quantities: Record<string, Quantity>;
  actual_quantities: Record<string, Quantity>;
  solvent: string | null;
  solvent_grade: string | null;
  ph_target: number | null;
  ph_measured: number | null;
  acid_or_base_added: string | null;
  acid_or_base_quantities: Record<string, Quantity>;
  filtration_or_centrifugation: string | null;
  color_and_appearance: string | null;
  calculation: StockCalculation;
  solubility_status: string | null;
  prepared_at: string | null;
  prepared_by: string | null;
  storage_location_id: string | null;
  storage_temperature: number | null;
  freeze_thaw_count: number;
  expiration_or_review_date: string | null;
};

export async function createStock(
  supabase: Supabase,
  materialLotId: string,
  fields: StockSolutionFields
): Promise<string> {
  const { data, error } = await supabase
    .from("stock_solutions")
    .insert({ ...fields, material_lot_id: materialLotId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the stock solution.", { cause: error });
  return data.id as string;
}

// §7.5's 12-point checklist is a UI-level gate (not its own table); marking
// a stock verified is a plain field update, same shape as T1.1's
// acceptance_criteria_locked_at.
export async function verifyStock(supabase: Supabase, userId: string, stockId: string): Promise<void> {
  const { error } = await supabase
    .from("stock_solutions")
    .update({ verified_at: new Date().toISOString(), verified_by: userId })
    .eq("id", stockId);
  if (error) throw new AppError("conflict", "Could not verify the stock solution.", { cause: error });
}

export async function listSolubilityAttempts(stockId: string): Promise<StockSolubilityAttempt[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_solubility_attempts")
    .select("*")
    .eq("stock_solution_id", stockId)
    .order("attempt_number");
  if (error) throw error;
  return (data ?? []) as StockSolubilityAttempt[];
}

// D3 — append-only log; attempt_number is caller-supplied (1-based,
// current-count + 1) rather than DB-generated, so a client can render the
// next attempt's number before submitting.
export async function addSolubilityAttempt(
  supabase: Supabase,
  userId: string,
  stockId: string,
  fields: {
    attempt_number: number;
    target_quantities: Record<string, Quantity>;
    solvent: string | null;
    outcome: string;
    notes: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from("stock_solubility_attempts")
    .insert({ ...fields, stock_solution_id: stockId, attempted_by: userId });
  if (error) throw new AppError("conflict", "Could not record the solubility attempt.", { cause: error });
}

// ---------------------------------------------------------------------------
// experiment_inputs / experiment_outputs (D4)
// ---------------------------------------------------------------------------

export async function listInputs(experimentId: string): Promise<ExperimentMaterialInput[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiment_inputs")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ExperimentMaterialInput[];
}

export async function addInput(
  supabase: Supabase,
  userId: string,
  experimentId: string,
  fields: {
    source_type: InputSourceType;
    source_id: string;
    role: string;
    quantities: Record<string, Quantity>;
    notes: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from("experiment_inputs")
    .insert({ ...fields, experiment_id: experimentId, created_by: userId });
  // Distinct message for the cross-workspace guard (set_workspace_from_experiment_input's
  // raised exception) vs. a generic RLS/permission rejection.
  if (error) {
    if (error.message?.includes("different workspace")) {
      throw new AppError("conflict", "That lot or stock belongs to a different workspace.", { cause: error });
    }
    throw new AppError("conflict", "Could not add the experiment input.", { cause: error });
  }
}

export async function removeInput(supabase: Supabase, inputId: string): Promise<void> {
  const { error } = await supabase.from("experiment_inputs").delete().eq("id", inputId);
  if (error) throw new AppError("conflict", "Could not remove the experiment input.", { cause: error });
}

export async function listOutputs(experimentId: string): Promise<ExperimentMaterialOutput[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiment_outputs")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as ExperimentMaterialOutput[];
}

export async function addOutput(
  supabase: Supabase,
  userId: string,
  experimentId: string,
  fields: {
    material_id: string | null;
    material_name: string | null;
    role: string;
    quantities: Record<string, Quantity>;
    notes: string | null;
  }
): Promise<void> {
  const { error } = await supabase
    .from("experiment_outputs")
    .insert({ ...fields, experiment_id: experimentId, created_by: userId });
  if (error) throw new AppError("conflict", "Could not add the experiment output.", { cause: error });
}

export async function removeOutput(supabase: Supabase, outputId: string): Promise<void> {
  const { error } = await supabase.from("experiment_outputs").delete().eq("id", outputId);
  if (error) throw new AppError("conflict", "Could not remove the experiment output.", { cause: error });
}

// ---------------------------------------------------------------------------
// T2.4 — stoichiometry (D2, D3, D6). Runs only when explicitly triggered
// (recalculateStoichiometryAction), never automatically on read — §18.6/
// §19.2's "never silently change a calculated value."
// ---------------------------------------------------------------------------

type ResolvedOrigin = {
  molecularWeight: number | null;
  purityFraction: number | null;
  densityGPerMl: number | null;
  stockConcentrationMolarPerL: number | null;
};

async function resolveOrigin(supabase: Supabase, sourceType: InputSourceType, sourceId: string): Promise<ResolvedOrigin> {
  if (sourceType === "lot") {
    const { data } = await supabase
      .from("material_lots")
      .select("purity, density, materials!inner(molecular_weight)")
      .eq("id", sourceId)
      .maybeSingle();
    const material = data ? (Array.isArray(data.materials) ? data.materials[0] : data.materials) : undefined;
    return {
      molecularWeight: material?.molecular_weight ?? null,
      purityFraction: data?.purity != null ? data.purity / 100 : null,
      densityGPerMl: data?.density ?? null,
      stockConcentrationMolarPerL: null,
    };
  }
  const { data } = await supabase
    .from("stock_solutions")
    .select("target_quantities, actual_quantities, material_lots!inner(purity, density, materials!inner(molecular_weight))")
    .eq("id", sourceId)
    .maybeSingle();
  const lot = data ? (Array.isArray(data.material_lots) ? data.material_lots[0] : data.material_lots) : undefined;
  const material = lot ? (Array.isArray(lot.materials) ? lot.materials[0] : lot.materials) : undefined;
  const quantities = (data?.actual_quantities ?? data?.target_quantities ?? {}) as Record<string, Quantity>;
  const concentration = quantities.stock_concentration;
  let concentrationMolarPerL: number | null = null;
  if (concentration) {
    try {
      concentrationMolarPerL = convert(concentration.value, concentration.unit_code, "M");
    } catch {
      concentrationMolarPerL = null;
    }
  }
  return {
    molecularWeight: material?.molecular_weight ?? null,
    purityFraction: lot?.purity != null ? lot.purity / 100 : null,
    densityGPerMl: lot?.density ?? null,
    stockConcentrationMolarPerL: concentrationMolarPerL,
  };
}

export async function recalculateStoichiometry(supabase: Supabase, experimentId: string): Promise<void> {
  const inputs = await listInputs(experimentId);

  const computed: { id: string; role: string; moles: number | null; calculation: StockCalculation }[] = [];
  for (const input of inputs) {
    const origin = await resolveOrigin(supabase, input.source_type, input.source_id);
    const massQty = input.quantities.input_amount_mass;
    const volumeQty = input.quantities.input_amount_volume;

    let result: { moles: number; calculation: StockCalculation } | null = null;
    if (origin.stockConcentrationMolarPerL !== null && volumeQty) {
      try {
        const volumeL = convert(volumeQty.value, volumeQty.unit_code, "L");
        result = deriveMoles({ kind: "stock_concentration", volumeL, concentrationMolarPerL: origin.stockConcentrationMolarPerL });
      } catch {
        result = null;
      }
    } else if (massQty && origin.molecularWeight && origin.purityFraction) {
      try {
        const massG = convert(massQty.value, massQty.unit_code, "g");
        result = deriveMoles({ kind: "solid_mass", massG, molecularWeight: origin.molecularWeight, purityFraction: origin.purityFraction });
      } catch {
        result = null;
      }
    } else if (volumeQty && origin.densityGPerMl && origin.molecularWeight && origin.purityFraction) {
      try {
        const volumeMl = convert(volumeQty.value, volumeQty.unit_code, "mL");
        result = deriveMoles({
          kind: "liquid_volume",
          volumeMl,
          densityGPerMl: origin.densityGPerMl,
          molecularWeight: origin.molecularWeight,
          purityFraction: origin.purityFraction,
        });
      } catch {
        result = null;
      }
    }

    computed.push({
      id: input.id,
      role: input.role,
      moles: result?.moles ?? null,
      calculation: result?.calculation ?? {},
    });
  }

  const { limitingId, equivalents } = determineLimitingReagent(computed);

  for (const c of computed) {
    const { error } = await supabase
      .from("experiment_inputs")
      .update({
        moles: c.moles,
        equivalents: equivalents[c.id] ?? null,
        is_limiting_reagent: c.id === limitingId,
        calculation: c.calculation as unknown as Json,
      })
      .eq("id", c.id);
    if (error) throw new AppError("conflict", "Could not save the recalculated stoichiometry.", { cause: error });
  }

  if (limitingId) {
    const limitingMoles = computed.find((c) => c.id === limitingId)!.moles!;
    const outputs = await listOutputs(experimentId);
    for (const output of outputs) {
      if (!output.material_id) continue;
      const { data: material } = await supabase.from("materials").select("molecular_weight").eq("id", output.material_id).maybeSingle();
      if (!material?.molecular_weight) continue;
      const actualMassG = output.quantities.input_amount_mass
        ? (() => {
            try {
              return convert(output.quantities.input_amount_mass!.value, output.quantities.input_amount_mass!.unit_code, "g");
            } catch {
              return null;
            }
          })()
        : null;
      const yieldResult = calculateYield(limitingMoles, material.molecular_weight, actualMassG);
      const { error } = await supabase
        .from("experiment_outputs")
        .update({
          theoretical_yield_mass: yieldResult.theoreticalYieldMass,
          percent_yield: yieldResult.percentYield,
          calculation: yieldResult.calculation as unknown as Json,
        })
        .eq("id", output.id);
      if (error) throw new AppError("conflict", "Could not save the recalculated yield.", { cause: error });
    }
  }
}
