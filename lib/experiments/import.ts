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

// MAX_IMPORT_ROWS protects the database. These protect the process, and they
// are a different problem: a server action is an HTTP endpoint any signed-in
// user can POST to directly, so the bound has to hold before a row count
// exists to check. Measured on the parser below, a 12 MB body of bare
// newlines (the exact serverActions.bodySizeLimit, which this path shares
// with file upload and so cannot be lowered) parses to 12.5M rows, 2.4 GB of
// heap and 13 seconds of blocked event loop -- and Next is single-threaded
// per worker, so that is the whole app stopped, for everyone, from one
// request.
//
// 500 rows x 14 columns at the schema's own maxima (two 20,000-char text
// fields plus the rest) is ~45 KB/row worst case, so 2 MB is already generous
// for any real spreadsheet.
export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_IMPORT_CELLS = 100_000;

export type RowError = { row: number; message: string };

// Thrown by parseCsv when a limit trips mid-parse. Caught by mapCsvToInputs
// and turned into an ordinary refusal -- callers never see it.
export class CsvTooLargeError extends Error {
  constructor(readonly kind: "rows" | "cells") {
    super(kind);
  }
}

// RFC 4180: quoted cells may contain commas, newlines, and doubled quotes.
// Hand-rolled rather than adding a dependency — the export's own writer
// (csvCell in experiments/actions.ts) is four lines, and this is its mirror.
// The limits are checked *inside* the loop. Checking a finished array would
// be no protection at all: by then the memory has already been spent, which
// is the entire failure mode.
export function parseCsv(
  text: string,
  limits: { maxRows: number; maxCells: number } = { maxRows: Infinity, maxCells: Infinity }
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let cells = 0;

  const countCell = () => {
    if (++cells > limits.maxCells) throw new CsvTooLargeError("cells");
  };
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
      countCell();
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      // Swallow the \n of a \r\n pair; a bare \r is a line break too.
      if (c === "\r" && text[i + 1] === "\n") i++;
      countCell();
      row.push(cell);
      rows.push(row);
      if (rows.length > limits.maxRows) throw new CsvTooLargeError("rows");
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  // A file not ending in a newline still has one last cell in hand. The row
  // limit is re-checked here and not only in the loop: this push happens
  // after it, so without this a file could always exceed the cap by exactly
  // one row by omitting its trailing newline.
  if (cell !== "" || row.length > 0) {
    countCell();
    row.push(cell);
    rows.push(row);
    if (rows.length > limits.maxRows) throw new CsvTooLargeError("rows");
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

// The export prefixes an apostrophe onto any value a spreadsheet would
// evaluate as a formula (csvCell in experiments/actions.ts). Strip exactly
// that guard back off here, so an export/import round trip returns the
// original text rather than quietly accumulating apostrophes. The pattern
// requires the risky character to follow, so a value that legitimately begins
// with an apostrophe survives untouched.
const unguard = (v: string): string => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

// The export joins list columns with "; ". Split on ";" alone so a file typed
// by hand without the space still works.
const splitList = (v: string): string[] =>
  v.split(";").map((s) => unguard(s.trim())).filter((s) => s.length > 0);

const orNull = (v: string): string | null => (v.trim() === "" ? null : unguard(v.trim()));

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
  // Before anything is parsed: the string is already in memory, but nothing
  // has been expanded into arrays yet, and that expansion is what costs
  // 50-200x the input.
  if (text.length > MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `That file is ${(text.length / 1_000_000).toFixed(1)} MB; the limit is ${MAX_IMPORT_BYTES / 1_000_000} MB.`,
    };
  }

  // Blank lines are NOT filtered out here: row numbers below are reported to
  // the user as spreadsheet line numbers, and dropping a blank line in the
  // middle of a file would silently shift every number after it.
  let rows: string[][];
  try {
    // +1 on rows so an oversized file is still distinguishable from an
    // exactly-at-the-limit one, and reports the friendlier message below.
    rows = parseCsv(text, { maxRows: MAX_IMPORT_ROWS + 1, maxCells: MAX_IMPORT_CELLS });
  } catch (e) {
    if (e instanceof CsvTooLargeError) {
      return {
        ok: false,
        error:
          e.kind === "rows"
            ? `That file has more than ${MAX_IMPORT_ROWS} rows; the limit is ${MAX_IMPORT_ROWS} per import.`
            : `That file has more than ${MAX_IMPORT_CELLS} cells; the limit is ${MAX_IMPORT_CELLS} per import.`,
      };
    }
    throw e;
  }
  if (rows.length === 0 || rows.every((r) => r.every((c) => c.trim() === ""))) {
    return { ok: false, error: "That file is empty." };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  // Hoisted deliberately. Called per column per row, `headers.indexOf` is a
  // full scan on every miss, and nothing bounds the column count -- a
  // one-megabyte header row of nothing but commas measured at nine seconds of
  // blocked event loop, from a file small enough to slip under every other
  // limit here.
  const indexByHeader = new Map(headers.map((h, i) => [h, i]));
  const at = (row: string[], column: string): string => {
    const idx = indexByHeader.get(column.toLowerCase());
    return idx === undefined ? "" : row[idx] ?? "";
  };
  if (!headers.includes("name")) {
    return {
      ok: false,
      error: `That file has no "Name" column. Expected the columns ChemMemo's own CSV export writes: ${IMPORT_COLUMNS.join(", ")}.`,
    };
  }

  // No row-count check here: parseCsv already refused above, before the
  // memory was spent, which is the only place the check is worth anything.
  const body = rows.slice(1);

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
      name: unguard(at(row, "Name").trim()),
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
