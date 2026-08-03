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

// T1.6 — a saved view is a named snapshot of the current filter/sort/search
// state (URL query string, D5); saving it, navigating away, and reapplying
// it must reproduce the exact same filtered URL. buildExperimentQueryString's
// key order is fixed (q before sort/dir), so a plain substring match on the
// expected query string is enough — no need for an alternation regex.
test("saved view: save the current filter, navigate away, and reapply it", async ({ page }) => {
  await signIn(page);

  const viewName = `E2E view ${Date.now()}`;
  await page.goto("/experiments?q=Histidine&sort=name&dir=asc");

  await page.getByPlaceholder("Save this view as…").fill(viewName);
  await page.getByRole("button", { name: "Save view" }).click();
  await expect(page.getByRole("link", { name: viewName })).toBeVisible();

  await page.goto("/dashboard");
  await page.goto("/experiments");
  await expect(page.getByRole("link", { name: viewName })).toBeVisible();

  await page.getByRole("link", { name: viewName }).click();
  await expect(page).toHaveURL(/\/experiments\?q=Histidine.*sort=name.*dir=asc/);

  // Clean up so repeat runs don't accumulate saved views. Scoped to this
  // test's own view by name -- a plain page-wide "×" match breaks once any
  // other saved view exists (e.g. a leftover from an earlier failed run).
  await page.locator("span", { hasText: viewName }).getByText("×", { exact: true }).click();
});
