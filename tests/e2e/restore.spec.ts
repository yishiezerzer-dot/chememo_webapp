import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.8 — edit an experiment (creating a revision), restore the prior
// version, confirm the field actually reverts and a reason was required;
// then lock the record and confirm restore is rejected until reopened.
test("revision diff and restore", async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);

  const originalName = `E2E restore original ${Date.now()}`;
  const editedName = `E2E restore edited ${Date.now()}`;

  await page.goto("/new/blank");
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(originalName);
  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/\/experiments\/EXP-\d+/);
  const id = page.url().match(/EXP-\d+/)![0];

  // Edit the name — creates one real revision.
  await page.goto(`/experiments/${id}/edit`);
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(editedName);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`/experiments/${id}$`));
  await expect(page.getByRole("heading", { name: editedName })).toBeVisible();

  // The history timeline shows the field-level diff for that edit.
  await expect(page.getByText(/name.*→/)).toBeVisible({ timeout: 15000 });

  // Confirm requires a non-blank reason.
  await page.getByRole("button", { name: "Restore this version" }).first().click();
  await expect(page.getByRole("button", { name: "Confirm restore" })).toBeDisabled();
  await page.getByPlaceholder(/always required/).fill("Reverting an accidental rename.");
  await page.getByRole("button", { name: "Confirm restore" }).click();

  // The name reverts to the original.
  await expect(page.getByRole("heading", { name: originalName })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/Restored a prior version/)).toBeVisible();

  // Lock the record (start requires acceptance criteria; complete requires a conclusion).
  await page.goto(`/experiments/${id}/edit`);
  await page.locator('textarea[name="acceptance_criteria"]').fill("Some criteria.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`/experiments/${id}$`));
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("In progress")).toBeVisible({ timeout: 15000 });
  await page.goto(`/experiments/${id}/edit`);
  await page.locator('textarea[name="conclusion"]').fill("Some conclusion.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`/experiments/${id}$`));
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible({ timeout: 15000 });

  // Restore is rejected on a locked record — the reason is accepted client-side,
  // but the underlying update (through the normal update path) is blocked by
  // the same lifecycle trigger a normal edit would hit.
  await page.getByRole("button", { name: "Restore this version" }).first().click();
  await page.getByPlaceholder(/always required/).fill("Trying to restore a locked record.");
  await page.getByRole("button", { name: "Confirm restore" }).click();
  await expect(page.getByText(/locked/i)).toBeVisible({ timeout: 15000 });

  // Cleanup — close the record out so this test leaves no open record behind.
  await page.getByRole("button", { name: "Close out…" }).click();
  await page.getByRole("button", { name: "Failed", exact: true }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
});
