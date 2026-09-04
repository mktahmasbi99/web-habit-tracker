import { expect, test } from "@playwright/test";

test("creates and completes a habit", async ({ page }) => {
  const habitName = `E2E habit ${Date.now()}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.getByRole("button", { name: "Add habit" }).click();
  const dialog = page.getByRole("dialog", { name: "New activity" });
  await dialog.getByLabel("Habit name").fill(habitName);
  await dialog.getByRole("button", { name: "Add habit", exact: true }).click();
  const card = page.getByRole("heading", { name: habitName, exact: true }).locator("xpath=ancestor::article");
  await expect(card).toBeVisible();
  const doneButton = card.getByRole("button", { name: "Done", exact: true });
  await doneButton.click();
  await expect(doneButton).toHaveAttribute("aria-pressed", "true");
});

test("shows the import safeguards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("button", { name: "Create backup" })).toBeHidden();
  await page.getByRole("button", { name: "Backup and restore" }).click();
  await expect(page.getByRole("button", { name: "Create backup" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Server backups" })).toBeVisible();
  await page.getByRole("button", { name: "Advanced" }).click();
  await expect(page.getByRole("button", { name: "Save settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import legacy database" })).toBeHidden();
  await page.getByRole("button", { name: "Import legacy database" }).click();
  await expect(page.getByRole("heading", { name: "Import legacy database" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace database" })).toBeDisabled();
});

test("renames, archives, restores, and safely deletes a habit", async ({ page }) => {
  const original = `Manage ${Date.now()}`;
  const renamed = `${original} renamed`;
  await page.goto("/");
  await page.getByRole("button", { name: "Add habit" }).click();
  await page.getByRole("dialog", { name: "New activity" }).getByLabel("Habit name").fill(original);
  await page.getByRole("dialog", { name: "New activity" }).getByRole("button", { name: "Add habit", exact: true }).click();
  await page.getByRole("button", { name: `Open ${original}` }).click();
  await expect(page).toHaveURL(/\/habits\/\d+$/);

  await page.getByRole("button", { name: "Edit habit" }).click();
  await page.getByLabel("Habit name").fill(renamed);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: renamed })).toBeVisible();

  await page.getByRole("button", { name: "More habit options" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("dialog", { name: "Archive habit" }).getByRole("button", { name: "Archive habit" }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "More habit options" }).click();
  await page.getByRole("menuitem", { name: "Restore" }).click();
  const restore = page.getByRole("dialog", { name: "Restore habit" });
  await restore.getByRole("button", { name: "Restore habit" }).click();
  await expect(page.getByText("Archived", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "More habit options" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deletion = page.getByRole("dialog", { name: "Delete habit" });
  await deletion.getByLabel(/Type DELETE/).fill("delete");
  await expect(deletion.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
  await deletion.getByLabel(/Type DELETE/).fill("DELETE");
  await deletion.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: renamed })).toBeHidden();
});
