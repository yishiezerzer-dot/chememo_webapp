import type { Page } from "@playwright/test";

export async function signIn(page: Page): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error("E2E_TEST_EMAIL/E2E_TEST_PASSWORD not configured.");
  }
  await page.goto("/login");
  await page.getByPlaceholder("you@mail.huji.ac.il").fill(email);
  await page.getByPlaceholder("••••••••").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
}

// The experiment page now leads with the log, and puts protocol steps,
// samples, analysis, conditions, controls, relationships, tasks and discussion
// behind one "Everything else" disclosure. Specs that drive those panels have
// to open it first, exactly as a scientist would. Safe to call more than once,
// and a no-op on a page that has no disclosure.
export async function openAdvanced(page: Page): Promise<void> {
  const panel = page.locator("details.fsec", { hasText: "Everything else" }).first();
  if ((await panel.count()) === 0) return;
  // Set `open` rather than clicking the summary: a click can land before the
  // page has hydrated and then do nothing, which is a flake that looks exactly
  // like a missing element. For a native <details> the two are equivalent.
  await panel.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
}

// The creation/edit form now leads with Identity and keeps the Plan section
// collapsed -- acceptance criteria, the protocol version, sample matrix and
// controls live there. Specs that fill any of those open it first.
export async function openFormPlan(page: Page): Promise<void> {
  const section = page.locator("details.fsec", { hasText: "Plan" }).first();
  if ((await section.count()) === 0) return;
  await section.evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
}
