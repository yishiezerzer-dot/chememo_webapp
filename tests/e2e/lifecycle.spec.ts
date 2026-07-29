import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.1 — full lifecycle journey: create -> plan -> start (criteria lock) ->
// complete (conclusion required) -> edit blocked -> reopen -> edit succeeds.
// The new Planning/Conclusions textareas have no associated <label> (same
// reason as experiment.spec.ts), so they're located by `name` attribute.
test("experiment lifecycle: start, complete, and reopen", async ({ page }) => {
  await signIn(page);

  await page.goto("/new");
  const name = `E2E lifecycle test ${Date.now()}`;
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(name);
  await page.locator('textarea[name="scientific_question"]').fill("Does Zn accelerate condensation?");
  await page.locator('textarea[name="acceptance_criteria"]').fill("Yield increases by at least 10%.");
  await page.getByRole("button", { name: "Save experiment" }).click();

  await page.waitForURL(/\/experiments\/EXP-\d+/);
  const id = page.url().match(/EXP-\d+/)![0];
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  // Start — acceptance criteria are already filled, so the trigger locks them.
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("In progress")).toBeVisible();

  // Completing without a conclusion is rejected by the trigger (§15.2).
  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByText(/conclusion is required/i)).toBeVisible();

  // Add the conclusion, then complete.
  await page.goto(`/experiments/${id}/edit`);
  await page.locator('textarea[name="conclusion"]').fill("Yield increased by 14%, hypothesis supported.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(new RegExp(`/experiments/${id}$`));

  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();

  // Edit is blocked on a locked record — the form isn't rendered at all.
  await page.goto(`/experiments/${id}/edit`);
  await expect(page.getByText(/locked/i)).toBeVisible();
  await expect(page.locator('textarea[name="conclusion"]')).toHaveCount(0);

  // Reopen with a documented reason (§18.5).
  await page.getByRole("button", { name: "Reopen…" }).click();
  await page
    .getByPlaceholder("Why does this record need to change after completion?")
    .fill("Need to correct a typo in the conclusion.");
  await page.getByRole("button", { name: "Confirm reopen" }).click();
  await expect(page.locator('textarea[name="conclusion"]')).toHaveCount(1);

  // Cleanup — close the record out (in_progress -> failed -> archived is a
  // legal transition pair) so the test leaves no open record behind.
  await page.goto(`/experiments/${id}`);
  await page.getByRole("button", { name: "Close out…" }).click();
  await page.getByRole("button", { name: "Failed", exact: true }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
});
