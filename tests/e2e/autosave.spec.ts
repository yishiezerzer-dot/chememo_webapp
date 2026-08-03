import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.3 — crash recovery: autosave persists a draft (debounced ~2.5s),
// reloading the page (simulating a crash) offers to restore it, and
// restoring repopulates the field. The two-tab conflict scenario is covered
// directly at the RLS/SQL level (tests/rls/experiment-drafts.test.ts) rather
// than here — scripting two independent authenticated browser contexts
// reliably in one Playwright spec added more flakiness risk than the
// coverage was worth for this pass.
test("autosave persists a draft and restoring repopulates the form", async ({ page }) => {
  await signIn(page);
  await page.goto("/new/blank");

  const hypothesisText = `E2E autosave draft ${Date.now()}`;
  await page.locator('textarea[name="hypothesis"]').fill(hypothesisText);

  // Past the debounce window so the server-side draft save has landed.
  await page.waitForTimeout(3500);
  await page.reload();

  await expect(page.getByText(/Recover an unsaved draft/i)).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.locator('textarea[name="hypothesis"]')).toHaveValue(hypothesisText);

  // Restoring fires the draft-discard server call without awaiting it
  // (experiment-form.tsx) — give it a moment to actually land before
  // reloading, or the reload can race ahead of the delete.
  await page.waitForTimeout(2000);
  await page.reload();
  await expect(page.getByText(/Recover an unsaved draft/i)).not.toBeVisible();
});
