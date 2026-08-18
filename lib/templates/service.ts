import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import { activeWorkspaceId } from "@/lib/authorization/policies";
import type { ExperimentInput, ExperimentTemplate, ExperimentTemplateVersion } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function listTemplates(includeArchived = false): Promise<ExperimentTemplate[]> {
  const supabase = await createClient();
  // Scoped to the active workspace (see activeWorkspaceId) — templates are
  // lab-shared within a workspace, not across every workspace you belong to.
  const workspaceId = await activeWorkspaceId();
  let query = supabase.from("experiment_templates").select("*").order("created_at", { ascending: false });
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  if (!includeArchived) query = query.eq("archived", false);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ExperimentTemplate[];
}

export async function listVersions(templateId: string): Promise<ExperimentTemplateVersion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiment_template_versions")
    .select("*")
    .eq("template_id", templateId)
    .order("version", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExperimentTemplateVersion[];
}

export async function getLatestVersion(templateId: string): Promise<ExperimentTemplateVersion | null> {
  const versions = await listVersions(templateId);
  return versions[0] ?? null;
}

export async function getTemplateVersion(id: string): Promise<ExperimentTemplateVersion | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("experiment_template_versions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as ExperimentTemplateVersion | null) ?? null;
}

export async function createTemplate(
  supabase: Supabase,
  userId: string,
  workspaceId: string,
  name: string,
  description: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from("experiment_templates")
    .insert({ name, description, created_by: userId, workspace_id: workspaceId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the template.", { cause: error });
  return data.id as string;
}

// T1.2 D4 — a template's current version can be edited freely until an
// experiment instantiates it (experiments_freeze_template_version sets
// frozen_at). This tries an in-place update of the latest version first;
// once RLS's "frozen_at is null" check starts rejecting that update, this
// falls back to inserting version + 1 — the only place the "immutable once
// used" rule needs to be felt by the caller, everywhere else it's just data.
export async function createOrUpdateVersion(
  supabase: Supabase,
  userId: string,
  templateId: string,
  defaults: Partial<ExperimentInput>,
  requiredFields: (keyof ExperimentInput)[]
): Promise<ExperimentTemplateVersion> {
  const latest = await getLatestVersion(templateId);

  if (latest && latest.frozen_at === null) {
    const { data, error } = await supabase
      .from("experiment_template_versions")
      .update({ defaults, required_fields: requiredFields })
      .eq("id", latest.id)
      .eq("template_id", templateId)
      .select("*")
      .maybeSingle();
    if (error) throw new AppError("conflict", "Could not update the template version.", { cause: error });
    // A concurrent instantiate froze it between our read and this update —
    // the RLS predicate silently no-ops the update (0 rows), not an error.
    if (data) return data as ExperimentTemplateVersion;
  }

  const nextVersion = (latest?.version ?? 0) + 1;
  const { data, error } = await supabase
    .from("experiment_template_versions")
    .insert({
      template_id: templateId,
      version: nextVersion,
      defaults,
      required_fields: requiredFields,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error) throw new AppError("conflict", "Could not save a new template version.", { cause: error });
  return data as ExperimentTemplateVersion;
}

export async function archiveTemplate(supabase: Supabase, templateId: string): Promise<void> {
  const { error } = await supabase
    .from("experiment_templates")
    .update({ archived: true })
    .eq("id", templateId);
  if (error) throw new AppError("conflict", "Could not archive the template.", { cause: error });
}
