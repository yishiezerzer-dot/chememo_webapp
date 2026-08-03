"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization/policies";
import { searchAllExperiments } from "@/lib/experiments/search";
import { listProjects } from "@/lib/projects/service";
import * as savedViewsService from "@/lib/saved-views/service";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, ExperimentSearchParams, SavedView } from "@/lib/types";

// Quote a CSV cell only when it contains a comma, quote, or newline.
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// T1.6 D6 — CSV export over the *current filter*, not the current page: once
// the client only ever holds one page of rows, exporting "all wet-dry
// cycling experiments" needs its own full, unpaginated query.
export async function exportExperimentsCsvAction(params: ExperimentSearchParams): Promise<string> {
  await requireUser();
  const [rows, projects] = await Promise.all([searchAllExperiments(params), listProjects()]);
  const projectLabel = Object.fromEntries(projects.map((p) => [p.id, p.label]));

  const headers = [
    "ID", "Name", "Date", "Researcher", "Project", "Reaction type",
    "pH", "Cycles", "Compounds", "Metals", "Methods", "m/z",
    "Observations", "Notes",
  ];
  const lines = rows.map((e) =>
    [
      e.id, e.name, e.date, e.researcher,
      e.project ? projectLabel[e.project] ?? e.project : "",
      e.reaction_type, e.ph, e.cycles,
      e.compounds.join("; "), e.metals.join("; "), e.methods.join("; "),
      e.mz.join("; "), e.observations, e.notes,
    ]
      .map(csvCell)
      .join(",")
  );
  return [headers.join(","), ...lines].join("\r\n");
}

export async function listViewsAction(): Promise<SavedView[]> {
  await requireUser();
  return savedViewsService.listSavedViews();
}

export async function saveViewAction(name: string, query: ExperimentSearchParams): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name this view before saving it." };

  try {
    await savedViewsService.createSavedView(supabase, user.id, trimmed, query);
  } catch (e) {
    return toActionResult("saveViewAction", e);
  }
  revalidatePath("/experiments");
  return { ok: true };
}

export async function deleteViewAction(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  try {
    await savedViewsService.deleteSavedView(supabase, id);
  } catch (e) {
    return toActionResult("deleteViewAction", e);
  }
  revalidatePath("/experiments");
  return { ok: true };
}
