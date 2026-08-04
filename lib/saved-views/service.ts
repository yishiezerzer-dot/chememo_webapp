import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { ExperimentSearchParams, SavedView } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function listSavedViews(): Promise<SavedView[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saved_views")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedView[];
}

export async function createSavedView(
  supabase: Supabase,
  userId: string,
  workspaceId: string,
  name: string,
  query: ExperimentSearchParams
): Promise<SavedView> {
  const { data, error } = await supabase
    .from("saved_views")
    .insert({ owner_id: userId, workspace_id: workspaceId, name, query })
    .select("*")
    .single();
  if (error) throw new AppError("conflict", "Could not save this view.", { cause: error });
  return data as SavedView;
}

export async function deleteSavedView(supabase: Supabase, id: string): Promise<void> {
  const { error } = await supabase.from("saved_views").delete().eq("id", id);
  if (error) throw new AppError("conflict", "Could not delete this view.", { cause: error });
}
