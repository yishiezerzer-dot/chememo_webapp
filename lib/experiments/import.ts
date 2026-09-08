import { experimentInputSchema } from "@/lib/schemas";
import type { ExperimentInput } from "@/lib/types";

// T4.1 — CSV import, the one genuine gap from the characterization doc (§6:
// only export ever shipped).
//
// The shape is deliberately the *inverse of the existing export* rather than a
// new interchange format: the 14 headers below are exactly what
// exportExperimentsCsvAction writes, so a file exported from ChemMemo
// re-imports without anyone editing it, and the format needs no separate
// documentation. Columns outside that set are ignored rather than rejected —
// a spreadsheet someone added a working column to should still import.
export const IMPORT_COLUMNS = [
  "ID", "Name", "Date", "Researcher", "Project", "Reaction type",
  "pH", "Cycles", "Compounds", "Metals", "Methods", "m/z",
  "Observations", "Notes",
] as const;

// A guard against someone importing a 50k-row sheet by accident, not a
// considered capacity limit: every row is a separate INSERT plus an embedding
// job, and the action has a request timeout to live inside.
export const MAX_IMPORT_ROWS = 500;

export type RowError = { row: number; message: string };

// RFC 4180: quoted cells may contain commas, newlines, and doubled quotes.
// Hand-rolled rather than adding a dependency — the export's own writer
// (csvCell in experiments/actions.ts) is four lines, and this is its mirror.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  // A BOM survives a round-trip through Excel and would otherwise become part
  // of the first header's name, so the "ID" column would silently not match.
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      // Swallow the \n of a \r\n pair; a bare \r is a line break too.
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  // A file not ending in a newline still has one last cell in hand.
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const blankInput = (): ExperimentInput => ({
  name: "",
  date: null,
  researcher: null,
  project: null,
  reaction_type: null,
  compounds: [],
  metals: [],
  ph: null,
  cycles: null,
  methods: [],
  mz: [],
  observations: null,
  notes: null,
  scientific_question: null,
  rationale: null,
  hypothesis: null,
  primary_outcome: null,
  secondary_outcomes: null,
  data_analysis_plan: null,
  risks_failure_modes: null,
  conclusion: null,
  next_steps: null,
  acceptance_criteria: null,
  planned_start_at: null,
  planned_end_at: null,
  independent_variables: null,
  controlled_variables: null,
  sample_matrix: [],
  controls: [],
  protocol_version_id: null,
  planned_analyses: null,
  sample_storage_plan: null,
  quantities: {},
});

// The export joins list columns with "; ". Split on ";" alone so a file typed
// by hand without the space still works.
const splitList = (v: string): string[] =>
  v.split(";").map((s) => s.trim()).filter((s) => s.length > 0);

const orNull = (v: string): string | null => (v.trim() === "" ? null : v.trim());

function numberOrNull(v: string, label: string, errors: string[]): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) {
    errors.push(`${label} must be a number (got "${v.trim()}").`);
    return null;
  }
  return n;
}

export type MappedImport = {
  inputs: ExperimentInput[];
  rowErrors: RowError[];
  /** Incoming ID-column values, in row order, for reporting what was dropped. */
  ignoredIds: string[];
};

// Maps parsed CSV rows onto ExperimentInputs, validating each through the same
// experimentInputSchema the new-experiment form uses (T0.1) — an import must
// not be a way in for data the form would reject.
//
// The ID column is deliberately NOT honoured: experiment ids come from the
// atomic next_experiment_id() sequence, and letting a file choose its own
// would either collide with a live record or leave a gap in the sequence.
// Incoming ids are reported back so the caller can say what happened rather
// than dropping them silently. (Preserving them as legacy aliases is gap G5,
// which is still an unapproved proposal — there is nowhere to put them yet.)
export function mapCsvToInputs(
  text: string,
  projectIdByLabel: Record<string, string>
): { ok: true; mapped: MappedImport } | { ok: false; error: string } {
  // Blank lines are NOT filtered out here: row numbers below are reported to
  // the user as spreadsheet line numbers, and dropping a blank line in the
  // middle of a file would silently shift every number after it.
  const rows = parseCsv(text);
  if (rows.length === 0 || rows.every((r) => r.every((c) => c.trim() === ""))) {
    return { ok: false, error: "That file is empty." };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const at = (row: string[], column: string): string => {
    const idx = headers.indexOf(column.toLowerCase());
    return idx === -1 ? "" : row[idx] ?? "";
  };
  if (!headers.includes("name")) {
    return {
      ok: false,
      error: `That file has no "Name" column. Expected the columns ChemMemo's own CSV export writes: ${IMPORT_COLUMNS.join(", ")}.`,
    };
  }

  const body = rows.slice(1);
  if (body.length > MAX_IMPORT_ROWS) {
    return { ok: false, error: `That file has ${body.length} rows; the limit is ${MAX_IMPORT_ROWS} per import.` };
  }

  const inputs: ExperimentInput[] = [];
  const rowErrors: RowError[] = [];
  const ignoredIds: string[] = [];

  body.forEach((row, n) => {
    // +2: one for the header line, one because humans count from 1 — so the
    // number in an error message is the line to open in the spreadsheet.
    const rowNumber = n + 2;
    // A wholly empty line is spreadsheet noise, not a row that failed
    // validation — skip it without an error, but only after it has counted
    // towards the numbering above.
    if (row.every((c) => c.trim() === "")) return;
    const cellErrors: string[] = [];

    const incomingId = at(row, "ID").trim();
    if (incomingId) ignoredIds.push(incomingId);

    const projectLabel = at(row, "Project").trim();
    let project: string | null = null;
    if (projectLabel) {
      const id = projectIdByLabel[projectLabel.toLowerCase()];
      if (!id) {
        // Never auto-create: projects are user-managed (T0.11 made their
        // deletion owner-only), and inventing one from a typo would be worse
        // than refusing the row.
        cellErrors.push(`No project named "${projectLabel}". Create it first, or clear the cell.`);
      } else {
        project = id;
      }
    }

    const input: ExperimentInput = {
      ...blankInput(),
      name: at(row, "Name").trim(),
      date: orNull(at(row, "Date")),
      researcher: orNull(at(row, "Researcher")),
      project,
      reaction_type: orNull(at(row, "Reaction type")),
      compounds: splitList(at(row, "Compounds")),
      metals: splitList(at(row, "Metals")),
      ph: numberOrNull(at(row, "pH"), "pH", cellErrors),
      cycles: numberOrNull(at(row, "Cycles"), "Cycles", cellErrors),
      methods: splitList(at(row, "Methods")),
      mz: splitList(at(row, "m/z")).flatMap((v) => {
        const n2 = Number(v);
        if (!Number.isFinite(n2)) {
          cellErrors.push(`m/z value "${v}" is not a number.`);
          return [];
        }
        return [n2];
      }),
      observations: orNull(at(row, "Observations")),
      notes: orNull(at(row, "Notes")),
    };

    const parsed = experimentInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        cellErrors.push(`${issue.path.join(".") || "row"}: ${issue.message}`);
      }
    }

    if (cellErrors.length > 0) {
      rowErrors.push({ row: rowNumber, message: cellErrors.join(" ") });
    } else {
      inputs.push(input);
    }
  });

  return { ok: true, mapped: { inputs, rowErrors, ignoredIds } };
}
