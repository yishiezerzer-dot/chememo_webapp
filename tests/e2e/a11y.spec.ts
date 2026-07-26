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
