import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8000", trace: "on-first-retry", serviceWorkers: "block" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-safari", use: { ...devices["iPhone 15"] } },
    { name: "narrow-safari", use: { ...devices["iPhone SE"], viewport: { width: 320, height: 568 } } },
    { name: "landscape-safari", use: { ...devices["iPhone 15 landscape"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "narrow-chromium", use: { ...devices["Pixel 7"], viewport: { width: 320, height: 568 } } },
    { name: "landscape-chromium", use: { ...devices["Pixel 7"], viewport: { width: 844, height: 390 } } },
  ],
});
