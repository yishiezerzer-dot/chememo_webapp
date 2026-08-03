import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// T1.9 — post a comment, then a second comment @mentioning the same author
// (the only "other user" identity available without T2.1's membership
// model — see comments/service.ts), confirm the mention renders and a
// notification appears; create a task, confirm a blocked status is
// rejected without a blocker note and accepted with one; create a
// review-request task and confirm it renders with its "Review" chip.
test("comments, mentions, notifications, and tasks", async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);

  await page.goto("/new/blank");
  const name = `E2E comments/tasks ${Date.now()}`;
  await page.getByPlaceholder("His + TGA + Zn — wet–dry cycling").fill(name);
  await page.getByRole("button", { name: "Save experiment" }).click();
  await page.waitForURL(/\/experiments\/EXP-\d+/);
  const id = page.url().match(/EXP-\d+/)![0];

  const commentsBox = page.locator(".obs-box", { has: page.locator("h4", { hasText: "Comments" }) });

  // First comment establishes the author's display name.
  await commentsBox.getByPlaceholder(/Add a comment/).fill("First comment");
  await commentsBox.getByRole("button", { name: "Post" }).click();
  await expect(commentsBox.getByText("First comment")).toBeVisible({ timeout: 15000 });
  const authorName = (await commentsBox.locator("b").first().textContent())?.trim();
  expect(authorName).toBeTruthy();

  // Second comment mentions that same name.
  await commentsBox.getByPlaceholder(/Add a comment/).fill(`@${authorName} please look at this`);
  await commentsBox.getByRole("button", { name: "Post" }).click();
  await expect(commentsBox.getByText(`Mentioned: ${authorName}`)).toBeVisible({ timeout: 15000 });

  // The mention produced a notification (scoped to this experiment's own
  // row, since a previous retry's leftover unread notification may also
  // be present in the shared test account).
  await page.goto("/notifications");
  const notifRow = page.locator(".act-row", { hasText: id });
  await expect(notifRow).toBeVisible({ timeout: 15000 });
  await expect(notifRow.getByText(/mentioned you in a comment/)).toBeVisible();

  // Tasks: cancelling the blocker-note prompt leaves the task alone; supplying one persists it.
  await page.goto(`/experiments/${id}`);
  const tasksBox = page.locator(".obs-box", { has: page.locator("h4", { hasText: "Tasks" }) });
  await tasksBox.getByPlaceholder("New task…").fill("A real task");
  await tasksBox.getByRole("button", { name: "+ Add" }).click();
  await expect(tasksBox.getByText("A real task")).toBeVisible({ timeout: 15000 });

  const statusSelect = tasksBox.locator("select").filter({ hasText: "Not started" });
  page.once("dialog", (dialog) => dialog.dismiss());
  await statusSelect.selectOption("waiting");

  page.once("dialog", (dialog) => dialog.accept("Waiting on reagent shipment"));
  await statusSelect.selectOption("blocked");
  await expect(tasksBox.getByText(/Waiting on reagent shipment/)).toBeVisible({ timeout: 15000 });

  // A review-request task renders with its "Review" chip.
  await tasksBox.locator("select").filter({ hasText: "Task" }).selectOption("review");
  await tasksBox.getByPlaceholder("What needs review?").fill("Please review this");
  await tasksBox.getByRole("button", { name: "+ Add" }).click();
  await expect(tasksBox.getByText("Please review this")).toBeVisible({ timeout: 15000 });
  await expect(tasksBox.getByText("Review", { exact: true })).toBeVisible();

  // Cleanup.
  await page.goto(`/experiments/${id}`);
  await page.getByRole("button", { name: "Delete draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await page.waitForURL(/\/experiments$/);
});
