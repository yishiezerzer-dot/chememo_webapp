import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Experiment,
  ExperimentFile,
  ExperimentRevision,
  Project,
} from "@/lib/types";

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
  // Array/timestamp columns are DB-nullable but every write path sets them
  // (defaults + never written null) — see the narrowing note in lib/types.ts.
  return (data ?? []) as Experiment[];
}

export async function listProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select("*").order("label");
  if (error) throw error;
  return data ?? [];
}

// Distinct compound/metal values across live experiments — powers the
// autocomplete suggestions on the experiment form. Small dataset, so fetch all
// and dedupe in memory rather than a per-keystroke query.
export async function listVocab(): Promise<{ compounds: string[]; metals: string[] }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("experiments")
    .select("compounds, metals")
    .is("deleted_at", null);
  const compounds = new Set<string>();
  const metals = new Set<string>();
  for (const row of data ?? []) {
    (row.compounds ?? []).forEach((c: string) => compounds.add(c));
    (row.metals ?? []).forEach((m: string) => metals.add(m));
  }
  return { compounds: [...compounds].sort(), metals: [...metals].sort() };
}

// Prior states of an experiment (newest first), captured by the update trigger.
export async function listRevisions(
  experimentId: string
): Promise<ExperimentRevision[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("experiment_revisions")
    .select("*")
    .eq("experiment_id", experimentId)
    .order("created_at", { ascending: false });
  // experiment_id/created_at/snapshot are DB-nullable but the update trigger
  // that inserts these rows always sets all three.
  return (data ?? []) as ExperimentRevision[];
}

// Private bucket → generate short-lived signed URLs so uploaded files open
// on the detail page (regenerated on every render, so links never go stale).
export async function signedUrlsFor(
  paths: string[]
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("experiment-files")
    .createSignedUrls(paths, 3600);
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

export type StoredSummary = {
  summary: string;
  model: string | null;
  created_at: string;
};

// Latest cached single-experiment AI summary (null if none / pre-Phase-10).
export async function getExperimentSummary(
  experimentId: string
): Promise<StoredSummary | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_summaries")
    .select("summary, model, created_at")
    .eq("experiment_id", experimentId)
    .eq("scope", "single")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // summary/created_at are DB-nullable but always set on insert (see
  // summary-actions.ts); narrowed to match that invariant.
  return (data as StoredSummary | null) ?? null;
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

  // See the narrowing note in lib/types.ts for why these casts are safe.
  return {
    experiment: experiment as Experiment,
    files: (files ?? []) as ExperimentFile[],
  };
}
