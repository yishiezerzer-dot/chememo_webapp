import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Experiment, ExperimentFile, Project } from "@/lib/types";

// RLS already hides other users' soft-deleted rows; we also filter deleted_at
// so an owner's own trash stays out of normal list/detail views.

export async function listExperiments(): Promise<Experiment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("experiments")
    .select("*")
    .is("deleted_at", null)
    .order("date", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select("*").order("label");
  if (error) throw error;
  return data ?? [];
}

export async function getExperiment(
  id: string
): Promise<{ experiment: Experiment; files: ExperimentFile[] } | null> {
  const supabase = await createClient();
  const { data: experiment, error } = await supabase
    .from("experiments")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!experiment) return null;

  const { data: files, error: fErr } = await supabase
    .from("experiment_files")
    .select("*")
    .eq("experiment_id", id)
    .order("created_at");
  if (fErr) throw fErr;

  return { experiment, files: files ?? [] };
}
