import { readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T4.1 — the round trip, against a file the browser actually downloaded.
//
// The unit tests in tests/lib/csv-import.test.ts assert the mapping against
// the export's *format*, which is not the same claim: they would still pass if
// the export changed a header tomorrow. This spec exports a real file through
// the real download path and feeds it back through the real file chooser.
//
// The search filter before the export is what keeps this safe to run: the
// export writes every row matching the current filter (T1.6 D6), so without a
// filter this test would import the whole workspace as drafts. Filtered to one
// unique name, it round-trips exactly one record.
test("CSV exports and re-imports a record, and refuses a broken file", async ({ page }) => {
  test.setTimeout(90000);
  await signIn(page);

  // A record with values in the columns the CSV actually carries, so the
  // round trip has something to lose.
  await page.goto("/new/blank");
  const name = `E2E csv round trip ${Date.now()}`;
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(name);
  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/\/experiments\/EXP-\d+/);
  const originalId = page.url().match(/EXP-\d+/)![0];

  // Filter to just this record, so the export is one row.
  await page.goto(`/experiments?q=${encodeURIComponent(name)}`);
  await expect(page.getByText(originalId)).toBeVisible({ timeout: 15000 });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ]);
  const exported = await download.path();
  const csv = readFileSync(exported, "utf8");
  expect(csv).toContain(name);
  expect(csv).toContain(originalId);

  // Round trip: the exported file goes back in through the real button.
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import CSV" }).click(),
  ]);
  await chooser.setFiles(exported);

  const report = page.locator('[role="status"]', { hasText: "Imported" });
  await expect(report).toBeVisible({ timeout: 20000 });
  const importedId = (await report.textContent())!.match(/EXP-\d+/)![0];
  // A fresh id, never the one in the file — the ID column is deliberately
  // ignored, and this is the assertion that keeps it that way.
  expect(importedId).not.toBe(originalId);
  await expect(report).toContainText("ID column was not used");

  // The imported record really exists, as a draft, with the name from the file.
  await page.goto(`/experiments/${importedId}`);
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 15000 });

  // A broken file imports nothing at all, and says which line to open.
  const brokenPath = test.info().outputPath("broken.csv");
  writeFileSync(
    brokenPath,
    "Name,pH\nFine row,7\nBroken row,not-a-number\n",
    "utf8"
  );
  await page.goto("/experiments");
  const [chooser2] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import CSV" }).click(),
  ]);
  await chooser2.setFiles(brokenPath);

  const failure = page.locator('[role="status"]', { hasText: "Nothing was imported" });
  await expect(failure).toBeVisible({ timeout: 20000 });
  // Line 3, not line 2: the header is line 1, and the number has to match
  // what the person sees in their spreadsheet.
  await expect(failure).toContainText("Line 3");
  // All-or-nothing: the valid row in that same file must not have landed.
  await page.goto(`/experiments?q=${encodeURIComponent("Fine row")}`);
  await expect(page.getByText("Fine row")).toHaveCount(0);

  // Cleanup — both drafts.
  for (const id of [importedId, originalId]) {
    await page.goto(`/experiments/${id}`);
    await page.getByRole("button", { name: "Delete draft", exact: true }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await page.waitForURL(/\/experiments$/);
  }
});
