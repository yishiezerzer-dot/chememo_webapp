import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { Json } from "@/lib/database.types";
import type {
  ConditionProgramTemplate,
  BatchConditionProgram,
  ConditionProgramCycle,
  EnvironmentalConditions,
  Control,
  ControlType,
  Quantity,
} from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// condition_program_templates (D1) — reusable definitions, workspace-scoped.
// ---------------------------------------------------------------------------

export type ConditionProgramFields = {
  name: string;
  cycle_count: number;
  atmosphere: string | null;
  humidity_or_drying_method: string | null;
  vessel: string | null;
  agitation: string | null;
  sampling_points: string | null;
  quantities: Record<string, Quantity>;
  notes: string | null;
};

export async function listConditionProgramTemplates(): Promise<ConditionProgramTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("condition_program_templates").select("*").order("name");
  if (error) throw error;
  return (data ?? []) as ConditionProgramTemplate[];
}

export async function createConditionProgramTemplate(
  supabase: Supabase,
  userId: string,
  workspaceId: string,
  fields: ConditionProgramFields
): Promise<string> {
  const { data, error } = await supabase
    .from("condition_program_templates")
    .insert({ ...fields, quantities: fields.quantities as Json, workspace_id: workspaceId, created_by: userId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the condition program template.", { cause: error });
  return data.id as string;
}

// ---------------------------------------------------------------------------
// batch_condition_programs (D1) — a frozen per-batch instance. Applying a
// template copies its values in; editing the template afterward never
// changes an already-applied instance (mirrors T1.5's protocol-version
// freeze-on-first-use).
// ---------------------------------------------------------------------------

export async function getBatchConditionProgram(batchId: string): Promise<BatchConditionProgram | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("batch_condition_programs").select("*").eq("batch_id", batchId).maybeSingle();
  return (data as BatchConditionProgram | null) ?? null;
}

export async function applyConditionProgramTemplate(
  supabase: Supabase,
  userId: string,
  batchId: string,
  templateId: string
): Promise<string> {
  const { data: template, error: templateError } = await supabase
    .from("condition_program_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  if (templateError) throw new AppError("not-found", "Condition program template not found.", { cause: templateError });

  const { data, error } = await supabase
    .from("batch_condition_programs")
    .insert({
      batch_id: batchId,
      template_id: templateId,
      name: template.name,
      cycle_count: template.cycle_count,
      atmosphere: template.atmosphere,
      humidity_or_drying_method: template.humidity_or_drying_method,
      vessel: template.vessel,
      agitation: template.agitation,
      sampling_points: template.sampling_points,
      quantities: template.quantities,
      notes: template.notes,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not apply the condition program to this batch.", { cause: error });
  return data.id as string;
}

export async function createAdHocBatchConditionProgram(
  supabase: Supabase,
  userId: string,
  batchId: string,
  fields: ConditionProgramFields
): Promise<string> {
  const { data, error } = await supabase
    .from("batch_condition_programs")
    .insert({ ...fields, quantities: fields.quantities as Json, batch_id: batchId, template_id: null, created_by: userId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the condition program for this batch.", { cause: error });
  return data.id as string;
}

// ---------------------------------------------------------------------------
// condition_program_cycles (D2) — actual per-cycle execution, matching the
// Standard's §9.3 worked table.
// ---------------------------------------------------------------------------

export type ConditionProgramCycleFields = {
  cycle_index: number;
  wet_start_at: string | null;
  wet_end_at: string | null;
  dry_start_at: string | null;
  dry_end_at: string | null;
  quantities: Record<string, Quantity>;
  observation: string | null;
  deviation: Record<string, unknown>;
};

export async function listConditionProgramCycles(batchConditionProgramId: string): Promise<ConditionProgramCycle[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("condition_program_cycles")
    .select("*")
    .eq("batch_condition_program_id", batchConditionProgramId)
    .order("cycle_index");
  if (error) throw error;
  return (data ?? []) as ConditionProgramCycle[];
}

export async function addConditionProgramCycle(
  supabase: Supabase,
  userId: string,
  batchConditionProgramId: string,
  fields: ConditionProgramCycleFields
): Promise<string> {
  const { data, error } = await supabase
    .from("condition_program_cycles")
    .insert({
      ...fields,
      quantities: fields.quantities as Json,
      deviation: fields.deviation as Json,
      batch_condition_program_id: batchConditionProgramId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not add the cycle — check the cycle index isn't already used.", { cause: error });
  return data.id as string;
}

// ---------------------------------------------------------------------------
// environmental_conditions (D3) — one row per batch.
// ---------------------------------------------------------------------------

export type EnvironmentalConditionsFields = {
  atmosphere_gas: string | null;
  pressure: string | null;
  light_uv_exposure: string | null;
  light_uv_wavelength: number | null;
  mineral_surface_type: string | null;
  ionic_strength: string | null;
  buffer_identity: string | null;
  water_activity: number | null;
  heating_method: string | null;
  freeze_thaw_cycles: number | null;
  vessel_material: string | null;
  initial_ph: number | null;
  final_ph: number | null;
  anaerobic: boolean | null;
  quantities: Record<string, Quantity>;
  custom_fields: Record<string, unknown>;
  notes: string | null;
};

export async function getEnvironmentalConditions(batchId: string): Promise<EnvironmentalConditions | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("environmental_conditions").select("*").eq("batch_id", batchId).maybeSingle();
  return (data as EnvironmentalConditions | null) ?? null;
}

// One row per batch (D3) — an upsert on the batch_id unique constraint, so
// the same form serves both "create" and "edit" without the caller needing
// to know which one applies.
export async function upsertEnvironmentalConditions(
  supabase: Supabase,
  userId: string,
  batchId: string,
  fields: EnvironmentalConditionsFields
): Promise<void> {
  const { error } = await supabase.from("environmental_conditions").upsert(
    {
      ...fields,
      quantities: fields.quantities as Json,
      custom_fields: fields.custom_fields as Json,
      batch_id: batchId,
      created_by: userId,
    },
    { onConflict: "batch_id" }
  );
  if (error) throw new AppError("conflict", "Could not save environmental conditions.", { cause: error });
}

// ---------------------------------------------------------------------------
// controls (D4) — explicit entities, not a naming convention. Which
// experiment(s) a control validates is recorded via T1.7's existing
// experiment_relationships 'control_for' type, not a new table here.
// ---------------------------------------------------------------------------

export async function listControls(experimentId: string): Promise<Control[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("controls")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Control[];
}

export async function createControl(
  supabase: Supabase,
  userId: string,
  experimentId: string,
  controlType: ControlType,
  description: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from("controls")
    .insert({ experiment_id: experimentId, control_type: controlType, description, created_by: userId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not add the control.", { cause: error });
  return data.id as string;
}

export async function deleteControl(supabase: Supabase, controlId: string): Promise<void> {
  const { error } = await supabase.from("controls").delete().eq("id", controlId);
  if (error) throw new AppError("conflict", "Could not delete the control.", { cause: error });
}
