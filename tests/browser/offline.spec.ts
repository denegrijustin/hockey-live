import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "allow" });

// With no signal the app shell and the saved /data copy come from the worker, so the board still opens.
test("the app opens offline after one visit", async ({ page, context }) => {
  await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/?view=games");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // this load is controlled by the worker, which caches what it fetches
  await expect(page.locator(".game-card").first()).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".game-card").first()).toBeVisible();
  await context.setOffline(false);
});

test("the install manifest and icons are served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.short_name).toBe("Iceboard");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  expect((await request.get("/apple-touch-icon.png")).ok()).toBe(true);
});
