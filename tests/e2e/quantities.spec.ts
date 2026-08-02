import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.4 — set temperature via the value+unit control, add a named
// concentration, save, and confirm both persist distinctly (not merged into
// one free-text string) on reload.
test("structured temperature and concentration persist and round-trip", async ({ page }) => {
  await signIn(page);
  await page.goto("/new/blank");

  const name = `E2E quantities test ${Date.now()}`;
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(name);

  const temperatureField = page.locator(".field", { hasText: "Temperature" }).first();
  await temperatureField.locator('input[type="number"]').fill("60");

  const addConcentration = page.locator("select", { hasText: "Add a concentration" });
  await addConcentration.selectOption({ label: "Starting amino-acid concentration" });
  const concentrationRow = page.locator(".field", { hasText: "Concentrations" }).locator("div", {
    hasText: "Starting amino-acid concentration",
  }).first();
  await concentrationRow.locator('input[type="number"]').fill("50");

  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/\/experiments\/EXP-\d+/);

  await expect(page.getByText("60 Cel")).toBeVisible();
  await expect(page.getByText("50 mM")).toBeVisible();

  const id = page.url().match(/EXP-\d+/)![0];
  await page.goto(`/experiments/${id}/edit`);
  const editTemperatureField = page.locator(".field", { hasText: "Temperature" }).first();
  await expect(editTemperatureField.locator('input[type="number"]')).toHaveValue("60");

  await page.goto(`/experiments/${id}`);
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/experiments$/);
});
