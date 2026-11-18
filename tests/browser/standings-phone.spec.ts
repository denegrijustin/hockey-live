import { expect, test } from "@playwright/test";

// The Projected view has the most columns. On a phone every one of them must sit inside the panel, not run off its right edge.
for (const width of [430, 390, 360]) {
  test(`Standings, Projected view at ${width}px: every column is inside the panel and the page does not scroll sideways`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?view=standings");
    await page.getByRole("radio", { name: /projected/i }).first().click();
    const table = page.locator(".standings-table").first();
    await expect(table.locator("thead th", { hasText: "Proj" }).first()).toBeVisible();
    const m = await table.evaluate((t) => {
      const panel = t.closest(".panel")!.getBoundingClientRect(), r = t.getBoundingClientRect();
      const heads = [...t.querySelectorAll("thead th")].filter((e) => e.getClientRects().length).map((e) => { const b = e.getBoundingClientRect(); return { name: e.textContent, right: b.right }; });
      return { panelRight: panel.right, right: r.right, heads, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    });
    expect(m.right, "the table ends inside the panel").toBeLessThanOrEqual(m.panelRight + 1);
    for (const h of m.heads) expect(h.right, `${h.name} column is inside the panel`).toBeLessThanOrEqual(m.panelRight + 1);
    expect(m.sw).toBeLessThanOrEqual(m.cw);
    expect(m.heads.map((h) => h.name).join(" ")).toMatch(/P%/);
  });
}
