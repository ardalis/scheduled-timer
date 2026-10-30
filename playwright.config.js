import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 4173);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.js",
  fullyParallel: true,
  // Locally, leave room for everything else on the machine: more workers peg the
  // CPU for little gain, since the tests mostly wait on a browser.
  workers: process.env.CI ? undefined : "25%",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    // A fixed zone and locale keep scheduling and text assertions deterministic.
    timezoneId: "America/New_York",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  // Coverage is collected through Chromium's V8 profiler, so tests run in Chromium.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `node tests/support/static-server.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
