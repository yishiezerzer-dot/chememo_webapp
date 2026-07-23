"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";
import { projectLabelSchema } from "@/lib/schemas";

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

export async function createProject(label: string, color: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = projectLabelSchema.safeParse(label);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const name = parsed.data;

  const base = slugify(name);
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { error } = await supabase
      .from("projects")
      .insert({ id, label: name, color, owner_id: user.id });
    if (!error) return { ok: true };
    // 23505 = unique_violation (id already taken) — retry with a suffix.
    if (error.code !== "23505") return { ok: false, error: `Could not create project: ${error.message}` };
  }
  return { ok: false, error: "Could not create a unique project id — try a different name." };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("experiments")
    .select("id", { count: "exact", head: true })
    .eq("project", id)
    .is("deleted_at", null);
  if (count && count > 0) {
    return {
      ok: false,
      error: `${count} experiment${count === 1 ? "" : "s"} still use${count === 1 ? "s" : ""} this project — reassign or delete them first.`,
    };
  }

  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) return { ok: false, error: `Could not delete project: ${error.message}` };
  return { ok: true };
}
