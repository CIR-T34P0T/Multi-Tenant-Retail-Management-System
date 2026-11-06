import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser against the running app and a real
 * Supabase (local stack or GitHub CI). Start both first, then `npm run test:e2e`.
 * CHROME_PATH lets the tests use an installed Chrome instead of downloading one.
 */
const executablePath = process.env.CHROME_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], launchOptions: { executablePath } },
      // The full suite runs on desktop; phones run the core journeys.
      grep: /@mobile/,
    },
  ],
});
