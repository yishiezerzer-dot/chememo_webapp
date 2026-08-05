import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { Json } from "@/lib/database.types";
import type {
  Batch,
  Sample,
  SampleAlias,
  SampleRelationship,
  SampleRelationshipType,
  SampleLocation,
  SampleEvent,
  SampleEventType,
  SampleMeasurement,
  InputSourceType,
  Quantity,
} from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------------
// batches (D1) — the implicit B1 is created by a DB trigger on experiment
// insert, so this is read-only plus an explicit "add a repeat preparation"
// insert; there is no update/delete path (a batch, once real samples exist
// under it, shouldn't be silently renamed or removed).
// ---------------------------------------------------------------------------

export async function listBatches(experimentId: string): Promise<Batch[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("batches")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("label");
  if (error) throw error;
  return (data ?? []) as Batch[];
}

export async function createBatch(supabase: Supabase, experimentId: string, label: string, notes: string | null): Promise<string> {
  const { data, error } = await supabase
    .from("batches")
    .insert({ experiment_id: experimentId, label, notes })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the batch.", { cause: error });
  return data.id as string;
}

// ---------------------------------------------------------------------------
// samples (D2)
// ---------------------------------------------------------------------------

export async function listSamples(batchId: string): Promise<Sample[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("samples")
    .select("*")
    .eq("batch_id", batchId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []) as Sample[];
}

export async function getSample(id: string): Promise<Sample | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("samples").select("*").eq("id", id).maybeSingle();
  return (data as Sample | null) ?? null;
}

export type SampleFields = {
  legacy_code: string | null;
  sample_type: string | null;
  reaction_mode: string | null;
  status: string;
  origin_type: InputSourceType | null;
  origin_id: string | null;
  replicate: number;
  notes: string | null;
};

// D2 — vial_label is generated here (§6.2's <experiment>-<batch>-<code>-R<n>
// format), not left as free text. Resolves the material short_code through
// origin_type/origin_id when set (lot -> material, stock -> lot -> material);
// falls back to "SAMPLE" when no origin is registered.
export async function createSample(
  supabase: Supabase,
  userId: string,
  batchId: string,
  fields: SampleFields
): Promise<string> {
  const { data: batch, error: batchErr } = await supabase
    .from("batches")
    .select("experiment_id, label")
    .eq("id", batchId)
    .single();
  if (batchErr) throw new AppError("conflict", "Could not find the batch.", { cause: batchErr });

  const shortCode = await resolveShortCode(supabase, fields.origin_type, fields.origin_id);
  const vialLabel = `${batch.experiment_id}-${batch.label}-${shortCode}-R${fields.replicate}`;

  const { data, error } = await supabase
    .from("samples")
    .insert({ ...fields, batch_id: batchId, vial_label: vialLabel, created_by: userId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the sample.", { cause: error });
  return data.id as string;
}

async function resolveShortCode(supabase: Supabase, originType: InputSourceType | null, originId: string | null): Promise<string> {
  if (!originType || !originId) return "SAMPLE";
  if (originType === "lot") {
    const { data } = await supabase.from("material_lots").select("materials!inner(short_code, preferred_name)").eq("id", originId).maybeSingle();
    const material = data ? (Array.isArray(data.materials) ? data.materials[0] : data.materials) : undefined;
    return material?.short_code || material?.preferred_name?.replace(/\s+/g, "").slice(0, 8) || "SAMPLE";
  }
  const { data } = await supabase
    .from("stock_solutions")
    .select("material_lots!inner(materials!inner(short_code, preferred_name))")
    .eq("id", originId)
    .maybeSingle();
  const lot = data ? (Array.isArray(data.material_lots) ? data.material_lots[0] : data.material_lots) : undefined;
  const material = lot ? (Array.isArray(lot.materials) ? lot.materials[0] : lot.materials) : undefined;
  return material?.short_code || material?.preferred_name?.replace(/\s+/g, "").slice(0, 8) || "SAMPLE";
}

// ---------------------------------------------------------------------------
// sample_aliases (D8)
// ---------------------------------------------------------------------------

export async function listAliases(sampleId: string): Promise<SampleAlias[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("sample_aliases").select("*").eq("sample_id", sampleId).order("created_at");
  if (error) throw error;
  return (data ?? []) as SampleAlias[];
}

export async function addAlias(supabase: Supabase, sampleId: string, alias: string, note: string | null): Promise<void> {
  const { error } = await supabase.from("sample_aliases").insert({ sample_id: sampleId, alias, note });
  if (error) throw new AppError("conflict", "Could not add the alias.", { cause: error });
}

// ---------------------------------------------------------------------------
// sample_relationships (D4)
// ---------------------------------------------------------------------------

export async function listRelationships(sampleId: string): Promise<SampleRelationship[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sample_relationships")
    .select("*")
    .or(`source_sample_id.eq.${sampleId},target_sample_id.eq.${sampleId}`);
  if (error) throw error;
  return (data ?? []) as SampleRelationship[];
}

export async function createRelationship(
  supabase: Supabase,
  userId: string,
  sourceSampleId: string,
  targetSampleId: string,
  relationshipType: SampleRelationshipType
): Promise<void> {
  const { error } = await supabase.from("sample_relationships").insert({
    source_sample_id: sourceSampleId,
    target_sample_id: targetSampleId,
    relationship_type: relationshipType,
    created_by: userId,
  });
  if (error) {
    if (error.message?.includes("different workspace")) {
      throw new AppError("conflict", "That sample belongs to a different workspace.", { cause: error });
    }
    throw new AppError("conflict", "Could not create the relationship.", { cause: error });
  }
}

export async function deleteRelationship(supabase: Supabase, relationshipId: string): Promise<void> {
  const { error } = await supabase.from("sample_relationships").delete().eq("id", relationshipId);
  if (error) throw new AppError("conflict", "Could not remove the relationship.", { cause: error });
}

// ---------------------------------------------------------------------------
// sample_locations (D6) + sample_events (D5)
// ---------------------------------------------------------------------------

export async function getLocation(sampleId: string): Promise<SampleLocation | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("sample_locations").select("*").eq("sample_id", sampleId).maybeSingle();
  return (data as SampleLocation | null) ?? null;
}

export async function listEvents(sampleId: string): Promise<SampleEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sample_events")
    .select("*")
    .eq("sample_id", sampleId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SampleEvent[];
}

// D5 — a 'transfer' event also updates sample_locations, via the
// apply_sample_transfer_event() DB trigger; the app just inserts the event.
export async function recordEvent(
  supabase: Supabase,
  userId: string,
  sampleId: string,
  eventType: SampleEventType,
  details: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("sample_events")
    .insert({ sample_id: sampleId, event_type: eventType, performed_by: userId, details: details as Json });
  if (error) throw new AppError("conflict", "Could not record the event.", { cause: error });
}

// ---------------------------------------------------------------------------
// sample_measurements (D7)
// ---------------------------------------------------------------------------

export async function listMeasurements(sampleId: string): Promise<SampleMeasurement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sample_measurements")
    .select("*")
    .eq("sample_id", sampleId)
    .order("measured_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SampleMeasurement[];
}

export async function addMeasurement(
  supabase: Supabase,
  userId: string,
  sampleId: string,
  quantities: Record<string, Quantity>,
  notes: string | null
): Promise<void> {
  const { error } = await supabase
    .from("sample_measurements")
    .insert({ sample_id: sampleId, quantities, measured_by: userId, notes });
  if (error) throw new AppError("conflict", "Could not record the measurement.", { cause: error });
}
