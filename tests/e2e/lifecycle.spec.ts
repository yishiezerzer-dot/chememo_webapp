import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.1 — full lifecycle journey: create -> start (criteria asked and locked)
// -> complete (conclusion asked) -> edit blocked -> reopen -> edit succeeds.
//
// Both gates are now questions asked at the moment they matter rather than
// fields buried in the Edit form, so this walks the prompts.
test("experiment lifecycle: start, complete, and reopen", async ({ page }) => {
  await signIn(page);

  await page.goto("/new/blank");
  const name = `E2E lifecycle test ${Date.now()}`;
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(name);
  await page.getByRole("button", { name: "Save experiment" }).click();

  await page.waitForURL(/\/experiments\/EXP-\d+/);
  const id = page.url().match(/EXP-\d+/)![0];
  await expect(page.getByText(name)).toBeVisible();
  await expect(page.getByText("Draft", { exact: true })).toBeVisible();

  // Start asks the question rather than refusing the click. Generous timeouts
  // below: each step is a real round trip to the dev Supabase project (not a
  // local/mocked DB), and router.refresh() after a lifecycle action re-fetches
  // the current route, both adding latency beyond Playwright's default.
  await page.getByRole("button", { name: "Start" }).click();
  await page
    .getByLabel("How will you know this worked?")
    .fill("Yield increases by at least 10%.");
  await page.getByRole("button", { name: "Start" }).last().click();
  await expect(page.getByText("In progress")).toBeVisible({ timeout: 15000 });

  // Complete asks for the conclusion in place, instead of sending the user to
  // the Edit form to satisfy §15.2 by trial and error.
  await page.getByRole("button", { name: "Complete" }).click();
  await page.getByLabel("What did you find?").fill("Yield increased by 14%.");
  await page.getByRole("button", { name: "Complete" }).last().click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible({ timeout: 15000 });

  // Edit is blocked on a locked record — the form isn't rendered at all.
  // Reload rather than a fresh goto, so this can't race the revalidation
  // the Complete click above just triggered.
  await page.waitForTimeout(500);
  await page.goto(`/experiments/${id}/edit`);
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('textarea[name="conclusion"]')).toHaveCount(0);

  // Reopen with a documented reason (§18.5).
  await page.getByRole("button", { name: "Reopen…" }).click();
  await page
    .getByPlaceholder("Why does this record need to change after completion?")
    .fill("Need to correct a typo in the conclusion.");
  await page.getByRole("button", { name: "Confirm reopen" }).click();
  await expect(page.locator('textarea[name="conclusion"]')).toHaveCount(1, { timeout: 15000 });

  // Cleanup — close the record out (in_progress -> failed -> archived is a
  // legal transition pair) so the test leaves no open record behind.
  await page.goto(`/experiments/${id}`);
  await page.getByRole("button", { name: "Close out…" }).click();
  await page.getByRole("button", { name: "Failed", exact: true }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();
});
