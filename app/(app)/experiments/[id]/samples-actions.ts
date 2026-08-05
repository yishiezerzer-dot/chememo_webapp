"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import * as samplesService from "@/lib/samples/service";
import { listControlledVocab } from "@/lib/experiments/service";
import { listQuantityKinds } from "@/lib/quantities/service";
import {
  validateQuantityUnits,
  validateSampleType,
  validateReactionMode,
  validateSampleStatus,
} from "@/lib/schemas";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, InputSourceType, Quantity, SampleEventType, SampleRelationshipType } from "@/lib/types";
import type { SampleFields } from "@/lib/samples/service";

export async function createBatchAction(experimentId: string, label: string, notes: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "Enter a batch label." };
  try {
    await samplesService.createBatch(supabase, experimentId, trimmed, notes.trim() || null);
  } catch (e) {
    return toActionResult("createBatchAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function createSampleAction(
  experimentId: string,
  batchId: string,
  fields: Omit<SampleFields, "origin_type" | "origin_id"> & { originType: InputSourceType | null; originId: string | null }
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  if (fields.sample_type) {
    const allowed = await listControlledVocab("sample_type");
    const err = validateSampleType(fields.sample_type, allowed);
    if (err) return { ok: false, error: err };
  }
  if (fields.reaction_mode) {
    const allowed = await listControlledVocab("reaction_mode");
    const err = validateReactionMode(fields.reaction_mode, allowed);
    if (err) return { ok: false, error: err };
  }
  const statusAllowed = await listControlledVocab("sample_status");
  const statusErr = validateSampleStatus(fields.status, statusAllowed);
  if (statusErr) return { ok: false, error: statusErr };

  try {
    await samplesService.createSample(supabase, user.id, batchId, {
      legacy_code: fields.legacy_code,
      sample_type: fields.sample_type,
      reaction_mode: fields.reaction_mode,
      status: fields.status,
      origin_type: fields.originType,
      origin_id: fields.originId,
      replicate: fields.replicate,
      notes: fields.notes,
    });
  } catch (e) {
    return toActionResult("createSampleAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function addAliasAction(experimentId: string, sampleId: string, alias: string, note: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const trimmed = alias.trim();
  if (!trimmed) return { ok: false, error: "Enter an alias." };
  try {
    await samplesService.addAlias(supabase, sampleId, trimmed, note.trim() || null);
  } catch (e) {
    return toActionResult("addAliasAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function createSampleRelationshipAction(
  experimentId: string,
  sourceSampleId: string,
  targetSampleId: string,
  relationshipType: SampleRelationshipType
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  try {
    await samplesService.createRelationship(supabase, user.id, sourceSampleId, targetSampleId, relationshipType);
  } catch (e) {
    return toActionResult("createSampleRelationshipAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function deleteSampleRelationshipAction(experimentId: string, relationshipId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await samplesService.deleteRelationship(supabase, relationshipId);
  } catch (e) {
    return toActionResult("deleteSampleRelationshipAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function recordSampleEventAction(
  experimentId: string,
  sampleId: string,
  eventType: SampleEventType,
  details: Record<string, unknown>
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  try {
    await samplesService.recordEvent(supabase, user.id, sampleId, eventType, details);
  } catch (e) {
    return toActionResult("recordSampleEventAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function addMeasurementAction(
  experimentId: string,
  sampleId: string,
  quantities: Record<string, Quantity>,
  notes: string
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();

  const quantityError = validateQuantityUnits(quantities, await listQuantityKinds());
  if (quantityError) return { ok: false, error: quantityError };

  try {
    await samplesService.addMeasurement(supabase, user.id, sampleId, quantities, notes.trim() || null);
  } catch (e) {
    return toActionResult("addMeasurementAction", e);
  }
  revalidatePath(`/experiments/${experimentId}`);
  return { ok: true };
}

export async function getSampleDetailAction(sampleId: string) {
  const [aliases, relationships, location, events, measurements] = await Promise.all([
    samplesService.listAliases(sampleId),
    samplesService.listRelationships(sampleId),
    samplesService.getLocation(sampleId),
    samplesService.listEvents(sampleId),
    samplesService.listMeasurements(sampleId),
  ]);
  return { aliases, relationships, location, events, measurements };
}
