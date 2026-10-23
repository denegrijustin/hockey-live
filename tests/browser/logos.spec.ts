import { expect, test } from "@playwright/test";
import teams from "../../src/data/teams.json" with { type: "json" };

test("team logos are the vintage ones, with no broken images, and Utah shows the Coyotes mark", async ({ page }) => {
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/?view=games");
  await expect(page.locator(".game-card").first()).toBeVisible();
  await page.locator("img.team-logo").first().evaluate((e) => e.scrollIntoView());
  await page.waitForTimeout(500);
  const imgs = await page.locator("img.team-logo").evaluateAll((els) => els.map((e) => ({ src: e.getAttribute("src") ?? "", ok: (e as HTMLImageElement).complete ? (e as HTMLImageElement).naturalWidth > 0 : null, w: e.getAttribute("width"), h: e.getAttribute("height") })));
  expect(imgs.length).toBeGreaterThan(3);
  for (const i of imgs) {
    expect(i.src).toContain("/logos/retro/");
    expect(i.ok, i.src).not.toBe(false);
    expect(i.w && i.h, "logos have a fixed size").toBeTruthy();
  }
  // Every team's file loads (including Utah's, which is the Coyotes mark).
  for (const t of teams as { id: string }[]) {
    const res = await page.request.get(`/logos/retro/${t.id}.png`);
    expect(res.status(), t.id).toBe(200);
    expect(res.headers()["content-type"]).toContain("image/png");
  }
});

test("a logo that fails to load falls back to the current logo", async ({ page }) => {
  await page.route("**/logos/retro/BOS.png", (route) => route.fulfill({ status: 404, body: "" }));
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  await page.goto("/");
  await expect(page.locator(".sb-row").first()).toBeVisible();
  await page.goto("/?view=standings");
  const bos = page.locator('.table-team img.team-logo[data-team="BOS"]').first();
  await bos.evaluate((e) => e.scrollIntoView());
  await expect(bos).toHaveAttribute("src", "/logos/BOS.svg");
  await expect(bos).toHaveAttribute("data-ink", "light");
});

test("a logo that would blend into the page sits on a contrasting chip, in both themes", async ({ page }) => {
  await page.route("**/api/live", (route) => route.fulfill({ status: 503, body: "{}" }));
  const chip = (id: string) => page.locator(`img.team-logo[data-team="${id}"]`).first().evaluate((e) => getComputedStyle(e).backgroundColor);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/?view=standings");
  await page.locator('img.team-logo[data-team="PHI"]').first().evaluate((e) => e.scrollIntoView());
  expect(await chip("PHI")).not.toBe("rgba(0, 0, 0, 0)"); // dark ink on the dark theme
  expect(await chip("PIT")).toBe("rgba(0, 0, 0, 0)"); // light ink on the dark theme: no chip needed
  await page.emulateMedia({ colorScheme: "light" });
  expect(await chip("PIT")).not.toBe("rgba(0, 0, 0, 0)"); // light ink on the light theme
  expect(await chip("PHI")).toBe("rgba(0, 0, 0, 0)");
});
