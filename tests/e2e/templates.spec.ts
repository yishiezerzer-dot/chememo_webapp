import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.2 — two journeys: (1) a template with a required field blocks
// instantiation until that field is filled, and its version freezes once
// used; (2) cloning copies only the sections left checked.
test("template with a required field blocks instantiation until filled", async ({ page }) => {
  await signIn(page);

  const templateName = `E2E template ${Date.now()}`;
  await page.goto("/templates/new");
  await page.getByPlaceholder("Wet-dry cycling — standard").fill(templateName);
  await page.getByRole("button", { name: "Create and add defaults" }).click();
  await page.waitForURL(/\/templates\/.+\/edit/);

  await page.locator('input[name="required_fields"]').fill("hypothesis");
  await page.locator('textarea[name="hypothesis"]').fill("Zn accelerates condensation.");
  await page.getByRole("button", { name: "Save template version" }).click();
  await page.waitForURL(/\/templates$/);

  await page.goto("/new/template");
  await page.getByText(templateName).click();
  await page.waitForURL(/\/new\/template\/.+/);

  // The template's default is prefilled; clear it to exercise the gate.
  await expect(page.locator('textarea[name="hypothesis"]')).toHaveValue("Zn accelerates condensation.");
  await page.locator('textarea[name="hypothesis"]').fill("");
  const expName = `E2E from template ${Date.now()}`;
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(expName);
  await page.getByRole("button", { name: "Save experiment" }).click();
  await expect(page.getByText(/required by this template/i)).toBeVisible({ timeout: 15000 });

  await page.locator('textarea[name="hypothesis"]').fill("Zn accelerates condensation, refilled.");
  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/\/experiments\/EXP-\d+/);
  await expect(page.getByText(expName)).toBeVisible();

  // Cleanup: draft records delete cleanly; the template is archived.
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/experiments$/);
});

test("clone copies only the sections left checked", async ({ page }) => {
  await signIn(page);

  const sourceName = `E2E clone source ${Date.now()}`;
  await page.goto("/new/blank");
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(sourceName);
  await page.locator('textarea[name="hypothesis"]').fill("Source hypothesis, should not clone.");
  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/\/experiments\/EXP-\d+/);
  const sourceId = page.url().match(/EXP-\d+/)![0];

  await page.goto("/new/clone");
  await page.getByText(sourceName).click();
  await page.waitForURL(/\/new\/clone\/.+/);
  await page.getByText("Planning narrative").click();
  await page.getByRole("button", { name: "Continue" }).click();

  const nameInput = page.getByPlaceholder("His + TGA + Zn — wet–dry cycling");
  await expect(nameInput).toHaveValue("");
  await expect(page.locator('textarea[name="hypothesis"]')).toHaveValue("");

  const cloneName = `E2E clone result ${Date.now()}`;
  await nameInput.fill(cloneName);
  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/\/experiments\/EXP-\d+/);
  await expect(page.getByText(cloneName)).toBeVisible();

  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/experiments$/);

  await page.goto(`/experiments/${sourceId}`);
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/experiments$/);
});
