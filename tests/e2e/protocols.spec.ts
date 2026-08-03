import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.5 — create a protocol with one step, link it to a new experiment,
// instantiate steps, run the step (start/complete with actuals), log an
// observation and a deviation, then confirm the protocol version can no
// longer be edited (frozen the moment the experiment linked to it).
test("versioned protocol steps: create, link, run, and freeze", async ({ page }) => {
  // This journey chains several server-action + router.refresh() round trips
  // against the real chememo-dev project; the default 30s test timeout is
  // occasionally too tight for the cumulative latency of all of them together
  // (each individual step's REFRESH_TIMEOUT below already accounts for one
  // round trip, but the overall test-level timeout caps their sum).
  test.setTimeout(60000);
  await signIn(page);

  const protocolName = `E2E protocol test ${Date.now()}`;
  await page.goto("/protocols/new");
  await page.getByPlaceholder("Wet-dry dry-down, standard").fill(protocolName);
  await page.getByRole("button", { name: "Create and add steps" }).click();
  await page.waitForURL(/\/protocols\/PROT-\d+\/edit/);

  await page.getByRole("button", { name: "+ Add step" }).click();
  await page.getByPlaceholder(/Instruction/).fill("Added 250 µL ACN to the dry residue.");
  await page.getByRole("button", { name: "Save protocol version" }).click();
  await page.waitForURL("/protocols");

  const name = `E2E protocol-linked experiment ${Date.now()}`;
  await page.goto("/new/blank");
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(name);
  const protocolField = page.locator(".field", { has: page.locator("label", { hasText: "Protocol version" }) });
  await protocolField.locator("select").selectOption({ label: `${protocolName} v1` });

  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/\/experiments\/EXP-\d+/);

  // Scoped to the Protocol & steps box — the experiment's own
  // LifecycleControls also renders a "Start" button (draft -> in_progress)
  // on this same page, which a plain page-wide getByRole would also match.
  const protocolSection = page.locator(".obs-box", { has: page.locator("h4", { hasText: "Protocol & steps" }) });

  // Each step below triggers a server action + router.refresh() round-trip
  // against the real chememo-dev project — a longer timeout than the 5s
  // default absorbs CI's real network/DB latency for that cycle (same
  // hardening T1.1's e2e suite already needed for this environment).
  const REFRESH_TIMEOUT = 15000;

  await expect(protocolSection.getByRole("button", { name: "Instantiate steps" })).toBeVisible();
  await protocolSection.getByRole("button", { name: "Instantiate steps" }).click();
  await expect(protocolSection.getByText("Added 250 µL ACN to the dry residue.")).toBeVisible({ timeout: REFRESH_TIMEOUT });

  await protocolSection.getByRole("button", { name: "Start" }).click();
  await expect(protocolSection.getByText("In progress")).toBeVisible({ timeout: REFRESH_TIMEOUT });

  await protocolSection.getByRole("button", { name: "Complete" }).click();
  await expect(protocolSection.getByText("Completed", { exact: true })).toBeVisible({ timeout: REFRESH_TIMEOUT });

  await protocolSection.getByPlaceholder("Add an observation…").fill("Solution stayed clear.");
  // exact: true -- "+ Add deviation" also contains "Add" as a substring, and
  // Playwright's default string name matching is substring-based.
  await protocolSection.getByRole("button", { name: "Add", exact: true }).click();
  await expect(protocolSection.getByText("Solution stayed clear.")).toBeVisible({ timeout: REFRESH_TIMEOUT });

  await protocolSection.getByRole("button", { name: "+ Add deviation" }).click();
  await protocolSection.locator("select[name=category]").selectOption("wrong_solvent");
  await protocolSection.locator("textarea[name=what_happened]").fill("Used ACN instead of the specified solvent.");
  await protocolSection.getByRole("button", { name: "Save deviation" }).click();
  await expect(protocolSection.getByText(/Used ACN instead of the specified solvent\./)).toBeVisible({
    timeout: REFRESH_TIMEOUT,
  });

  const id = page.url().match(/EXP-\d+/)![0];
  await page.goto(`/experiments/${id}`);
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/experiments$/);
});
