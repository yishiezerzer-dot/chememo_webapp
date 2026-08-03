import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.7 — link two experiments (replicate_of), confirm the relationship
// renders correctly (and inverse-labeled) on both sides, then group both
// into a series and confirm the series page lists them.
test("experiment relationships and series", async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);

  async function createBlankExperiment(name: string): Promise<string> {
    await page.goto("/new/blank");
    await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(name);
    await page.getByRole("button", { name: "Save experiment" }).click();
    await page.waitForURL(/\/experiments\/EXP-\d+/);
    return page.url().match(/EXP-\d+/)![0];
  }

  const nameA = `E2E relationship A ${Date.now()}`;
  const nameB = `E2E relationship B ${Date.now()}`;
  const idA = await createBlankExperiment(nameA);
  const idB = await createBlankExperiment(nameB);

  // Already on experiment B's page — link it as a replicate_of A.
  const relSection = page.locator(".obs-box", { has: page.locator("h4", { hasText: "Relationships" }) });
  await relSection.getByPlaceholder(/Other experiment ID/).fill(idA);
  await relSection.locator("select").first().selectOption("replicate_of");
  await relSection.getByRole("button", { name: "+ Add relationship" }).click();
  await expect(relSection.getByText(new RegExp(`replicate of.*${idA}`))).toBeVisible({ timeout: 15000 });

  // The inverse direction shows on A's own page.
  await page.goto(`/experiments/${idA}`);
  const relSectionA = page.locator(".obs-box", { has: page.locator("h4", { hasText: "Relationships" }) });
  await expect(relSectionA.getByText(new RegExp(`has a replicate.*${idB}`))).toBeVisible();

  // Group both into a series.
  const seriesName = `E2E series ${Date.now()}`;
  await page.goto("/series/new");
  await page.getByPlaceholder(/dose-response/).fill(seriesName);
  await page.getByRole("button", { name: "Create series" }).click();
  await page.waitForURL(/\/series\/[0-9a-f-]+$/);

  await page.getByPlaceholder(/Experiment ID/).fill(idA);
  await page.getByRole("button", { name: "Add experiment" }).click();
  await expect(page.getByText(idA, { exact: true })).toBeVisible({ timeout: 15000 });

  await page.getByPlaceholder(/Experiment ID/).fill(idB);
  await page.getByRole("button", { name: "Add experiment" }).click();
  await expect(page.getByText(idB, { exact: true })).toBeVisible({ timeout: 15000 });

  // Clean up: delete both draft experiments (cascades their relationships/series membership).
  for (const id of [idA, idB]) {
    await page.goto(`/experiments/${id}`);
    await page.getByRole("button", { name: "Delete draft", exact: true }).click();
    await page.getByRole("button", { name: "Confirm delete" }).click();
    await page.waitForURL(/\/experiments$/);
  }
});
