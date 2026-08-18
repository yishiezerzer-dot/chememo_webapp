import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Local runs read E2E_TEST_EMAIL/PASSWORD from .env.local (gitignored); CI
// supplies them directly as workflow env vars, where this file won't exist.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// T0.6 — E2E smoke tests. Runs against a locally-started `next start`
// (production build) by default; set PLAYWRIGHT_BASE_URL to point at a
// deployed environment instead (e.g. the Railway dev URL) without a
// webServer of its own.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  // Deletes the rows this suite created, scoped to the dedicated e2e account.
  // Inert unless E2E_CLEANUP_ENABLED=true, so a manual run never quietly
  // removes anything — see the file header for the full safety argument.
  globalTeardown: "./tests/e2e/global-teardown.ts",
  fullyParallel: false,
  // All specs sign in with the same shared E2E test account; concurrent
  // logins from multiple workers raced and corrupted each other's sessions.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run build && npm run start",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
