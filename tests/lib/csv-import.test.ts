import { describe, expect, it } from "vitest";
import {
  parseCsv,
  mapCsvToInputs,
  CsvTooLargeError,
  MAX_IMPORT_ROWS,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_CELLS,
} from "@/lib/experiments/import";

const PROJECTS = { "origins of life": "proj-1" };

const HEADER =
  "ID,Name,Date,Researcher,Project,Reaction type,pH,Cycles,Compounds,Metals,Methods,m/z,Observations,Notes";

function mapped(csv: string, projects: Record<string, string> = PROJECTS) {
  const res = mapCsvToInputs(csv, projects);
  if (!res.ok) throw new Error(`expected a mapped file, got: ${res.error}`);
  return res.mapped;
}

describe("parseCsv", () => {
  it("keeps commas, newlines and doubled quotes inside a quoted cell", () => {
    const rows = parseCsv('a,"b,c","line1\nline2","say ""hi"""');
    expect(rows).toEqual([["a", "b,c", "line1\nline2", 'say "hi"']]);
  });

  it("handles CRLF, a trailing newline, and a leading BOM", () => {
    // Excel writes all three, and a BOM left on the first header would stop
    // "ID" from ever matching.
    const rows = parseCsv("﻿ID,Name\r\nEXP-001,First\r\n");
    expect(rows).toEqual([
      ["ID", "Name"],
      ["EXP-001", "First"],
    ]);
  });
});

