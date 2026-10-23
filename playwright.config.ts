import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
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
