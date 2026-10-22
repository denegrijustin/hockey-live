import { expect, test } from "@playwright/test";
import scoreboardFixture from "../fixtures/live-scoreboard.json" with { type: "json" };

// With the sidebar, desktop cards are narrow; their text must never break mid-word or run under the score.
for (const width of [1100, 1280, 1440, 1700, 1920]) {
  test(`cards at ${width}px keep names whole and scores clear of the text`, async ({ page, isMobile }) => {
    test.skip(!!isMobile, "desktop layout");
    await page.setViewportSize({ width, height: 1000 });
    await page.clock.setFixedTime(new Date("2026-10-10T12:00:00-05:00"));
    const games = scoreboardFixture.games.map((g, i) => ({ ...g, state: "LIVE", intermission: false, period: 2, periodType: "REG", clock: "15:27", awayScore: i, homeScore: i + 1 }));
    await page.route("**/api/live", (route) => route.fulfill({ json: { ...scoreboardFixture, games } }));
    await page.goto("/?view=games");
    await page.getByRole("button", { name: "All 32", exact: true }).click();
    await page.getByLabel("Competition").selectOption(String(games[0].type));
    await page.getByLabel("Window").selectOption("all");
    await expect(page.locator(".live-card").first()).toBeVisible();
    const problems = await page.evaluate(() => {
      const bad: string[] = [];
      for (const card of document.querySelectorAll(".game-card")) {
        for (const team of card.querySelectorAll(".matchup-team")) {
          const name = team.querySelector("h3") as HTMLElement;
          const box = team.querySelector(":scope > div") as HTMLElement;
          // A word wider than its box is being broken mid-word: let it overflow instead and compare.
          const before = name.style.overflowWrap;
          name.style.overflowWrap = "normal";
          name.style.wordBreak = "normal";
          if (name.scrollWidth > name.clientWidth + 1) bad.push(`"${name.textContent}" does not fit its box`);
          name.style.overflowWrap = before;
          const score = team.querySelector(":scope > b") as HTMLElement | null;
          if (score) {
            const [a, b] = [box.getBoundingClientRect(), score.getBoundingClientRect()];
            const text = [...box.querySelectorAll("small, span, h3")].map((e) => e.getBoundingClientRect());
            if (text.some((t) => t.right > b.left + 1 && t.left < b.right && t.top < b.bottom && t.bottom > b.top)) bad.push(`score runs into the text for "${name.textContent}"`);
            if (a.right > b.left + 1) bad.push(`score overlaps the team box for "${name.textContent}"`);
          }
          const record = team.querySelector(".team-record") as HTMLElement;
          if (record.getBoundingClientRect().height > 2.4 * parseFloat(getComputedStyle(record).lineHeight || "16")) bad.push(`record wraps to many lines for "${name.textContent}"`);
        }
      }
      return bad;
    });
    expect(problems).toEqual([]);
  });
}
