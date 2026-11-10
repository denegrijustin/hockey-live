import { expect, test, type Page } from "@playwright/test";
import { DATA_NOW } from "./clock";

const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

test("the manifest declares identity, categories, shortcuts and separate any/maskable icons", async ({ request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.id).toBe("/");
  expect(m.lang).toBe("en");
  expect(m.display).toBe("standalone");
  expect(m.categories).toContain("sports");
  expect(m.shortcuts.map((s: { url: string }) => s.url)).toEqual(["/?view=games", "/?view=standings", "/?view=following"]);
  for (const icon of m.icons) expect(icon.purpose ?? "any", `${icon.src} never combines purposes`).toMatch(/^(any|maskable)$/);
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
  for (const icon of [...m.icons, ...m.shortcuts.flatMap((s: { icons: unknown[] }) => s.icons)] as { src: string; sizes: string; type: string }[]) {
    const res = await request.get(icon.src);
    expect(res.ok(), icon.src).toBe(true);
    if (icon.type !== "image/png") continue;
    const { w, h } = pngSize(await res.body());
    expect(`${w}x${h}`, `${icon.src} declared size matches its pixels`).toBe(icon.sizes);
  }
});

test("the worker is served, stamped with a build id, and /api is never routed", async ({ request }) => {
  const sw = await (await request.get("/sw.js")).text();
  expect(sw).toMatch(/const BUILD = "[0-9a-f]{10}"/);
  expect(sw).not.toContain("__BUILD_ID__");
  expect((await request.get("/sw-routes.js")).ok()).toBe(true);
  const routes = await (await request.get("/sw-routes.js")).text();
  expect(routes).toContain('"/api/"');
});

async function openGames(page: Page) {
  await page.clock.setFixedTime(DATA_NOW);
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/?view=games");
  await expect(page.locator(".game-card").first()).toBeVisible();
}

test("going offline shows the offline pill and banner at once, with the age of the saved scores", async ({ page, context }) => {
  await openGames(page);
  await context.setOffline(true);
  await expect(page.locator(".status-pill")).toContainText("offline");
  const banner = page.getByTestId("offline-banner");
  await expect(banner).toContainText("You are offline");
  await expect(banner).toContainText("last updated");
  await expect(banner).toContainText("may be out of date");
  await context.setOffline(false);
  await expect(page.getByTestId("offline-banner")).toHaveCount(0);
  await expect(page.locator(".status-pill")).not.toContainText("offline");
});

const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

for (const [name, w, h] of [["390x844", 390, 844], ["360x740", 360, 740], ["landscape 844x390", 844, 390]] as const) {
  test(`phone ${name}: no horizontal scroll, bell, search and navigation are reachable`, async ({ page, isMobile }) => {
    test.skip(!isMobile, "phone layouts");
    await page.setViewportSize({ width: w, height: h });
    await openGames(page);
    await noOverflow(page);
    const vp = page.viewportSize()!;
    const bell = page.locator('button[aria-label^="Notifications"]');
    for (const loc of [...((await bell.count()) ? [bell] : []), page.getByRole("button", { name: "Search" }), page.locator(".tab-bar .tab-item").first(), page.getByRole("button", { name: "More", exact: true })]) {
      await expect(loc).toBeVisible();
      const box = (await loc.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 0.5);
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
    // the tab bar sits fully inside the viewport (no clipped nav) even in landscape
    const bar = (await page.locator(".tab-bar").boundingBox())!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(vp.height + 0.5);
    await page.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await noOverflow(page);
  });
}