// A server action is an HTTP endpoint any signed-in user can POST to
// directly, so these bounds are the only thing between a crafted body and the
// Node process. Each one was measured as a real denial of service before it
// was added: 12 MB of bare newlines cost 2.4 GB of heap and 13 s of blocked
// event loop, and a 1 MB header row of commas cost 9 s on its own.
describe("import limits (denial of service)", () => {
  it("refuses an oversized file before parsing it", () => {
    const huge = "Name\n" + "x\n".repeat(MAX_IMPORT_BYTES);
    const res = mapCsvToInputs(huge, PROJECTS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/limit is 2 MB/);
  });

  it("stops mid-parse on too many rows instead of materialising them", () => {
    // The bail is inside the parser loop, so this must throw rather than
    // return a giant array.
    const many = Array.from({ length: MAX_IMPORT_ROWS + 5 }, (_, i) => `Row ${i}`).join("\n");
    expect(() => parseCsv(many, { maxRows: MAX_IMPORT_ROWS, maxCells: MAX_IMPORT_CELLS })).toThrow(
      CsvTooLargeError
    );
  });

  it("stops mid-parse on too many cells, even in a file with few rows", () => {
    // The wide-but-short shape: small payload, enormous cell count. This is
    // the one that slipped past a row-count-only limit.
    const wide = "Name" + ",".repeat(MAX_IMPORT_CELLS + 10);
    expect(() => parseCsv(wide, { maxRows: MAX_IMPORT_ROWS, maxCells: MAX_IMPORT_CELLS })).toThrow(
      CsvTooLargeError
    );
    const res = mapCsvToInputs(wide, PROJECTS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/cells/);
  });

  it("stays fast on a wide header, which used to be quadratic", () => {
    // 20k columns x 200 rows. With headers.indexOf re-scanned per column per
    // row this took seconds; with the hoisted Map it is milliseconds. The
    // threshold is loose on purpose -- it is a regression guard, not a
    // benchmark.
    const columns = 20_000;
    const header = ["Name", ...Array.from({ length: columns }, (_, i) => `c${i}`)].join(",");
    const body = Array.from({ length: 200 }, (_, i) => `Row ${i}`).join("\n");
    const started = Date.now();
    const res = mapCsvToInputs(`${header}\n${body}`, PROJECTS);
    expect(res.ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

// The export prefixes an apostrophe onto anything a spreadsheet would treat as
// a formula. These prove the import undoes exactly that and no more, so the
// round trip does not accumulate apostrophes or eat legitimate ones.
describe("formula-guard round trip", () => {
  it("strips the export's guard back off", () => {
    // The name cell is written the way the export would write it: the inner
    // quotes doubled and the whole cell quoted.
    const { inputs } = mapped(
      `${HEADER}\n,"'=HYPERLINK(""http://x"")",,,,,,,,,,,'=cmd,'@SUM(A1)`
    );
    expect(inputs[0].name).toBe('=HYPERLINK("http://x")');
    expect(inputs[0].observations).toBe("=cmd");
    expect(inputs[0].notes).toBe("@SUM(A1)");
  });

  it("leaves an apostrophe that is part of the value alone", () => {
    // No risky character follows, so this is someone's actual text.
    const { inputs } = mapped(`${HEADER}\n,'tis a name,,,,,,,,,,,'twas observed,`);
    expect(inputs[0].name).toBe("'tis a name");
    expect(inputs[0].observations).toBe("'twas observed");
  });
});

describe("mapCsvToInputs", () => {
  it("round-trips a row in the shape the CSV export writes", () => {
    const { inputs, rowErrors } = mapped(
      `${HEADER}\nEXP-001,Wet-dry cycling,2026-09-01,Ada,Origins of life,condensation,7.4,3,Gly; Ala,Mg; Fe,NMR; UV-Vis,145.2; 302.1,"Gel formed, then dried",Repeat next week`
    );

    expect(rowErrors).toEqual([]);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      name: "Wet-dry cycling",
      date: "2026-09-01",
      researcher: "Ada",
      project: "proj-1",
      reaction_type: "condensation",
      ph: 7.4,
      cycles: 3,
      compounds: ["Gly", "Ala"],
      metals: ["Mg", "Fe"],
      methods: ["NMR", "UV-Vis"],
      mz: [145.2, 302.1],
      observations: "Gel formed, then dried",
      notes: "Repeat next week",
    });
  });

  it("never honours the file's own ID, and reports what it dropped", () => {
    const { inputs, ignoredIds } = mapped(`${HEADER}\nEXP-999,Named row,,,,,,,,,,,,`);
    expect(ignoredIds).toEqual(["EXP-999"]);
    // The id is not smuggled in under any other field either.
    expect(JSON.stringify(inputs[0])).not.toContain("EXP-999");
  });

  it("refuses an unknown project rather than inventing one", () => {
    const { inputs, rowErrors } = mapped(`${HEADER}\n,Named row,,,Nonexistent project,,,,,,,,,`);
    expect(inputs).toEqual([]);
    expect(rowErrors).toHaveLength(1);
    expect(rowErrors[0].row).toBe(2);
    expect(rowErrors[0].message).toContain("Nonexistent project");
  });

  it("reports every bad row at once, by spreadsheet line number", () => {
    const { inputs, rowErrors } = mapped(
      `${HEADER}\n,Good row,,,,,7,,,,,,,\n,Bad pH,,,,,not-a-number,,,,,,,\n,,,,,,,,,,,,,\n,Bad m/z,,,,,,,,,,abc,,\n,,,,,,,,,,,,,`
    );

    // All-or-nothing is enforced by the caller; the mapper still reports which
    // rows would have been fine. The blank line 4 is skipped silently, but it
    // still counts towards the numbering — otherwise "line 5" would send
    // someone to the wrong row of their spreadsheet.
    expect(inputs.map((i) => i.name)).toEqual(["Good row"]);
    expect(rowErrors.map((e) => e.row)).toEqual([3, 5]);
    expect(rowErrors[0].message).toContain("pH must be a number");
    expect(rowErrors[1].message).toContain("abc");
  });

  it("treats a nameless but otherwise filled row as an error, not as noise", () => {
    const { rowErrors } = mapped(`${HEADER}\n,,2026-09-01,Ada,,,,,,,,,,`);
    expect(rowErrors).toHaveLength(1);
    expect(rowErrors[0].message).toContain("Name is required");
  });

  it("rejects a method that is not one of the app's own options", () => {
    const { rowErrors } = mapped(`${HEADER}\n,Named row,,,,,,,,,Telepathy,,,`);
    expect(rowErrors).toHaveLength(1);
    expect(rowErrors[0].message).toContain("methods");
  });

  it("ignores extra columns and tolerates missing optional ones", () => {
    const { inputs, rowErrors } = mapped("Name,Bench notebook page\nJust a name,p. 42");
    expect(rowErrors).toEqual([]);
    expect(inputs[0].name).toBe("Just a name");
    expect(inputs[0].date).toBeNull();
  });

  it("refuses a file with no Name column, an empty file, and an oversized one", () => {
    expect(mapCsvToInputs("", PROJECTS)).toMatchObject({ ok: false });
    expect(mapCsvToInputs("ID,Date\nEXP-1,2026-09-01", PROJECTS)).toMatchObject({ ok: false });

    const tooMany = ["Name", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `Row ${i}`)].join("\n");
    const res = mapCsvToInputs(tooMany, PROJECTS);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain(String(MAX_IMPORT_ROWS));
  });
});
