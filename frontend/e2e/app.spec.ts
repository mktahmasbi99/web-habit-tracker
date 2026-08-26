import { expect, test } from "@playwright/test";

test("creates and completes a habit", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await page.getByRole("button", { name: "Add habit" }).click();
  const dialog = page.getByRole("dialog", { name: "New habit" });
  await dialog.getByLabel("Habit name").fill(`E2E habit ${Date.now()}`);
  await dialog.getByRole("button", { name: "Add habit", exact: true }).click();
  await expect(page.getByRole("heading", { name: /E2E habit/ })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).last().click();
  await expect(page.getByRole("button", { name: "Done" }).last()).toHaveAttribute("aria-pressed", "true");
});

test("shows the import safeguards", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("heading", { name: "Import legacy database" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replace database" })).toBeDisabled();
});
