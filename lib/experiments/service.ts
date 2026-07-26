import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nextExperimentId } from "@/lib/experiment-id";
import { runIndexJob } from "@/lib/index-jobs";
import { AppError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type {
  Experiment,
  ExperimentFile,
  ExperimentInput,
  ExperimentRevision,
} from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

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
  // lib/ai/service.ts's generateSummary); narrowed to match that invariant.
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

export async function createExperiment(
  supabase: Supabase,
  userId: string,
  input: ExperimentInput
): Promise<string> {
  const id = await nextExperimentId();
  const { error } = await supabase
    .from("experiments")
    .insert({ id, owner_id: userId, ...input });
  if (error) {
    throw new AppError("conflict", "Could not create the experiment.", { cause: error });
  }

  // Keep semantic search current; fire-and-forget so a slow embed API can't
  // block the redirect (Railway's persistent server finishes it in the bg).
  // The DB trigger already durably enqueued this experiment's index_jobs
  // row — runIndexJob is the fast-path attempt at that job; if it fails or
  // the process dies before it finishes, the poller in lib/index-jobs.ts
  // picks it up from the durable row instead of losing it silently (T0.5).
  void runIndexJob(id).catch((e) =>
    logError("index-jobs", `create ${id} failed`, { error: e })
  );

  return id;
}

export async function updateExperiment(
  supabase: Supabase,
  id: string,
  input: ExperimentInput
): Promise<void> {
  // RLS enforces ownership; this update no-ops for non-owners.
  const { error } = await supabase.from("experiments").update(input).eq("id", id);
  if (error) {
    throw new AppError("conflict", "Could not update the experiment.", { cause: error });
  }

  // Re-embed the edited record so semantic search reflects the changes.
  void runIndexJob(id).catch((e) =>
    logError("index-jobs", `update ${id} failed`, { error: e })
  );

  // Edited fields make any cached AI summary stale — drop it so the detail page
  // shows "regenerate" instead of an out-of-date summary. Best-effort.
  void createAdminClient()
    .from("ai_summaries")
    .delete()
    .eq("experiment_id", id)
    .eq("scope", "single")
    .then(({ error: delErr }) => {
      if (delErr) logError("summary-invalidate", `update ${id} failed`, { error: delErr });
    });
}

export async function softDeleteExperiment(supabase: Supabase, id: string): Promise<void> {
  const { error } = await supabase
    .from("experiments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    throw new AppError("conflict", "Could not delete the experiment.", { cause: error });
  }

  // Drop the now-deleted experiment from semantic search.
  void runIndexJob(id).catch((e) =>
    logError("index-jobs", `delete ${id} failed`, { error: e })
  );
}
