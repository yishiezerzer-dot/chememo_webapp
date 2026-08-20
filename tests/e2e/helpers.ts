import type { Page } from "@playwright/test";

export async function signIn(page: Page): Promise<void> {
  // TEMPORARY CI diagnostic -- surface browser-side errors in the CI log.
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") console.log(`[browser:${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => console.log(`[browser:pageerror] ${e.message}`));
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
