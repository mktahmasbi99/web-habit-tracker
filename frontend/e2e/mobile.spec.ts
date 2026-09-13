import { expect, test, type Page } from "@playwright/test";

async function fixture(page: Page) {
  let today = "2026-09-08";
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = [];
    if (path === "/api/config") body = { today, timezone: "Europe/Warsaw" };
    if (/\/days\/.*\/habits$/.test(path)) body = [{ id: 1, name: "Read", status: "pending", currentStreak: 0, hasNote: false, startDate: "2026-01-01" }];
    if (path.endsWith("/note")) body = { habitId: 1, habitName: "Read", date: "2026-09-08", body: "", exists: false, archived: false };
    return route.fulfill({ json: body });
  });
  return { advance: () => { today = "2026-09-09"; } };
}

test("resume advances Today but preserves historical selection", async ({ page }) => {
  const clock = await fixture(page); await page.goto("/");
  await expect(page.getByText("2026-09-08", { exact: true })).toBeVisible();
  clock.advance(); await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("2026-09-09", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Previous day" }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "Yesterday" })).toBeVisible();
  await expect(page.getByText("2026-09-08", { exact: true })).toBeVisible();
});

test("late daily responses cannot replace the selected date", async ({ page }) => {
  await fixture(page);
  let release!: () => void; const delayed = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/days/2026-09-07/habits", async route => { await delayed; await route.fulfill({ json: [{ id: 2, name: "Stale habit", status: "pending" }] }).catch(() => {}); });
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Read" })).toBeVisible();
  await page.getByRole("button", { name: "Previous day" }).click();
  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page.getByRole("heading", { name: "Read" })).toBeVisible();
  release(); await expect(page.getByRole("heading", { name: "Stale habit" })).toHaveCount(0);
});

test("pending status writes block competing taps", async ({ page }) => {
  await fixture(page);
  let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }); let writes = 0;
  await page.route("**/status", async route => { writes++; await pending; await route.fulfill({ status: 204 }); });
  await page.goto("/"); await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Missed", exact: true })).toBeDisabled();
  await expect(page.getByText("Saving…", { exact: true })).toBeVisible();
  expect(writes).toBe(1); release();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeEnabled();
});

test("activity type uses large in-sheet radio choices", async ({ page }) => {
  await fixture(page); await page.goto("/");
  await page.getByRole("button", { name: "Add habit" }).click();
  const dialog = page.getByRole("dialog", { name: "New activity" });
  await expect(dialog.locator("select")).toHaveCount(0);
  const daily = dialog.getByRole("radio", { name: "Daily habit" });
  const timed = dialog.getByRole("radio", { name: "Timed activity" });
  await expect(daily).toBeChecked();
  for (const option of [daily, timed]) {
    const box = await option.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(19.9);
    const labelBox = await option.locator("xpath=..").boundingBox(); expect(labelBox!.height).toBeGreaterThanOrEqual(51.9);
  }
  await timed.check();
  await expect(timed).toBeChecked();
  await expect(dialog.getByRole("textbox", { name: "Activity name" })).toBeVisible();
});

test("calendar supports touch, focus containment, Escape and browser Back", async ({ page }) => {
  await fixture(page); await page.goto("/");
  const trigger = page.getByRole("button", { name: "Today 2026-09-08" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Calendar" });
  await expect(dialog).toBeVisible();
  const today = dialog.getByRole("button", { name: "2026-09-08", exact: true });
  await expect(today).toHaveAttribute("aria-current", "date");
  await expect(today).toHaveAttribute("aria-pressed", "true");
  const box = await today.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(43.9); expect(box!.height).toBeGreaterThanOrEqual(43.9);
  for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true); }
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click(); await page.goBack(); await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
});

