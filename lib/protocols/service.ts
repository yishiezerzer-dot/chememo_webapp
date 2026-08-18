import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { activeWorkspaceId } from "@/lib/authorization/policies";
import type { Protocol, ProtocolVersion, ProtocolStep, CriticalParameter, KnownFailureMode } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function listProtocols(includeArchived = false): Promise<Protocol[]> {
  const supabase = await createClient();
  // Scoped to the active workspace — see activeWorkspaceId().
  const workspaceId = await activeWorkspaceId();
  let query = supabase.from("protocols").select("*").order("created_at", { ascending: false });
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  if (!includeArchived) query = query.eq("archived", false);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Protocol[];
}

export async function listVersions(protocolId: string): Promise<ProtocolVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol_versions")
    .select("*")
    .eq("protocol_id", protocolId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProtocolVersion[];
}

export async function getLatestVersion(protocolId: string): Promise<ProtocolVersion | null> {
  const versions = await listVersions(protocolId);
  return versions[0] ?? null;
}

export async function getVersion(id: string): Promise<ProtocolVersion | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("protocol_versions").select("*").eq("id", id).maybeSingle();
  return (data as ProtocolVersion | null) ?? null;
}

// The picker experiment-form.tsx renders (D4) — one option per protocol
// version, labeled with the protocol's name so a scientist can tell versions
// of different protocols apart at a glance.
export async function listVersionOptions(): Promise<{ id: string; label: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol_versions")
    .select("id, version, protocols!inner(name, archived)")
    .eq("protocols.archived", false)
    .order("protocol_id")
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const protocol = Array.isArray(row.protocols) ? row.protocols[0] : row.protocols;
    return { id: row.id as string, label: `${protocol?.name ?? "Untitled protocol"} v${row.version}` };
  });
}

export async function listSteps(protocolVersionId: string): Promise<ProtocolStep[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("protocol_steps")
    .select("*")
    .eq("protocol_version_id", protocolVersionId)
    .order("step_number");
  if (error) throw error;
  return (data ?? []) as ProtocolStep[];
}

export async function createProtocol(supabase: Supabase, userId: string, workspaceId: string, name: string): Promise<string> {
  const { data, error } = await supabase
    .from("protocols")
    .insert({ name, created_by: userId, workspace_id: workspaceId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the protocol.", { cause: error });
  return data.id as string;
}

export type ProtocolVersionFields = {
  purpose: string | null;
  scope: string | null;
  required_materials: string | null;
  equipment: string | null;
  critical_parameters: CriticalParameter[];
  safety_notes: string | null;
  qc_checks: string | null;
  known_failure_modes: KnownFailureMode[];
};

// T1.5 D2 — same in-place-update-until-frozen / insert-next-version-on-RLS-
// rejection pattern as T1.2's createOrUpdateVersion (Templates). Replaces the
// version's steps wholesale on each save (delete + re-insert) rather than
// diffing, since a version is only ever edited before it's frozen — once
// frozen, protocol_steps_write's RLS already rejects both the delete and the
// insert (D2's protocol_steps policy mirrors protocol_versions_update).
export async function createOrUpdateVersion(
  supabase: Supabase,
  userId: string,
  protocolId: string,
  fields: ProtocolVersionFields,
  steps: Omit<ProtocolStep, "id" | "protocol_version_id">[]
): Promise<ProtocolVersion> {
  const latest = await getLatestVersion(protocolId);

  let version: ProtocolVersion;
  if (latest && latest.frozen_at === null) {
    const { data, error } = await supabase
      .from("protocol_versions")
      .update(fields)
      .eq("id", latest.id)
      .eq("protocol_id", protocolId)
      .select("*")
      .maybeSingle();
    if (error) throw new AppError("conflict", "Could not update the protocol version.", { cause: error });
    if (data) {
      version = data as ProtocolVersion;
    } else {
      version = await insertNextVersion(supabase, userId, protocolId, latest.version, fields);
    }
  } else {
    version = await insertNextVersion(supabase, userId, protocolId, latest?.version ?? 0, fields);
  }

  const { error: deleteError } = await supabase
    .from("protocol_steps")
    .delete()
    .eq("protocol_version_id", version.id);
  if (deleteError) throw new AppError("conflict", "Could not save the protocol's steps.", { cause: deleteError });

  if (steps.length > 0) {
    const { error: insertError } = await supabase.from("protocol_steps").insert(
      steps.map((s, i) => ({ ...s, protocol_version_id: version.id, step_number: i + 1 }))
    );
    if (insertError) throw new AppError("conflict", "Could not save the protocol's steps.", { cause: insertError });
  }

  return version;
}

async function insertNextVersion(
  supabase: Supabase,
  userId: string,
  protocolId: string,
  currentVersion: number,
  fields: ProtocolVersionFields
): Promise<ProtocolVersion> {
  const { data, error } = await supabase
    .from("protocol_versions")
    .insert({ protocol_id: protocolId, version: currentVersion + 1, created_by: userId, ...fields })
    .select("*")
    .single();
  if (error) throw new AppError("conflict", "Could not save a new protocol version.", { cause: error });
  return data as ProtocolVersion;
}

export async function archiveProtocol(supabase: Supabase, protocolId: string): Promise<void> {
  const { error } = await supabase.from("protocols").update({ archived: true }).eq("id", protocolId);
  if (error) throw new AppError("conflict", "Could not archive the protocol.", { cause: error });
}
