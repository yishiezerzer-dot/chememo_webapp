import "server-only";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/lib/errors";
import type { Project } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function listProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select("*").order("label");
  if (error) throw error;
  return data ?? [];
}

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "project"
  );
}

export async function createProject(
  supabase: Supabase,
  userId: string,
  workspaceId: string,
  name: string,
  color: string
): Promise<void> {
  const base = slugify(name);
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { error } = await supabase
      .from("projects")
      .insert({ id, label: name, color, owner_id: userId, workspace_id: workspaceId });
    if (!error) return;
    // 23505 = unique_violation (id already taken) — retry with a suffix.
    if (error.code !== "23505") {
      throw new AppError("conflict", `Could not create project: ${error.message}`, {
        cause: error,
      });
    }
  }
  throw new AppError(
    "conflict",
    "Could not create a unique project id — try a different name."
  );
}

export async function deleteProject(supabase: Supabase, id: string): Promise<void> {
  const { count } = await supabase
    .from("experiments")
    .select("id", { count: "exact", head: true })
    .eq("project", id)
    .is("deleted_at", null);
  if (count && count > 0) {
    throw new AppError(
      "conflict",
      `${count} experiment${count === 1 ? "" : "s"} still use${count === 1 ? "s" : ""} this project — reassign or delete them first.`
    );
  }

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) {
    throw new AppError("conflict", `Could not delete project: ${error.message}`, {
      cause: error,
    });
  }
}
