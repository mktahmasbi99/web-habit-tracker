import { expect, test } from "@playwright/test";

test("creates and completes a habit", async ({ page }) => {
  const habitName = `E2E habit ${Date.now()}`;
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.getByRole("button", { name: "Add habit" }).click();
  const dialog = page.getByRole("dialog", { name: "New habit" });
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
  await expect(page.getByRole("heading", { name: "Import legacy database" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace database" })).toBeDisabled();
});
