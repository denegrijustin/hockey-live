import { expect, test } from "@playwright/test";

const open = async (page: any) => {
  await page.goto("/?view=nhlplus");
  const nav = page.getByRole("navigation", { name: "NHL+ views" });
  const phone = (page.viewportSize()?.width ?? 1000) <= 600;
  if (phone) await nav.getByRole("button").first().click();
  await nav.getByRole("button", { name: "Power rankings" }).click();
  await expect(page.locator(".pw-table")).toBeVisible({ timeout: 30000 });
};

test("Power rankings lists every team with its parts adding up to the power score, ranked best first", async ({ page }) => {
  await open(page);
  const rows = page.locator(".pw-table tbody tr");
  expect(await rows.count()).toBeGreaterThanOrEqual(30);
  const parse = (t: string) => parseFloat(t.replace("−", "-").replace("+", ""));
  const first = rows.first();
  const [power, chances, goalie, finish] = await Promise.all(["power", "chances", "goaltending", "finishing"].map(async (c) => parse(await first.locator(`td[data-col=${c}]`).innerText())));
  expect(Math.abs(chances + goalie + finish - power)).toBeLessThan(0.035);
  const ranks = (await page.locator(".pw-table tbody td.pw-rank").allInnerTexts()).map(Number);
  expect(ranks[0]).toBe(1);
  for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
});

test("Power rankings sorts by a heading, switches situation, and highlights a team", async ({ page }) => {
  await open(page);
  await page.locator(".pw-table thead").getByRole("button", { name: /^Goalie/ }).click();
  const vals = (await page.locator(".pw-table td[data-col=goaltending]").allInnerTexts()).map((t) => parseFloat(t.replace("−", "-")));
  for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeLessThanOrEqual(vals[i - 1] + 0.001);
  const before = await page.locator(".pw-table td[data-col=power]").first().innerText();
  await page.getByRole("group", { name: "Situation" }).getByRole("button", { name: "5-on-5" }).click();
  await expect(page.getByRole("group", { name: "Situation" }).getByRole("button", { name: "5-on-5" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(".pw-table tbody tr").count()).toBeGreaterThanOrEqual(30);
  void before;
  const row = page.locator(".pw-table tbody tr").first();
  await row.locator(".np-teambtn").click();
  await expect(page.locator(".pw-table tbody tr.highlighted")).toHaveCount(1);
});

for (const width of [320, 360, 390, 768, 1440]) {
  test(`Power rankings fits ${width}px with no sideways scroll and 44px team rows`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    const fit = await page.locator(".pw-wrap").evaluate((e) => ({ s: e.scrollWidth, c: e.clientWidth }));
    expect(fit.s).toBeLessThanOrEqual(fit.c + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const h = await page.locator(".pw-table tbody tr").first().evaluate((e) => e.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
  });
}
