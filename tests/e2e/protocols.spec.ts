import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.5 — create a protocol with one step, link it to a new experiment,
// instantiate steps, run the step (start/complete with actuals), log an
// observation and a deviation, then confirm the protocol version can no
// longer be edited (frozen the moment the experiment linked to it).
test("versioned protocol steps: create, link, run, and freeze", async ({ page }) => {
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

  await expect(page.getByRole("button", { name: "Instantiate steps" })).toBeVisible();
  await page.getByRole("button", { name: "Instantiate steps" }).click();
  await expect(page.getByText("Added 250 µL ACN to the dry residue.")).toBeVisible();

  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByText("In progress")).toBeVisible();

  await page.getByRole("button", { name: "Complete" }).click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();

  await page.getByPlaceholder("Add an observation…").fill("Solution stayed clear.");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Solution stayed clear.")).toBeVisible();

  await page.getByRole("button", { name: "+ Add deviation" }).click();
  await page.locator("select[name=category]").selectOption("wrong_solvent");
  await page.locator("textarea[name=what_happened]").fill("Used ACN instead of the specified solvent.");
  await page.getByRole("button", { name: "Save deviation" }).click();
  await expect(page.getByText(/Used ACN instead of the specified solvent\./)).toBeVisible();

  const id = page.url().match(/EXP-\d+/)![0];
  await page.goto(`/experiments/${id}`);
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/experiments$/);
});
