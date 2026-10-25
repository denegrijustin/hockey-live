import { test } from "@playwright/test";
const views = ["scoreboard", "games", "yesterday", "teamschedule", "injuries", "picks", "standings", "trends", "players", "nhlplus", "edge", "odds", "map"];
test("scan", async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 360, height: 740 });
  const out: string[] = [];
  for (const v of views) {
    await page.goto(`/?view=${v}`);
    await page.waitForTimeout(2500);
    const hits = await page.evaluate(() => {
      const res: string[] = [];
      for (const el of document.querySelectorAll("*")) {
        const cs = getComputedStyle(el);
        if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 1) res.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).split(" ")[0]} ${el.scrollWidth}>${el.clientWidth}`);
      }
      return res;
    });
    out.push(`${v}: ${hits.length ? hits.join(" | ") : "none"} | page ${await page.evaluate(() => document.documentElement.scrollWidth)}`);
  }
  console.log("SCAN\n" + out.join("\n"));
});
