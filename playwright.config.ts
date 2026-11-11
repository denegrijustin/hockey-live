import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  // On CI a test that fails is run again (up to twice) before it counts: the suite is ~1,400 timing-sensitive browser tests on a shared runner,
  // and recent runs each failed a different one that passes on its own. A test that fails every attempt still fails the build; one that passes
  // on a retry is reported as "flaky" in the run log so it can be fixed. Locally nothing is retried.
  retries: process.env.CI ? 2 : 0,
  // The service worker is blocked so page.route() mocks see every request.
  use: { baseURL: "http://127.0.0.1:4174", headless: true, serviceWorkers: "block", colorScheme: "dark",
    // Layout tests measure a settled page, so they run with motion off (the app honours it); motion.spec.ts turns motion back on.
    reducedMotion: "reduce" },
  webServer: {
    command: "pnpm preview --port 4174",
    port: 4174,
    reuseExistingServer: true,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