test("navigation and large text fit without horizontal overflow", async ({ page }, testInfo) => {
  await fixture(page); await page.goto("/");
  const nav = page.getByRole("navigation");
  for (const name of ["Today", "Notes", "Manage", "Notifications", "More"]) {
    const button = nav.getByRole("button", { name, exact: true }); await expect(button).toBeInViewport();
    const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath("phone-layout.png") });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await expect(page.getByRole("heading", { name: "Read" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Add habit", exact: true }).click();
  const input = page.getByLabel("Habit name");
  await input.fill("A".repeat(200));
  expect(await input.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  await expect(page.getByRole("dialog").getByRole("button", { name: "Add habit", exact: true })).toBeVisible();
});

test("startup can retry after a connection failure", async ({ page }) => {
  await fixture(page); let fail = true;
  await page.route("**/api/config", route => fail ? route.abort() : route.fulfill({ json: { today: "2026-09-08", timezone: "Europe/Warsaw" } }));
  await page.goto("/"); await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  fail = false; await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("heading", { name: "Read" })).toBeVisible();
});

test("installed shell opens offline without caching API data", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Service-worker lifecycle is covered once in Chromium.");
  const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8000", serviceWorkers: "allow" });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cachedApi = await page.evaluate(async () => {
      const names = await caches.keys();
      const matches = await Promise.all(names.map(name => caches.open(name).then(cache => cache.match("/api/config"))));
      return matches.some(Boolean);
    });
    expect(cachedApi).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("You’re offline. Reconnect to the server, then retry.")).toBeVisible();
    await context.setOffline(false);
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("failed note reads remain dismissible and retryable", async ({ page }) => {
  await fixture(page); let fail = true;
  await page.route("**/note", route => fail ? route.abort() : route.fulfill({ json: { habitId: 1, habitName: "Read", date: "2026-09-08", body: "", exists: false } }));
  await page.goto("/"); await page.getByRole("button", { name: "Add note for Read" }).click();
  await expect(page.getByRole("button", { name: "Close note" })).toBeVisible();
  fail = false; await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("textbox", { name: "Note", exact: true })).toBeVisible();
});

test("unsaved notes survive rejected Back and reconnection", async ({ page }) => {
  await fixture(page); await page.goto("/");
  await page.getByRole("button", { name: "Add note for Read" }).click();
  const editor = page.getByRole("textbox", { name: "Note", exact: true }); await editor.fill("Keep my draft");
  page.once("dialog", dialog => dialog.dismiss()); await page.goBack();
  await expect(editor).toHaveValue("Keep my draft");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(editor).toHaveValue("Keep my draft");
  page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(editor).toHaveCount(0);
});

test("nested confirmations consume Back before the activity sheet", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/days/*/timed-activities", route => route.fulfill({ json: [{ id: 10, name: "Study", dayMinutes: 30, weekMinutes: 30, hasNote: false, archived: false }] }));
  await page.route("**/api/timed-activities/10/weeks/*", route => route.fulfill({ json: { days: [{ date: "2026-09-08", active: true, minutes: 30, entries: [] }] } }));
  await page.goto("/"); await page.getByRole("button", { name: "Open Study" }).click();
  const sheet = page.getByRole("dialog", { name: "Study" });
  await sheet.getByRole("button", { name: "More timed activity options" }).click();
  await sheet.getByRole("menuitem", { name: "Archive" }).click();
  await expect(page.getByRole("dialog", { name: "Archive timed activity" })).toBeVisible();
  await page.goBack(); await expect(page.getByRole("dialog", { name: "Archive timed activity" })).toHaveCount(0);
  await expect(sheet).toBeVisible(); await page.goBack(); await expect(sheet).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("calendar can jump back to today without completion markers", async ({ page }) => {
  await fixture(page);
  await page.goto("/"); await page.getByRole("button", { name: "Today 2026-09-08" }).click();
  const dialog = page.getByRole("dialog", { name: "Calendar" });
  await dialog.getByRole("button", { name: "2026-09-07", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Yesterday" })).toBeVisible();
  await page.getByRole("button", { name: "Yesterday 2026-09-07" }).click();
  const today = dialog.getByRole("button", { name: "2026-09-08", exact: true });
  await expect(today.locator(".done-dot, .missed-dot, .markers")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Jump to today" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
});

test("timed management details support direct URLs and browser Back", async ({ page }) => {
  await fixture(page);
  const activity = { id: 10, name: "Study", startDate: "2026-09-01", archived: false, noteCount: 0 };
  await page.route("**/api/timed-activities", route => route.fulfill({ json: [activity] }));
  await page.route("**/api/timed-activities/10", route => route.fulfill({ json: activity }));
  await page.goto("/"); await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByRole("button", { name: /Study/ }).click();
  await expect(page).toHaveURL(/\/timed-activities\/10$/);
  await expect(page.getByRole("heading", { name: "Study" })).toBeVisible();
  await page.goBack(); await expect(page.getByRole("button", { name: "Close timed activity details" })).toHaveCount(0);
  await page.goto("/timed-activities/10");
  await expect(page.getByRole("heading", { name: "Study" })).toBeVisible();
  await page.getByRole("button", { name: "Close timed activity details" }).click();
  await expect(page).toHaveURL("/");
});
