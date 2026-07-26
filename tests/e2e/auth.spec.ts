import { expect, test } from "@playwright/test";

test("unauthenticated visitors are redirected to /login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByPlaceholder("you@mail.huji.ac.il")).toBeVisible();
  await expect(page.getByPlaceholder("••••••••")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("sign in with valid credentials reaches the dashboard, then signs out", async ({ page }) => {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  test.skip(!email || !password, "E2E_TEST_EMAIL/E2E_TEST_PASSWORD not configured.");

  await page.goto("/login");
  await page.getByPlaceholder("you@mail.huji.ac.il").fill(email!);
  await page.getByPlaceholder("••••••••").fill(password!);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
});
