import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// The experiment form's <label> elements aren't programmatically associated
// with their inputs (no htmlFor/id pairing), so these tests locate fields by
// placeholder/role rather than getByLabel.
test("create and delete an experiment", async ({ page }) => {
  await signIn(page);

  await page.goto("/new");
  const name = `E2E create test ${Date.now()}`;
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(name);
  await page.getByRole("button", { name: "Save experiment" }).click();

  await page.waitForURL(/\/experiments\/EXP-\d+/);
  await expect(page.getByText(name)).toBeVisible();

  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/experiments$/);
  await expect(page.getByText(name)).not.toBeVisible();
});
