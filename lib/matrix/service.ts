import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SampleMatrixRow } from "@/lib/types";

// T2.9 D5 — the four already-real fields a matrix view can defensibly pivot
// on: no field in the schema distinguishes compound identity (e.g. "amino
// acid" vs "hydroxy acid"), so this pivots over sample_matrix's own
// component_1/component_2 free text (matching the Standard's §21.2 worked
// example directly) plus the two already-enumerated controlled-vocabulary
// fields. Near-duplicate free-text labels are NOT normalized (D5) — that
// would be exactly the silent reinterpretation this project's conventions
// avoid; disclosed in the UI instead.
export type MatrixDimension = "component_1" | "component_2" | "reaction_mode" | "sample_type";

export type MatrixCell = { count: number; experimentIds: string[] };
export type MatrixPivot = {
  xValues: string[];
  yValues: string[];
  cells: Record<string, Record<string, MatrixCell>>;
};

function dimensionValue(row: SampleMatrixRow, dimension: MatrixDimension): string {
  return (row[dimension] ?? "").trim();
}

export async function getMatrixPivot(dimensionX: MatrixDimension, dimensionY: MatrixDimension): Promise<MatrixPivot> {
  const supabase = await createClient();
  // RLS scopes this to the caller's accessible experiments, same as every
  // other experiments query in this app — no explicit workspace filter needed.
  const { data, error } = await supabase.from("experiments").select("id, sample_matrix").is("deleted_at", null);
  if (error) throw error;

  const cells: Record<string, Record<string, MatrixCell>> = {};
  const xSet = new Set<string>();
  const ySet = new Set<string>();

  for (const experiment of data ?? []) {
    const rows = (experiment.sample_matrix ?? []) as SampleMatrixRow[];
    for (const row of rows) {
      const x = dimensionValue(row, dimensionX);
      const y = dimensionValue(row, dimensionY);
      if (!x || !y) continue; // an experiment with no value for either axis isn't silently bucketed under "".
      xSet.add(x);
      ySet.add(y);
      cells[y] ??= {};
      cells[y][x] ??= { count: 0, experimentIds: [] };
      cells[y][x].count += 1;
      if (!cells[y][x].experimentIds.includes(experiment.id)) cells[y][x].experimentIds.push(experiment.id);
    }
  }

  return {
    xValues: [...xSet].sort(),
    yValues: [...ySet].sort(),
    cells,
  };
}
