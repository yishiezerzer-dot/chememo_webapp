import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { Experiment, ExperimentSeries } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function listSeries(): Promise<ExperimentSeries[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("experiment_series").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ExperimentSeries[];
}

export async function getSeries(id: string): Promise<ExperimentSeries | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("experiment_series").select("*").eq("id", id).maybeSingle();
  return (data as ExperimentSeries | null) ?? null;
}

// Comparison-page members (D4) — a few key columns side by side, joined via
// experiment_series_members.
export async function listSeriesMembers(seriesId: string): Promise<Experiment[]> {
  const supabase = await createClient();
  const { data: memberRows, error } = await supabase
    .from("experiment_series_members")
    .select("experiment_id")
    .eq("series_id", seriesId)
    .order("added_at");
  if (error) throw error;
  const ids = (memberRows ?? []).map((r) => r.experiment_id);
  if (ids.length === 0) return [];

  const { data: experiments, error: expError } = await supabase.from("experiments").select("*").in("id", ids);
  if (expError) throw expError;
  const byId = new Map((experiments ?? []).map((e) => [e.id, e]));
  // Preserve the order members were added in, not whatever order Postgres happens to return.
  return ids.map((id) => byId.get(id)).filter((e): e is Experiment => !!e) as Experiment[];
}

export async function createSeries(
  supabase: Supabase,
  userId: string,
  workspaceId: string,
  name: string,
  description: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from("experiment_series")
    .insert({ name, description, created_by: userId, workspace_id: workspaceId })
    .select("id")
    .single();
  if (error) throw new AppError("conflict", "Could not create the series.", { cause: error });
  return data.id as string;
}

export async function addMember(supabase: Supabase, seriesId: string, experimentId: string): Promise<void> {
  const { data: experiment } = await supabase.from("experiments").select("id").eq("id", experimentId).is("deleted_at", null).maybeSingle();
  if (!experiment) throw new AppError("validation", `${experimentId} is not a real experiment.`);

  const { error } = await supabase.from("experiment_series_members").insert({ series_id: seriesId, experiment_id: experimentId });
  if (error) {
    if (error.code === "23505") throw new AppError("conflict", "That experiment is already in this series.");
    throw new AppError("conflict", "Could not add the experiment to this series.", { cause: error });
  }
}

// Which series a given experiment already belongs to — for the "add to
// series" control on the experiment detail page.
export async function listSeriesForExperiment(experimentId: string): Promise<ExperimentSeries[]> {
  const supabase = await createClient();
  const { data: memberRows, error } = await supabase
    .from("experiment_series_members")
    .select("series_id")
    .eq("experiment_id", experimentId);
  if (error) throw error;
  const seriesIds = (memberRows ?? []).map((r) => r.series_id);
  if (seriesIds.length === 0) return [];

  const { data: series, error: seriesError } = await supabase.from("experiment_series").select("*").in("id", seriesIds);
  if (seriesError) throw seriesError;
  return (series ?? []) as ExperimentSeries[];
}

export async function removeMember(supabase: Supabase, seriesId: string, experimentId: string): Promise<void> {
  const { error } = await supabase
    .from("experiment_series_members")
    .delete()
    .eq("series_id", seriesId)
    .eq("experiment_id", experimentId);
  if (error) throw new AppError("conflict", "Could not remove the experiment from this series.", { cause: error });
}
