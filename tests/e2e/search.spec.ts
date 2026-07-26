import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("global search filters the experiments table", async ({ page }) => {
  await signIn(page);

  await page.goto("/experiments");
  const search = page.getByLabel("Global search");
  await search.fill("Histidine");
  await search.press("Enter");

  await expect(page).toHaveURL(/\/experiments\?q=Histidine/);
  await expect(page.getByRole("heading", { name: "All experiments" })).toBeVisible();
});
