import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Serious/critical violations only — a starting gate, not full WCAG
// conformance (that's a larger, deliberate pass per the audit's a11y items).
async function assertNoSeriousViolations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
  expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
}

test("login page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/login");
  await assertNoSeriousViolations(page);
});

test("experiments list has no serious accessibility violations", async ({ page }) => {
  await signIn(page);
  await page.goto("/experiments");
  await assertNoSeriousViolations(page);
});

// T1.10 D6 — these two pages weren't scanned before; D3/D5 touched both.
test("ask page has no serious accessibility violations", async ({ page }) => {
  await signIn(page);
  await page.goto("/ask");
  await page.getByLabel("Ask a question").fill("wet-dry");
  await page.getByLabel("Ask a question").press("Enter");
  await expect(page.locator(".empty-state, .exp-table, .ai-summary-card").first()).toBeVisible({ timeout: 15000 });
  await assertNoSeriousViolations(page);
});

test("experiment detail page has no serious accessibility violations", async ({ page }) => {
  await signIn(page);
  await page.goto("/new/blank");
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(`E2E a11y ${Date.now()}`);
  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/\/experiments\/EXP-\d+/);
  await assertNoSeriousViolations(page);

  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/experiments$/);
});

// T1.10 D1 — sort headers are keyboard-operable (real links to the sorted URL).
test("table sort header is keyboard-operable", async ({ page }) => {
  await signIn(page);
  await page.goto("/experiments");
  const idHeader = page.locator("th.col-id .th-sort-btn");
  await idHeader.focus();
  await expect(page.locator("th.col-id")).toHaveAttribute("aria-sort", "none");
  await idHeader.press("Enter");
  // Sorting is a document request (T1.6 URL-backed list state), not a client
  // router.push — Next.js 16 can drop those the same way it drops refresh.
  await expect(page).toHaveURL(/sort=id/, { timeout: 15000 });
  await expect(page.locator("th.col-id")).toHaveAttribute("aria-sort", /ascending|descending/, { timeout: 15000 });
});
