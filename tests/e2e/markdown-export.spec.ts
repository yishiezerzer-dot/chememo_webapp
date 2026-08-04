import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.11 — export a populated experiment as Markdown and confirm the
// downloaded file actually contains its real id and name.
test("export experiment as Markdown", async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);

  const name = `E2E export ${Date.now()}`;
  await page.goto("/new/blank");
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(name);
  await page.locator("textarea[name=scientific_question]").fill("Does the export round-trip real data?");
  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/\/experiments\/EXP-\d+/);
  const id = page.url().match(/EXP-\d+/)![0];

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export Markdown" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${id}__results-summary__v01.md`);

  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(chunk as Buffer);
  const content = Buffer.concat(chunks).toString("utf-8");
  expect(content).toContain(`experiment_id: ${id}`);
  expect(content).toContain(name);
  expect(content).toContain("Does the export round-trip real data?");

  // Cleanup.
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/experiments$/);
});
